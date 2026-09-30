import {
  CoreError,
  checkDiscount,
  computeSale,
  consumeBatches,
  dec,
  normalizePhone,
  roundMoney,
  searchTerms,
  applyExchangeCredit,
  settlePayments,
  sum,
  variantLabel,
  type Decimal,
  type PaymentMethod,
} from "@ghusn/core";
import { Prisma, prisma } from "@ghusn/db";
import { ApprovalError, verifyApprover } from "./approvals";
import { nextDocumentNumber } from "./documents";
import { currentSellingRate } from "./pricing";
import { getPosSettings, posWallets } from "./settings";

export class SaleError extends Error {}

/** البيع يحتاج موافقة: السبب يُعرض للموظفة، والواجهة تطلب رقم المديرة وكلمة سرها. */
export class ApprovalRequired extends Error {
  constructor(readonly reasons: string[]) {
    super(reasons.join(" "));
  }
}

const sellable = {
  deletedAt: null,
  isActive: true,
  product: { deletedAt: null, isActive: true, type: "STOCK" as const },
} satisfies Prisma.ProductVariantWhereInput;

/** صنف في نقطة البيع: الاسم والسعر والرصيد فقط (بلا تكلفة — يصل للموظفة). */
export interface PosItem {
  variantId: string;
  label: string;
  sku: string;
  barcode: string;
  unit: string;
  priceSdg: string | null;
  stockQty: string;
}

function toItem(v: Prisma.ProductVariantGetPayload<{ include: { product: true; stockLevel: true } }>): PosItem {
  return {
    variantId: v.id,
    label: [v.product.nameAr, variantLabel(v)].filter(Boolean).join(" · "),
    sku: v.sku,
    barcode: v.barcode,
    unit: v.product.unit,
    priceSdg: v.priceSdg ? dec(v.priceSdg.toString()).toFixed(0) : null,
    stockQty: v.stockLevel?.qty.toString() ?? "0",
  };
}

/** مسح الباركود أو SKU: تطابق تام أولاً، وإلا بحث بالاسم. */
export async function findPosItems(query: string): Promise<PosItem[]> {
  const code = query.trim();
  if (!code) return [];
  const exact = await prisma.productVariant.findMany({
    where: { ...sellable, OR: [{ barcode: code }, { sku: code.toUpperCase() }] },
    include: { product: true, stockLevel: true },
    take: 1,
  });
  if (exact.length) return exact.map(toItem);
  const terms = searchTerms(code);
  if (terms.length === 0) return [];
  const variants = await prisma.productVariant.findMany({
    where: { ...sellable, product: { ...sellable.product, AND: terms.map((t) => ({ searchText: { contains: t } })) } },
    include: { product: true, stockLevel: true },
    orderBy: [{ product: { nameAr: "asc" } }, { sortOrder: "asc" }],
    take: 12,
  });
  return variants.map(toItem);
}

export interface SaleInput {
  /** معرّف يولَّده الجهاز (D-61): إعادة الإرسال لا تكرر البيع. */
  id: string;
  lines: { variantId: string; qty: string; lineDiscountSdg: string }[];
  invoiceDiscountSdg: string;
  payments: { method: PaymentMethod; amountSdg: string; reference: string | null }[];
  cashTenderedSdg: string | null;
  customerPhone: string | null;
  customerName: string | null;
  approval: { phone: string; password: string } | null;
  /** استبدال: مرتجع رصيده يُستخدم في هذه الفاتورة (D-81). */
  creditReturnId: string | null;
}

/**
 * البيع (D-80): الأسعار والإجماليات تُحسب على الخادم من قاعدة البيانات (لا يُوثق بأرقام الجهاز)،
 * والمخزون يُصرف من الدفعات (FEFO) بمتوسط التكلفة، والدفع المقسوم يدخل محفظتي النقد وبنكك —
 * كله في معاملة واحدة. الخصم فوق الحد أو تحت التكلفة أو البيع بلا رصيد يحتاج موافقة.
 */
