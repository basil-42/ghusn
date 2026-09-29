import { dec, replaySupplierLedger, roundMoney, toLatinDigits, toUsdExact, type Decimal } from "@ghusn/core";
import { prisma, type SupplierEntryKind } from "@ghusn/db";
import { z } from "zod";
import { getRateAt } from "./exchange-rates";

export const COUNTRIES: Record<string, string> = {
  SD: "السودان",
  QA: "قطر",
  SA: "السعودية",
  AE: "الإمارات",
  EG: "مصر",
  CN: "الصين",
  TR: "تركيا",
  OTHER: "أخرى",
};

export const ENTRY_LABELS: Record<SupplierEntryKind, string> = {
  OPENING_BALANCE: "رصيد افتتاحي",
  PURCHASE: "شحنة",
  PAYMENT: "دفعة",
};

export class SupplierError extends Error {}

/** مبلغ يُكتب في نموذج: أرقام عربية أو لاتينية، فواصل آلاف، حتى خانتين عشريتين. */
export const amountField = (label: string) =>
  z
    .string()
    .transform((v) =>
      toLatinDigits(v)
        .replace(/[,\s٬]/g, "")
        .replace("٫", "."),
    )
    .refine((v) => /^\d{1,13}(\.\d{1,2})?$/.test(v), `${label}: اكتبي رقماً (حتى خانتين عشريتين)`)
    .refine((v) => !/^\d{1,13}(\.\d{1,2})?$/.test(v) || dec(v).gt(0), `${label}: يجب أن يكون أكبر من صفر`);

// ---------- الرصيد وكشف الحساب ----------

type EntryRow = Awaited<ReturnType<typeof loadEntries>>[number];

function loadEntries(supplierId: string) {
  return prisma.supplierLedgerEntry.findMany({
    where: { supplierId },
    orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
    include: {
      wallet: { select: { name: true } },
      createdBy: { select: { name: true } },
      voidedBy: { select: { name: true } },
    },
  });
}

/** القيمة الدقيقة بالدولار للحركة: الدفعة بما خرج من المحفظة، والبقية بسعرها. */
function exactUsd(e: Pick<EntryRow, "kind" | "amount" | "rateUsed" | "paidAmount" | "paidRate">): Decimal {
  if (e.kind === "PAYMENT" && e.paidAmount && e.paidRate) {
    return toUsdExact(e.paidAmount.toString(), e.paidRate.toString()).neg();
  }
  return toUsdExact(e.amount.toString(), e.rateUsed.toString());
}

/** يعيد تشغيل الحركات غير الملغاة بالترتيب (الملغاة تظهر في الكشف بلا أثر على الرصيد). */
function replay(entries: EntryRow[]) {
  const active = entries.filter((e) => !e.voidedAt);
  const result = replaySupplierLedger(active.map((e) => ({ id: e.id, amount: e.amount.toString(), usd: exactUsd(e) })));
  const byId = new Map(result.lines.map((l) => [l.entry.id, l]));
  return { result, byId };
}

export async function listSuppliers() {
  const suppliers = await prisma.supplier.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    include: {
      currency: { select: { code: true, symbol: true, decimals: true, nameAr: true } },
      entries: {
        where: { voidedAt: null },
        orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
        select: { id: true, kind: true, amount: true, rateUsed: true, paidAmount: true, paidRate: true, dueDate: true },
      },
    },
  });
  return suppliers.map((s) => {
    const r = replaySupplierLedger(s.entries.map((e) => ({ amount: e.amount.toString(), usd: exactUsd(e) })));
    return {
      id: s.id,
      name: s.name,
      country: s.country,
      isActive: s.isActive,
      currency: s.currency,
      balance: r.balance.toString(),
      balanceUsd: r.balanceUsd.toString(),
    };
  });
}

export async function getSupplierStatement(id: string) {
  const supplier = await prisma.supplier.findFirst({
    where: { id, deletedAt: null },
    include: { currency: { select: { code: true, symbol: true, decimals: true, nameAr: true } } },
  });
  if (!supplier) return null;
  const entries = await loadEntries(id);
  const { result, byId } = replay(entries);

  return {
    supplier: {
      id: supplier.id,
      name: supplier.name,
      country: supplier.country,
      phone: supplier.phone,
      notes: supplier.notes,
      isActive: supplier.isActive,
      currency: supplier.currency,
      hasEntries: entries.length > 0,
    },
    balance: result.balance.toString(),
    balanceUsd: result.balanceUsd.toString(),
    realizedFxUsd: result.realizedFxUsd.toString(),
    // الكشف: الأحدث أولاً، مع الرصيد بعد كل حركة
    lines: entries
      .map((e) => {
        const line = byId.get(e.id);
        return {
          id: e.id,
          kind: e.kind,
          occurredAt: e.occurredAt,
          amount: e.amount.toString(),
          amountUsd: e.amountUsd.toString(),
          walletName: e.wallet?.name ?? null,
          paidAmount: e.paidAmount?.toString() ?? null,
          paidCurrencyCode: e.paidCurrencyCode,
          reference: e.reference,
          note: e.note,
          dueDate: e.dueDate,
          createdBy: e.createdBy?.name ?? null,
          voided: e.voidedAt ? { at: e.voidedAt, by: e.voidedBy?.name ?? null, reason: e.voidReason } : null,
          balance: line?.balance.toString() ?? null,
          realizedFxUsd: line && !line.realizedFxUsd.isZero() ? line.realizedFxUsd.toString() : null,
        };
      })
      .reverse(),
  };
}

