import { roundMoney, sum, toUsdExact } from "@ghusn/core";
import { prisma } from "@ghusn/db";
import { getRateAt } from "./exchange-rates";
import { safeShiftFor, voidShiftFor } from "./shifts";

export class CapitalError extends Error {}

/** مال دخل المحل من خارجه (تمويل) — يزيد المحفظة فقط؛ رأس المال واسترداده خارج النظام (D-142). */
export async function listContributions() {
  const rows = await prisma.capitalContribution.findMany({
    orderBy: { contributedAt: "desc" },
    include: { createdBy: { select: { name: true } }, wallet: { select: { name: true } } },
  });
  return rows.map((c) => ({
    wallet: c.wallet?.name ?? null,
    id: c.id,
    partnerName: c.partnerName,
    amount: c.amount.toString(),
    currencyCode: c.currencyCode,
    rateUsed: c.rateUsed.toString(),
    amountUsd: c.amountUsd.toString(),
    contributedAt: c.contributedAt,
    note: c.note,
    createdBy: c.createdBy?.name ?? null,
    voided: c.voidedAt ? { reason: c.voidReason } : null,
  }));
}

export async function totalCapitalUsd(until?: Date): Promise<string> {
  const rows = await prisma.capitalContribution.findMany({
    where: { voidedAt: null, ...(until ? { contributedAt: { lt: until } } : {}) },
    select: { amountUsd: true },
  });
  return roundMoney(sum(rows.map((r) => r.amountUsd.toString()))).toFixed(2);
}

export async function addContribution(
  input: {
    partnerName: string;
    amount: string;
    walletId: string;
    contributedAt: Date;
    note: string | null;
  },
  userId: string,
): Promise<void> {
  // «مال دخل المحل» دائماً إلى علبة (D-144): يزيد رصيدها، والعملة عملتها. ما دُفع مباشرة لمورد أو
  // لتكلفة شحنة يُسجَّل هناك «دُفع من خارج المحل» (D-143)
  const wallet = await prisma.wallet.findFirst({ where: { id: input.walletId, isActive: true } });
  if (!wallet) throw new CapitalError("اختر العلبة التي دخلها المال.");
  const currencyCode = wallet.currencyCode;
  const rate = await getRateAt(currencyCode, input.contributedAt);
  if (!rate) throw new CapitalError(`لا يوجد سعر صرف لـ ${currencyCode} في ذلك اليوم.`);
  await prisma.$transaction(async (tx) => {
    // إلى الخزنة ← على الوردية المفتوحة: يزيد النقد المتوقع في الدرج (D-143)
    const shiftId = await safeShiftFor(tx, input.walletId, input.contributedAt, (m) => new CapitalError(m));
    await tx.capitalContribution.create({
      data: {
        shiftId,
        partnerName: input.partnerName,
        amount: input.amount,
        currencyCode,
        rateUsed: rate,
        amountUsd: roundMoney(toUsdExact(input.amount, rate)).toFixed(2),
        walletId: input.walletId,
        contributedAt: input.contributedAt,
        note: input.note,
        createdById: userId,
      },
    });
  });
}

export async function voidContribution(id: string, reason: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const c = await tx.capitalContribution.findFirst({ where: { id, voidedAt: null }, select: { shiftId: true } });
    if (!c) throw new CapitalError("غير موجود أو ملغى.");
    // إلى خزنة وردية مغلقة ← يُرد من الوردية المفتوحة الآن (D-143)
    const voidShiftId = await voidShiftFor(tx, c.shiftId);
    const r = await tx.capitalContribution.updateMany({
      where: { id, voidedAt: null },
      data: { voidedAt: new Date(), voidReason: reason, voidShiftId },
    });
    if (r.count === 0) throw new CapitalError("غير موجود أو ملغى.");
  });
}