export async function createSale(input: SaleInput, cashierId: string): Promise<{ id: string; number: string }> {
  const existing = await prisma.sale.findUnique({ where: { id: input.id }, select: { number: true, cashierId: true } });
  if (existing) {
    if (existing.cashierId !== cashierId) throw new SaleError("معرّف فاتورة مستخدم.");
    return { id: input.id, number: existing.number };
  }

  const rate = await currentSellingRate();
  if (!rate) throw new SaleError("لا يوجد سعر للجنيه — اطلبي من المديرة إدخاله.");
  const ids = input.lines.map((l) => l.variantId);
  if (new Set(ids).size !== ids.length) throw new SaleError("صنف مكرر في الفاتورة — اجمعي الكمية في سطر واحد.");
  const variants = await prisma.productVariant.findMany({
    where: { ...sellable, id: { in: ids } },
    include: { product: true, stockLevel: true },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  for (const l of input.lines) {
    const v = byId.get(l.variantId);
    if (!v) throw new SaleError("صنف غير موجود أو غير معروض للبيع.");
    if (!v.priceSdg) throw new SaleError(`${v.product.nameAr}: لا سعر له بعد — اطلبي من المديرة اعتماد سعره.`);
    if (v.product.unit === "PIECE" && !dec(l.qty).isInteger()) {
      throw new SaleError(`${v.product.nameAr}: الكمية بالحبة عدد صحيح.`);
    }
  }

  let totals;
  try {
    totals = computeSale(
      input.lines.map((l) => ({
        key: l.variantId,
        qty: l.qty,
        unitPriceSdg: dec(byId.get(l.variantId)?.priceSdg?.toString() ?? "0").toFixed(0),
        lineDiscountSdg: l.lineDiscountSdg,
      })),
      input.invoiceDiscountSdg,
    );
  } catch (e) {
    if (e instanceof CoreError) throw new SaleError("الخصم أكبر من المبلغ أو الكمية غير صحيحة.");
    throw e;
  }

  // رصيد الاستبدال يُستهلك أولاً، والباقي يُدفع نقداً/بنكك، والفائض يُرد نقداً
  const credit = input.creditReturnId ? await availableCredit(prisma, input.creditReturnId) : null;
  const exchange = credit ? applyExchangeCredit(credit, totals.totalSdg) : null;

  let paid;
  try {
    paid = settlePayments({
      totalSdg: exchange ? exchange.dueSdg : totals.totalSdg,
      payments: input.payments,
      cashTenderedSdg: input.cashTenderedSdg,
    });
  } catch {
    throw new SaleError(
      `المدفوع يجب أن يساوي الإجمالي (${totals.totalSdg.toFixed(0)} ج.س)، والنقد المستلم لا يقل عن نصيب النقد.`,
    );
  }

  const customerPhone = input.customerPhone ? normalizePhone(input.customerPhone, "SD") : null;
  if (input.customerPhone && !customerPhone) throw new SaleError("رقم هاتف العميل غير صحيح.");

  // الموافقة: خصم فوق الحد، تحت التكلفة، أو رصيد لا يكفي
  const settings = await getPosSettings();
  const avg = (id: string) => byId.get(id)?.stockLevel?.avgCostUsd.toString() ?? "0";
  const discount = checkDiscount({
    subtotalSdg: totals.subtotalSdg,
    discountSdg: totals.discountSdg,
    maxDiscountPercent: settings.maxDiscountPercent,
    sdgPerUsd: rate,
    lines: totals.lines.map((l) => ({
      key: l.key,
      qty: input.lines.find((x) => x.variantId === l.key)?.qty ?? "0",
      netSdg: l.netSdg,
      avgCostUsd: avg(l.key),
    })),
  });
  const reasons: string[] = [];
  if (discount.overLimit) {
    reasons.push(`الخصم ${discount.discountRatio.mul(100).toFixed(1)}% فوق الحد (${settings.maxDiscountPercent}%).`);
  }
  if (discount.belowCost.length) {
    reasons.push(
      `السعر بعد الخصم تحت التكلفة: ${discount.belowCost.map((id) => byId.get(id)?.product.nameAr).join("، ")}.`,
    );
  }
  const short = input.lines.filter((l) => dec(byId.get(l.variantId)?.stockLevel?.qty.toString() ?? "0").lt(l.qty));
  if (short.length) {
    reasons.push(`الرصيد في النظام لا يكفي: ${short.map((l) => byId.get(l.variantId)?.product.nameAr).join("، ")}.`);
  }
  let approvedById: string | null = null;
  if (reasons.length) {
    if (!input.approval) throw new ApprovalRequired(reasons);
    try {
      approvedById = await verifyApprover(input.approval.phone, input.approval.password);
    } catch (e) {
      if (e instanceof ApprovalError) throw new ApprovalRequired([e.message]);
      throw e;
    }
  }

  const wallets = await posWallets();
  const now = new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      // قفل الوردية: لا تُغلق أثناء بيع، ولا بيع على وردية مغلقة
      const [shift] = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Shift" WHERE "userId" = ${cashierId} AND "closedAt" IS NULL FOR UPDATE`;
      if (!shift) throw new SaleError("افتحي الوردية أولاً.");

      if (input.creditReturnId && exchange && credit) {
        // قفل المرتجع: الرصيد لا يُستخدم مرتين
        await tx.$queryRaw`SELECT "id" FROM "SaleReturn" WHERE "id" = ${input.creditReturnId} FOR UPDATE`;
        const now = await availableCredit(tx, input.creditReturnId);
        if (!now.eq(credit)) throw new SaleError("رصيد الاستبدال تغيّر — حدّثي الصفحة.");
      }

      const customerId = customerPhone
        ? (
            await tx.customer.upsert({
              where: { phone: customerPhone },
              create: { phone: customerPhone, name: input.customerName },
              update: input.customerName ? { name: input.customerName } : {},
            })
          ).id
        : null;

      const number = await nextDocumentNumber(tx, "INV", now, 6);
      const lineInput = new Map(input.lines.map((l) => [l.variantId, l]));
      const costs: Decimal[] = [];
      const saleLines: Prisma.SaleLineCreateManyInput[] = [];
      const movements: Prisma.StockMovementCreateManyInput[] = [];

      // ترتيب ثابت للأقفال يمنع الجمود مع الاستلام وغيره
      const ordered = [...totals.lines].sort((a, b) => a.key.localeCompare(b.key));
      for (const l of ordered) {
        const v = byId.get(l.key);
        const qty = dec(lineInput.get(l.key)?.qty ?? "0");
        if (!v) throw new Error("variant vanished");
        const [level] = await tx.$queryRaw<{ qty: Prisma.Decimal; avgCostUsd: Prisma.Decimal }[]>`
          SELECT "qty", "avgCostUsd" FROM "StockLevel" WHERE "variantId" = ${l.key} FOR UPDATE`;
        const stockQty = dec(level?.qty.toString() ?? "0");
        const unitCost = dec(level?.avgCostUsd.toString() ?? "0");
        // فحص الرصيد تحت القفل: ربما باعت وردية أخرى آخر قطعة للتو
        if (stockQty.lt(qty) && !approvedById) {
          throw new ApprovalRequired([`الرصيد في النظام لا يكفي: ${v.product.nameAr}.`]);
        }

        const batches = await tx.$queryRaw<
          { id: string; qtyRemaining: Prisma.Decimal; expiresAt: Date | null; receivedAt: Date }[]
        >`SELECT "id", "qtyRemaining", "expiresAt", "receivedAt" FROM "StockBatch"
          WHERE "variantId" = ${l.key} AND "qtyRemaining" > 0 FOR UPDATE`;
        const { takes } = consumeBatches(
          batches.map((b) => ({
            id: b.id,
            qtyRemaining: b.qtyRemaining.toString(),
            expiresAt: b.expiresAt ? b.expiresAt.toISOString().slice(0, 10) : null,
            receivedAt: b.receivedAt,
          })),
          qty,
        );
        for (const t of takes) {
          await tx.stockBatch.update({
            where: { id: t.batchId },
            data: { qtyRemaining: { decrement: t.qty.toFixed() } },
          });
        }

        const qtyAfter = stockQty.minus(qty);
        if (level) {
          await tx.stockLevel.update({ where: { variantId: l.key }, data: { qty: qtyAfter.toFixed() } });
        } else {
          await tx.stockLevel.create({ data: { variantId: l.key, qty: qtyAfter.toFixed(), avgCostUsd: "0" } });
        }
        const costUsd = roundMoney(qty.mul(unitCost));
        costs.push(qty.mul(unitCost));
        saleLines.push({
          saleId: input.id,
          variantId: l.key,
          label: [v.product.nameAr, variantLabel(v)].filter(Boolean).join(" · "),
          qty: qty.toFixed(),
          unitPriceSdg: dec(v.priceSdg?.toString() ?? "0").toFixed(2),
          lineDiscountSdg: l.lineDiscountSdg.toFixed(2),
          invoiceDiscountSdg: l.invoiceDiscountSdg.toFixed(2),
          netSdg: l.netSdg.toFixed(2),
          unitCostUsd: unitCost.toFixed(6),
          costUsd: costUsd.toFixed(2),
          sortOrder: input.lines.findIndex((x) => x.variantId === l.key),
        });
        movements.push({
          variantId: l.key,
          batchId: takes.length === 1 ? takes[0]?.batchId : null,
          kind: "SALE",
          qty: qty.neg().toFixed(),
          unitCostUsd: unitCost.toFixed(6),
          valueUsd: costUsd.neg().toFixed(2),
          qtyAfter: qtyAfter.toFixed(),
          avgCostAfterUsd: unitCost.toFixed(6),
          saleId: input.id,
          override: stockQty.lt(qty),
          note: number,
          createdById: cashierId,
        });
      }

      await tx.sale.create({
        data: {
          id: input.id,
          number,
          shiftId: shift.id,
          cashierId,
          customerId,
          subtotalSdg: totals.subtotalSdg.toFixed(2),
          lineDiscountSdg: totals.lineDiscountSdg.toFixed(2),
          invoiceDiscountSdg: totals.invoiceDiscountSdg.toFixed(2),
          totalSdg: totals.totalSdg.toFixed(2),
          sdgPerUsd: rate,
          revenueUsd: roundMoney(totals.totalSdg.div(rate)).toFixed(2),
          cogsUsd: roundMoney(sum(costs)).toFixed(2),
          cashTenderedSdg: input.cashTenderedSdg ? dec(input.cashTenderedSdg).toFixed(2) : null,
          changeSdg: paid.changeSdg.toFixed(2),
          approvedById,
          createdAt: now,
        },
      });
      await tx.saleLine.createMany({ data: saleLines });
      await tx.stockMovement.createMany({ data: movements });
      await tx.salePayment.createMany({
        data: input.payments
          .filter((p) => dec(p.amountSdg).gt(0))
          .map((p) => ({
            saleId: input.id,
            method: p.method,
            amountSdg: dec(p.amountSdg).toFixed(2),
            walletId: p.method === "CASH" ? wallets.cash : wallets.bankak,
            reference: p.method === "BANKAK" ? p.reference : null,
          })),
      });
      if (input.creditReturnId && exchange) {
        if (exchange.usedSdg.gt(0)) {
          await tx.salePayment.create({
            data: {
              saleId: input.id,
              method: "CREDIT",
              amountSdg: exchange.usedSdg.toFixed(2),
              saleReturnId: input.creditReturnId,
            },
          });
        }
        if (exchange.cashBackSdg.gt(0)) {
          await tx.returnRefund.create({
            data: {
              returnId: input.creditReturnId,
              method: "CASH",
              amountSdg: exchange.cashBackSdg.toFixed(2),
              walletId: wallets.cash,
              shiftId: shift.id,
              saleId: input.id,
            },
          });
        }
      }
      return { id: input.id, number };
    });
  } catch (e) {
    // نفس الفاتورة أُرسلت مرتين في نفس اللحظة: الأولى نجحت
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const saved = await prisma.sale.findUnique({ where: { id: input.id }, select: { number: true } });
      if (saved) return { id: input.id, number: saved.number };
    }
    throw e;
  }
}