// ---------- الكتابة ----------

async function rateOrThrow(currencyCode: string, at: Date): Promise<string> {
  const rate = await getRateAt(currencyCode, at);
  if (!rate)
    throw new SupplierError(`لا يوجد سعر صرف لـ ${currencyCode} في ذلك التاريخ. أدخليه من شاشة سعر الصرف أولاً.`);
  return rate;
}

export async function createSupplier(
  input: {
    name: string;
    country: string;
    currencyCode: string;
    phone: string | null;
    notes: string | null;
    opening: { amount: string; direction: "OWE" | "CREDIT"; at: Date } | null;
  },
  userId: string,
): Promise<string> {
  const currency = await prisma.currency.findUnique({ where: { code: input.currencyCode } });
  if (!currency?.isActive) throw new SupplierError("عملة غير متاحة.");
  const opening = input.opening;
  const rate = opening ? await rateOrThrow(input.currencyCode, opening.at) : null;

  return prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.create({
      data: {
        name: input.name,
        country: input.country,
        currencyCode: input.currencyCode,
        phone: input.phone,
        notes: input.notes,
      },
    });
    if (opening && rate) {
      const amount = opening.direction === "OWE" ? dec(opening.amount) : dec(opening.amount).neg();
      await tx.supplierLedgerEntry.create({
        data: {
          supplierId: supplier.id,
          kind: "OPENING_BALANCE",
          occurredAt: opening.at,
          amount: amount.toFixed(2),
          currencyCode: input.currencyCode,
          rateUsed: rate,
          amountUsd: roundMoney(toUsdExact(amount, rate)).toFixed(2),
          note: "رصيد افتتاحي",
          createdById: userId,
        },
      });
    }
    return supplier.id;
  });
}

/**
 * دفعة للمورد من محفظة. إن كانت عملة المحفظة غير عملة المورد يُسجَّل المبلغان:
 * ما خرج من المحفظة (بسعر صرف عملتها يوم الدفع) وما خُصم من حساب المورد.
 */
export async function recordPayment(
  input: {
    supplierId: string;
    walletId: string;
    paidAmount: string;
    supplierAmount: string | null;
    at: Date;
    reference: string | null;
    note: string | null;
  },
  userId: string,
): Promise<void> {
  const [supplier, wallet] = await Promise.all([
    prisma.supplier.findFirst({ where: { id: input.supplierId, deletedAt: null } }),
    prisma.wallet.findFirst({ where: { id: input.walletId, isActive: true } }),
  ]);
  if (!supplier) throw new SupplierError("المورد غير موجود.");
  if (!wallet) throw new SupplierError("اختاري المحفظة.");

  const sameCurrency = wallet.currencyCode === supplier.currencyCode;
  if (!sameCurrency && !input.supplierAmount) {
    throw new SupplierError(`اكتبي المبلغ المخصوم من حساب المورد بـ ${supplier.currencyCode}.`);
  }
  const paidRate = await rateOrThrow(wallet.currencyCode, input.at);
  const paidUsd = toUsdExact(input.paidAmount, paidRate);
  const supplierAmount = dec(sameCurrency ? input.paidAmount : input.supplierAmount!);
  // سعر عملة المورد الضمني لهذه الدفعة = ما خُصم ÷ ما دُفع بالدولار
  const rateUsed = sameCurrency ? dec(paidRate) : supplierAmount.div(paidUsd);

  await prisma.supplierLedgerEntry.create({
    data: {
      supplierId: supplier.id,
      kind: "PAYMENT",
      occurredAt: input.at,
      amount: supplierAmount.neg().toFixed(2),
      currencyCode: supplier.currencyCode,
      rateUsed: rateUsed.toDecimalPlaces(6).toString(),
      amountUsd: roundMoney(paidUsd).neg().toFixed(2),
      walletId: wallet.id,
      paidAmount: dec(input.paidAmount).toFixed(2),
      paidCurrencyCode: wallet.currencyCode,
      paidRate,
      reference: input.reference,
      note: input.note,
      createdById: userId,
    },
  });
}

/** إلغاء حركة خاطئة (دفعة أو رصيد افتتاحي) — تبقى في الكشف مشطوبة مع السبب. */
export async function voidEntry(supplierId: string, entryId: string, reason: string, userId: string): Promise<void> {
  const entry = await prisma.supplierLedgerEntry.findFirst({ where: { id: entryId, supplierId, voidedAt: null } });
  if (!entry) throw new SupplierError("الحركة غير موجودة أو ملغاة.");
  if (entry.kind === "PURCHASE") throw new SupplierError("حركة الشحنة تُعدَّل من الشحنة نفسها.");
  await prisma.supplierLedgerEntry.update({
    where: { id: entry.id },
    data: { voidedAt: new Date(), voidedById: userId, voidReason: reason },
  });
}
