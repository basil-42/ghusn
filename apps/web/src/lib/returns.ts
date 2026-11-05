import {
  daysBetweenShopDays,
  dec,
  refundForLine,
  roundMoney,
  shopDay,
  sum,
  weightedAverageCost,
  type Decimal,
} from "@ghusn/core";
import { Prisma, prisma } from "@ghusn/db";
import { roleCan } from "./auth/permissions";
import { nextDocumentNumber } from "./documents";
import { formatAmount } from "./format";
import { notify } from "./notifications";
import { kickPushDelivery } from "./push";
import { availableCredit } from "./sales";
import { getPosSettings, posWallets } from "./settings";
import type { ReturnReasonCode } from "./return-reasons";

export class ReturnError extends Error {}

/** «INV-2026-000012» أو «12» (السنة الحالية) أو آخر أرقامه. */
function normalizeInvoiceNumber(input: string): string {
  const v = input.trim().toUpperCase();
  if (/^\d{1,6}$/.test(v)) return `INV-${shopDay(new Date()).slice(0, 4)}-${v.padStart(6, "0")}`;
  return v;
}

/** فاتورة للإرجاع: الأسطر مع ما أُرجع منها سابقاً، ومدة المرتجع. */
export async function findSaleForReturn(input: string) {
  const number = normalizeInvoiceNumber(input);
  const sale = await prisma.sale.findUnique({
    where: { number },
    include: {
      lines: { orderBy: { sortOrder: "asc" }, include: { returnLines: true } },
      returns: { select: { id: true, number: true, createdAt: true, refundSdg: true } },
      customer: { select: { phone: true } },
      // آخر طلب مرتجع بعد المدة لم يُستخدم بعد (D-150)
      returnRequests: {
        where: { status: { in: ["PENDING", "APPROVED", "REJECTED"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { decidedBy: { select: { name: true } } },
      },
    },
  });
  if (!sale) return null;
  const settings = await getPosSettings();
  const days = daysBetweenShopDays(shopDay(sale.createdAt), shopDay(new Date()));
  const req = sale.returnRequests[0];
  return {
    id: sale.id,
    number: sale.number,
    createdAt: sale.createdAt,
    customerPhone: sale.customer?.phone ?? null,
    days,
    returnDays: settings.returnDays,
    lateNeedsApproval: days > settings.returnDays,
    request: req
      ? {
          id: req.id,
          status: req.status as "PENDING" | "APPROVED" | "REJECTED",
          reason: req.reason,
          decidedBy: req.decidedBy?.name ?? null,
          decisionNote: req.decisionNote,
        }
      : null,
    previousReturns: sale.returns.map((r) => ({ ...r, refundSdg: r.refundSdg.toString() })),
    lines: sale.lines.map((l) => {
      const returnedQty = sum(l.returnLines.map((r) => r.qty.toString()));
      return {
        id: l.id,
        label: l.label,
        qty: l.qty.toString(),
        netSdg: l.netSdg.toString(),
        returnedQty: returnedQty.toString(),
        remainingQty: dec(l.qty.toString()).minus(returnedQty).toString(),
      };
    }),
  };
}

export interface ReturnInput {
  /** معرّف من الجهاز (D-61): إعادة الإرسال لا تكرر المرتجع. */
  id: string;
  saleId: string;
  lines: { saleLineId: string; qty: string; damagedQty: string }[];
  mode: "REFUND" | "EXCHANGE";
  refundMethod: "CASH" | "BANKAK";
  reference: string | null;
  reasonCode: ReturnReasonCode;
  reason: string | null;
}

/**
 * المرتجع (D-81): بالسعر الفعلي بعد الخصم، خلال مدة المرتجع (بعدها باعتماد المالك لطلب مسبق — D-150). السليم يعود
 * للمخزون بتكلفته يوم البيع (ويُعاد حساب المتوسط)، والتالف يُسجَّل خسارة. الاسترداد نقداً
 * من الدرج أو بنكك، والاستبدال يحفظ المبلغ رصيداً لفاتورة جديدة.
 */
export async function createReturn(input: ReturnInput, cashierId: string): Promise<{ id: string; number: string }> {
  const existing = await prisma.saleReturn.findUnique({ where: { id: input.id }, select: { number: true } });
  if (existing) return { id: input.id, number: existing.number };

  const sale = await prisma.sale.findUnique({ where: { id: input.saleId } });
  if (!sale) throw new ReturnError("الفاتورة غير موجودة.");
  const settings = await getPosSettings();
  const days = daysBetweenShopDays(shopDay(sale.createdAt), shopDay(new Date()));
  const late = days > settings.returnDays;
  const wallets = await posWallets();
  const now = new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      const [shift] = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Shift" WHERE "closedAt" IS NULL ORDER BY "openedAt" ASC LIMIT 1 FOR UPDATE`;
      if (!shift) throw new ReturnError("افتحي الوردية أولاً.");
      // قفل الفاتورة: مرتجعان متزامنان لا يُرجعان نفس القطعة مرتين
      await tx.$queryRaw`SELECT "id" FROM "Sale" WHERE "id" = ${input.saleId} FOR UPDATE`;
      // بعد المدة: اعتماد المالك لطلب مسبق، يُستهلك مرة واحدة (D-150)
      let approvedById: string | null = null;
      let requestId: string | null = null;
      if (late) {
        const [req] = await tx.$queryRaw<{ id: string; decidedById: string | null }[]>`
          SELECT "id", "decidedById" FROM "ReturnRequest"
          WHERE "saleId" = ${input.saleId} AND "status" = 'APPROVED' AND "returnId" IS NULL
          ORDER BY "decidedAt" DESC LIMIT 1 FOR UPDATE`;
        if (!req) {
          throw new ReturnError(
            `مرّ ${days} يوماً على الفاتورة والمدة ${settings.returnDays} أيام — المرتجع يحتاج اعتماد المالك. أرسلي طلباً أولاً.`,
          );
        }
        approvedById = req.decidedById;
        requestId = req.id;
      }
      const lines = await tx.saleLine.findMany({
        where: { saleId: input.saleId },
        include: { returnLines: true, variant: { select: { product: { select: { unit: true } } } } },
      });
      const byId = new Map(lines.map((l) => [l.id, l]));
      const picked = input.lines.filter((l) => dec(l.qty).gt(0));
      if (picked.length === 0) throw new ReturnError("اختاري صنفاً واحداً على الأقل للإرجاع.");

      const number = await nextDocumentNumber(tx, "RET", now, 6);
      const rows: Prisma.SaleReturnLineCreateManyInput[] = [];
      const movements: Prisma.StockMovementCreateManyInput[] = [];
      const refunds: Decimal[] = [];
      const restock: Decimal[] = [];
      const damaged: Decimal[] = [];

      for (const p of [...picked].sort((a, b) => a.saleLineId.localeCompare(b.saleLineId))) {
        const line = byId.get(p.saleLineId);
        if (!line) throw new ReturnError("صنف ليس في هذه الفاتورة.");
        const qty = dec(p.qty);
        const bad = dec(p.damagedQty);
        if (bad.lt(0) || bad.gt(qty)) throw new ReturnError(`${line.label}: التالف لا يزيد عن المُرجع.`);
        if (line.variant.product.unit === "PIECE" && (!qty.isInteger() || !bad.isInteger())) {
          throw new ReturnError(`${line.label}: الكمية بالحبة عدد صحيح.`);
        }
        let refund: Decimal;
        try {
          refund = refundForLine({
            qty: line.qty.toString(),
            netSdg: line.netSdg.toString(),
            returnedQty: sum(line.returnLines.map((r) => r.qty.toString())),
            refundedSdg: sum(line.returnLines.map((r) => r.refundSdg.toString())),
            returnQty: qty,
          });
        } catch {
          throw new ReturnError(`${line.label}: الكمية أكثر من المتبقي في الفاتورة.`);
        }
        const unitCost = dec(line.unitCostUsd.toString());
        const good = qty.minus(bad);
        refunds.push(refund);
        restock.push(good.mul(unitCost));
        damaged.push(bad.mul(unitCost));
        rows.push({
          returnId: input.id,
          saleLineId: line.id,
          qty: qty.toFixed(),
          damagedQty: bad.toFixed(),
          refundSdg: refund.toFixed(2),
          unitCostUsd: unitCost.toFixed(6),
        });

        if (good.gt(0)) {
          // السليم يعود للمخزون بتكلفته يوم البيع — ويُعاد حساب المتوسط المرجّح
          await tx.$executeRaw`
            INSERT INTO "StockLevel" ("variantId", "qty", "avgCostUsd", "updatedAt")
            VALUES (${line.variantId}, 0, 0, now()) ON CONFLICT ("variantId") DO NOTHING`;
          const [level] = await tx.$queryRaw<{ qty: Prisma.Decimal; avgCostUsd: Prisma.Decimal }[]>`
            SELECT "qty", "avgCostUsd" FROM "StockLevel" WHERE "variantId" = ${line.variantId} FOR UPDATE`;
          const oldQty = level?.qty.toString() ?? "0";
          const avgAfter = weightedAverageCost({
            oldQty,
            oldAvgUsd: level?.avgCostUsd.toString() ?? "0",
            inQty: good,
            inUnitUsd: unitCost,
          });
          const qtyAfter = dec(oldQty).plus(good);
          await tx.stockLevel.update({
            where: { variantId: line.variantId },
            data: { qty: qtyAfter.toFixed(), avgCostUsd: avgAfter.toFixed(6) },
          });
          // تعود لأحدث دفعة للصنف (تبقى متاحة للصرف)
          const [batch] = await tx.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "StockBatch" WHERE "variantId" = ${line.variantId}
            ORDER BY "receivedAt" DESC LIMIT 1 FOR UPDATE`;
          if (batch) {
            await tx.stockBatch.update({
              where: { id: batch.id },
              data: { qtyRemaining: { increment: good.toFixed() } },
            });
          }
          movements.push({
            variantId: line.variantId,
            batchId: batch?.id ?? null,
            kind: "RETURN",
            qty: good.toFixed(),
            unitCostUsd: unitCost.toFixed(6),
            valueUsd: roundMoney(good.mul(unitCost)).toFixed(2),
            qtyAfter: qtyAfter.toFixed(),
            avgCostAfterUsd: avgAfter.toFixed(6),
            saleReturnId: input.id,
            note: `${number} ← ${sale.number}`,
            createdById: cashierId,
          });
        }
      }

      const refundSdg = sum(refunds);
      await tx.saleReturn.create({
        data: {
          id: input.id,
          number,
          saleId: input.saleId,
          shiftId: shift.id,
          cashierId,
          approvedById,
          reasonCode: input.reasonCode,
          reason: input.reason,
          refundSdg: refundSdg.toFixed(2),
          // عكس الإيراد بسعر يوم البيع
          refundUsd: roundMoney(refundSdg.div(sale.sdgPerUsd.toString())).toFixed(2),
          restockCostUsd: roundMoney(sum(restock)).toFixed(2),
          damagedCostUsd: roundMoney(sum(damaged)).toFixed(2),
          isExchange: input.mode === "EXCHANGE",
          createdAt: now,
        },
      });
      await tx.saleReturnLine.createMany({ data: rows });
      if (requestId) {
        await tx.returnRequest.update({ where: { id: requestId }, data: { status: "USED", returnId: input.id } });
      }
      if (movements.length) await tx.stockMovement.createMany({ data: movements });
      if (input.mode === "REFUND" && refundSdg.gt(0)) {
        await tx.returnRefund.create({
          data: {
            returnId: input.id,
            method: input.refundMethod,
            amountSdg: refundSdg.toFixed(2),
            walletId: input.refundMethod === "CASH" ? wallets.cash : wallets.bankak,
            reference: input.refundMethod === "BANKAK" ? input.reference : null,
            shiftId: shift.id,
          },
        });
      }
      return { id: input.id, number };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const saved = await prisma.saleReturn.findUnique({ where: { id: input.id }, select: { number: true } });
      if (saved) return { id: input.id, number: saved.number };
    }
    throw e;
  }
}

/** رصيد استبدال لم يُستخدم ← يُرد نقداً (العميل غيّر رأيه). */
export async function cashOutCredit(returnId: string): Promise<void> {
  const wallets = await posWallets();
  await prisma.$transaction(async (tx) => {
    const [shift] = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Shift" WHERE "closedAt" IS NULL ORDER BY "openedAt" ASC LIMIT 1 FOR UPDATE`;
    if (!shift) throw new ReturnError("افتحي الوردية أولاً.");
    await tx.$queryRaw`SELECT "id" FROM "SaleReturn" WHERE "id" = ${returnId} FOR UPDATE`;
    const left = await availableCredit(tx, returnId);
    if (left.lte(0)) throw new ReturnError("لا رصيد متبقٍ.");
    await tx.returnRefund.create({
      data: { returnId, method: "CASH", amountSdg: left.toFixed(2), walletId: wallets.cash, shiftId: shift.id },
    });
  });
}

/** إيصال المرتجع. */
export async function getReturn(id: string) {
  const r = await prisma.saleReturn.findUnique({
    where: { id },
    include: {
      sale: { select: { id: true, number: true } },
      cashier: { select: { name: true } },
      approvedBy: { select: { name: true } },
      lines: { include: { saleLine: { select: { label: true } } } },
      refunds: { orderBy: { createdAt: "asc" } },
      creditPayments: { include: { sale: { select: { id: true, number: true } } } },
    },
  });
  if (!r) return null;
  const credit = r.isExchange ? await availableCredit(prisma, id) : dec(0);
  return {
    id: r.id,
    number: r.number,
    createdAt: r.createdAt,
    cashierId: r.cashierId,
    cashierName: r.cashier.name,
    approvedBy: r.approvedBy?.name ?? null,
    sale: r.sale,
    reason: r.reason,
    reasonCode: r.reasonCode,
    isExchange: r.isExchange,
    refundSdg: r.refundSdg.toString(),
    creditLeftSdg: credit.toString(),
    lines: r.lines.map((l) => ({
      id: l.id,
      label: l.saleLine.label,
      qty: l.qty.toString(),
      damagedQty: l.damagedQty.toString(),
      refundSdg: l.refundSdg.toString(),
    })),
    refunds: r.refunds.map((x) => ({ method: x.method, amountSdg: x.amountSdg.toString(), reference: x.reference })),
    usedIn: r.creditPayments.map((p) => ({
      saleId: p.sale.id,
      number: p.sale.number,
      amountSdg: p.amountSdg.toString(),
    })),
  };
}

export async function listReturns(take = 50) {
  const rows = await prisma.saleReturn.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: {
      sale: { select: { number: true } },
      cashier: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    saleNumber: r.sale.number,
    createdAt: r.createdAt,
    cashierName: r.cashier.name,
    approvedBy: r.approvedBy?.name ?? null,
    refundSdg: r.refundSdg.toString(),
    isExchange: r.isExchange,
    damagedCostUsd: r.damagedCostUsd.toString(),
  }));
}

// ---------- مرتجع بعد المدة: طلب ← اعتماد المالك ← تُكمله الموظفة (D-150) ----------

type Actor = { id: string; name: string; role?: string | null };
const sdgText = (v: { toString(): string }) => `${formatAmount(v.toString(), 0)} ج.س`;

/** طلب اعتماد مرتجع بعد المدة. طلب منتظر لنفس الفاتورة لا يتكرر. */
export async function requestLateReturn(saleId: string, reason: string, user: Actor): Promise<void> {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { id: true, number: true, createdAt: true, totalSdg: true },
  });
  if (!sale) throw new ReturnError("الفاتورة غير موجودة.");
  const settings = await getPosSettings();
  const days = daysBetweenShopDays(shopDay(sale.createdAt), shopDay(new Date()));
  if (days <= settings.returnDays) throw new ReturnError("الفاتورة داخل مدة المرتجع — لا تحتاج اعتماداً.");
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Sale" WHERE "id" = ${saleId} FOR UPDATE`;
    const open = await tx.returnRequest.findFirst({
      where: { saleId, status: { in: ["PENDING", "APPROVED"] } },
      select: { status: true },
    });
    if (open) {
      throw new ReturnError(
        open.status === "PENDING" ? "الطلب مُرسل وينتظر الاعتماد." : "الطلب معتمد — أكملي المرتجع.",
      );
    }
    const req = await tx.returnRequest.create({ data: { saleId, requestedById: user.id, reason } });
    await notify(tx, {
      type: "RETURN_REQUEST",
      priority: "IMPORTANT",
      title: `مرتجع بعد المدة بانتظار اعتمادك · ${sale.number}`,
      body: [
        `${user.name}`,
        `بعد ${days} يوماً (المدة ${settings.returnDays})`,
        sdgText(sale.totalSdg),
        `«${reason}»`,
      ].join(" · "),
      href: `/admin/return-requests?focus=${req.id}`,
      dedupeKey: `RETURN_REQUEST:${req.id}`,
      audience: { saleReturn: ["approveLate"] },
    });
  });
  kickPushDelivery();
}