/** الإيصال: كل ما يُطبع (بلا تكلفة). */
export async function getReceipt(id: string) {
  const s = await prisma.sale.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      payments: true,
      cashier: { select: { name: true } },
      customer: { select: { phone: true, name: true } },
    },
  });
  if (!s) return null;
  const cashBack = await prisma.returnRefund.aggregate({ where: { saleId: s.id }, _sum: { amountSdg: true } });
  return {
    id: s.id,
    number: s.number,
    creditCashBackSdg: cashBack._sum.amountSdg?.toString() ?? "0",
    createdAt: s.createdAt,
    shiftId: s.shiftId,
    cashierId: s.cashierId,
    cashierName: s.cashier.name,
    customer: s.customer,
    subtotalSdg: s.subtotalSdg.toString(),
    discountSdg: dec(s.lineDiscountSdg.toString()).plus(s.invoiceDiscountSdg.toString()).toString(),
    totalSdg: s.totalSdg.toString(),
    cashTenderedSdg: s.cashTenderedSdg?.toString() ?? null,
    changeSdg: s.changeSdg.toString(),
    lines: s.lines.map((l) => ({
      id: l.id,
      label: l.label,
      qty: l.qty.toString(),
      unitPriceSdg: l.unitPriceSdg.toString(),
      lineDiscountSdg: l.lineDiscountSdg.toString(),
      // مبلغ السطر على الإيصال: الكمية × السعر − خصم الصنف (خصم الفاتورة يظهر في الإجمالي)
      amountSdg: dec(l.qty.toString())
        .mul(l.unitPriceSdg.toString())
        .toDecimalPlaces(0)
        .minus(l.lineDiscountSdg.toString())
        .toString(),
      netSdg: l.netSdg.toString(),
    })),
    payments: s.payments.map((p) => ({ method: p.method, amountSdg: p.amountSdg.toString(), reference: p.reference })),
  };
}

