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
import { ApprovalError, verifyApprover } from "./approvals";
import { nextDocumentNumber } from "./documents";
import { ApprovalRequired, availableCredit } from "./sales";
import { getPosSettings, posWallets } from "./settings";

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
    },
  });
  if (!sale) return null;
  const settings = await getPosSettings();
  const days = daysBetweenShopDays(shopDay(sale.createdAt), shopDay(new Date()));
  return {
    id: sale.id,
    number: sale.number,
    createdAt: sale.createdAt,
    customerPhone: sale.customer?.phone ?? null,
    days,
    returnDays: settings.returnDays,
    lateNeedsApproval: days > settings.returnDays,
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
  reason: string | null;
  approval: { phone: string; password: string } | null;
}

/**
 * المرتجع (D-81): بالسعر الفعلي بعد الخصم، خلال مدة المرتجع (بعدها بموافقة). السليم يعود
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
  let approvedById: string | null = null;
  if (days > settings.returnDays) {
    const reason = `مرّ ${days} يوماً على الفاتورة (المدة ${settings.returnDays} أيام).`;
    if (!input.approval) throw new ApprovalRequired([reason]);
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
      const [shift] = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Shift" WHERE "userId" = ${cashierId} AND "closedAt" IS NULL FOR UPDATE`;
      if (!shift) throw new ReturnError("افتحي الوردية أولاً.");
      // قفل الفاتورة: مرتجعان متزامنان لا يُرجعان نفس القطعة مرتين
      await tx.$queryRaw`SELECT "id" FROM "Sale" WHERE "id" = ${input.saleId} FOR UPDATE`;
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
export async function cashOutCredit(returnId: string, cashierId: string): Promise<void> {
  const wallets = await posWallets();
  await prisma.$transaction(async (tx) => {
    const [shift] = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Shift" WHERE "userId" = ${cashierId} AND "closedAt" IS NULL FOR UPDATE`;
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