/** إلغاء طلب لم يُستخدم: من طلبته أو المالك. */
export async function cancelReturnRequest(id: string, user: Actor): Promise<void> {
  const req = await prisma.returnRequest.findUnique({ where: { id }, select: { requestedById: true } });
  if (!req) throw new ReturnError("الطلب غير موجود.");
  if (req.requestedById !== user.id && !roleCan(user.role, { saleReturn: ["approveLate"] })) {
    throw new ReturnError("لا يمكنك إلغاء هذا الطلب.");
  }
  const updated = await prisma.returnRequest.updateMany({
    where: { id, status: { in: ["PENDING", "APPROVED"] }, returnId: null },
    data: { status: "CANCELLED" },
  });
  if (!updated.count) throw new ReturnError("الطلب حُسم أو استُخدم — حدّثي الصفحة.");
}

/** قرار المالك: اعتماد أو رفض بسبب اختياري يصل لمن طلبت. أول قرار يحسم. */
export async function decideReturnRequest(
  id: string,
  decision: { approve: boolean; note: string | null },
  user: Actor,
): Promise<void> {
  if (!roleCan(user.role, { saleReturn: ["approveLate"] })) throw new ReturnError("الاعتماد للمالك.");
  await prisma.$transaction(async (tx) => {
    const updated = await tx.returnRequest.updateMany({
      where: { id, status: "PENDING" },
      data: {
        status: decision.approve ? "APPROVED" : "REJECTED",
        decidedById: user.id,
        decidedAt: new Date(),
        decisionNote: decision.approve ? null : decision.note,
      },
    });
    if (!updated.count) throw new ReturnError("الطلب حُسم أو أُلغي — حدّثي الصفحة.");
    const req = await tx.returnRequest.findUniqueOrThrow({
      where: { id },
      select: { requestedById: true, sale: { select: { number: true } } },
    });
    if (req.requestedById !== user.id) {
      await notify(tx, {
        type: "RETURN_REQUEST",
        priority: "IMPORTANT",
        title: decision.approve ? `اعتُمد المرتجع · ${req.sale.number}` : `رُفض المرتجع · ${req.sale.number}`,
        body: decision.approve
          ? `اعتمده ${user.name} — أكملي المرتجع الآن.`
          : `رفضه ${user.name}${decision.note ? ` · «${decision.note}»` : ""}`,
        href: `/pos/returns?invoice=${encodeURIComponent(req.sale.number)}`,
        dedupeKey: `RETURN_DECIDED:${id}`,
        to: [req.requestedById],
      });
    }
  });
  kickPushDelivery();
}