/** قائمة المبيعات للمالك والمديرة، مع الإيراد والربح الإجمالي بالدولار. */
export async function listSales(take = 100) {
  const sales = await prisma.sale.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: { cashier: { select: { name: true } }, approvedBy: { select: { name: true } } },
  });
  return sales.map((s) => ({
    id: s.id,
    number: s.number,
    createdAt: s.createdAt,
    cashierName: s.cashier.name,
    approvedBy: s.approvedBy?.name ?? null,
    totalSdg: s.totalSdg.toString(),
    discountSdg: dec(s.lineDiscountSdg.toString()).plus(s.invoiceDiscountSdg.toString()).toString(),
    revenueUsd: s.revenueUsd.toString(),
    profitUsd: dec(s.revenueUsd.toString()).minus(s.cogsUsd.toString()).toString(),
  }));
}

type Db = Prisma.TransactionClient | typeof prisma;

/** رصيد استبدال متاح = المسترد − ما رُدّ نقداً/بنكك − ما استُخدم في فواتير. */
export async function availableCredit(db: Db, returnId: string): Promise<Decimal> {
  const r = await db.saleReturn.findUnique({
    where: { id: returnId },
    select: { isExchange: true, refundSdg: true },
  });
  if (!r?.isExchange) throw new SaleError("مرتجع الاستبدال غير موجود.");
  const [refunded, used] = await Promise.all([
    db.returnRefund.aggregate({ where: { returnId }, _sum: { amountSdg: true } }),
    db.salePayment.aggregate({ where: { saleReturnId: returnId }, _sum: { amountSdg: true } }),
  ]);
  return dec(r.refundSdg.toString())
    .minus(refunded._sum.amountSdg?.toString() ?? "0")
    .minus(used._sum.amountSdg?.toString() ?? "0");
}
