import { roundMoney, sum, toUsdExact } from "@ghusn/core";
import { prisma } from "@ghusn/db";
import { getRateAt } from "./exchange-rates";

export class CapitalError extends Error {}

/** تمويل الشركاء — يُسترد من الربح قبل أي توزيع (D-83). */
export async function listContributions() {
  const rows = await prisma.capitalContribution.findMany({
    orderBy: { contributedAt: "desc" },
    include: { createdBy: { select: { name: true } } },
  });
  return rows.map((c) => ({
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
  input: { partnerName: string; amount: string; currencyCode: string; contributedAt: Date; note: string | null },
  userId: string,
): Promise<void> {
  const rate = await getRateAt(input.currencyCode, input.contributedAt);
  if (!rate) throw new CapitalError(`لا يوجد سعر صرف لـ ${input.currencyCode} في ذلك اليوم.`);
  await prisma.capitalContribution.create({
    data: {
      partnerName: input.partnerName,
      amount: input.amount,
      currencyCode: input.currencyCode,
      rateUsed: rate,
      amountUsd: roundMoney(toUsdExact(input.amount, rate)).toFixed(2),
      contributedAt: input.contributedAt,
      note: input.note,
      createdById: userId,
    },
  });
}

export async function voidContribution(id: string, reason: string): Promise<void> {
  const r = await prisma.capitalContribution.updateMany({
    where: { id, voidedAt: null },
    data: { voidedAt: new Date(), voidReason: reason },
  });
  if (r.count === 0) throw new CapitalError("غير موجود أو ملغى.");
}