/** طلبات المرتجع للمالك: المنتظرة أولاً، ثم آخر ما حُسم. */
export async function listReturnRequests() {
  const include = {
    sale: { select: { id: true, number: true, createdAt: true, totalSdg: true } },
    requestedBy: { select: { name: true } },
    decidedBy: { select: { name: true } },
    saleReturn: { select: { id: true, number: true } },
  } satisfies Prisma.ReturnRequestInclude;
  const [pending, decided] = await Promise.all([
    prisma.returnRequest.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, include }),
    prisma.returnRequest.findMany({
      where: { status: { not: "PENDING" } },
      orderBy: { createdAt: "desc" },
      take: 30,
      include,
    }),
  ]);
  const map = (r: (typeof pending)[number]) => ({
    id: r.id,
    status: r.status,
    reason: r.reason,
    createdAt: r.createdAt,
    requestedBy: r.requestedBy.name,
    decidedBy: r.decidedBy?.name ?? null,
    decidedAt: r.decidedAt,
    decisionNote: r.decisionNote,
    saleNumber: r.sale.number,
    saleTotalSdg: r.sale.totalSdg.toString(),
    days: daysBetweenShopDays(shopDay(r.sale.createdAt), shopDay(r.createdAt)),
    returnNumber: r.saleReturn?.number ?? null,
    returnId: r.saleReturn?.id ?? null,
  });
  return { pending: pending.map(map), decided: decided.map(map) };
}

export async function countPendingReturnRequests(): Promise<number> {
  return prisma.returnRequest.count({ where: { status: "PENDING" } });
}
