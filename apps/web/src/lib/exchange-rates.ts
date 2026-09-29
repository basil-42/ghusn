import { effectiveRate, rateChange, rateChangeExceeds, shopDay, type Decimal } from "@ghusn/core";
import { prisma, type RateSource } from "@ghusn/db";

/** مصادر السعر التي تُدخل يدوياً؛ ACTUAL_TRANSFER يُنشأ من التحويلات، وFIXED_PEG للعملات المربوطة. */
export const MANUAL_SOURCES = ["PARALLEL_MARKET", "BANK"] as const satisfies readonly RateSource[];

export const SOURCE_LABELS: Record<RateSource, string> = {
  PARALLEL_MARKET: "السوق الموازي",
  BANK: "سعر البنك",
  ACTUAL_TRANSFER: "تحويل فعلي",
  FIXED_PEG: "سعر ثابت",
};

/** عملة البيع — سعرها هو ما يُراجَع يومياً. */
export const SELLING_CURRENCY = "SDG";
/** تنبيه مراجعة الأسعار عند تغيّر أكبر من 5% (currency-and-costing §2). */
export const PRICE_REVIEW_THRESHOLD = "0.05";

const HISTORY_PER_CURRENCY = 20;

export interface RateCard {
  currency: { code: string; nameAr: string; symbol: string };
  current: {
    id: string;
    unitsPerUsd: string;
    source: RateSource;
    effectiveAt: Date;
    enteredBy: string | null;
    note: string | null;
  } | null;
  /** التغيّر عن السعر السابق (كسر عشري) — null إن لم يوجد سابق. */
  change: Decimal | null;
  needsPriceReview: boolean;
  /** لم يُدخل سعر اليوم (بتوقيت المحل). */
  isStale: boolean;
  /** سعر مربوط (مثل الريال القطري) — لا يُدخل يومياً. */
  isPegged: boolean;
}

/** لوحة الأسعار السارية لكل عملة نشطة غير عملة الأساس. */
export async function getRateBoard(now = new Date()): Promise<RateCard[]> {
  const currencies = await prisma.currency.findMany({
    where: { isActive: true, isBase: false },
    orderBy: { code: "asc" },
    select: { code: true, nameAr: true, symbol: true },
  });

  const cards = await Promise.all(
    currencies.map(async (currency) => {
      const rows = await prisma.exchangeRate.findMany({
        where: { currencyCode: currency.code, effectiveAt: { lte: now } },
        orderBy: { effectiveAt: "desc" },
        take: HISTORY_PER_CURRENCY,
        include: { enteredBy: { select: { name: true } } },
      });
      const entries = rows.map((r) => ({ ...r, unitsPerUsd: r.unitsPerUsd.toString() }));
      const current = effectiveRate(entries, currency.code, now);
      const previous = current ? entries.find((e) => e.effectiveAt < current.effectiveAt) : undefined;
      const change = current && previous ? rateChange(previous.unitsPerUsd, current.unitsPerUsd) : null;
      const isPegged = current?.source === "FIXED_PEG";

      return {
        currency,
        current: current && {
          id: current.id,
          unitsPerUsd: current.unitsPerUsd,
          source: current.source,
          effectiveAt: current.effectiveAt,
          enteredBy: current.enteredBy?.name ?? null,
          note: current.note,
        },
        change,
        needsPriceReview:
          !!previous &&
          !!current &&
          rateChangeExceeds(previous.unitsPerUsd, current.unitsPerUsd, PRICE_REVIEW_THRESHOLD),
        isStale: !isPegged && (!current || shopDay(current.effectiveAt) !== shopDay(now)),
        isPegged,
      } satisfies RateCard;
    }),
  );

  // الجنيه أولاً — هو السعر اليومي الأهم
  return cards.sort(
    (a, b) => Number(b.currency.code === SELLING_CURRENCY) - Number(a.currency.code === SELLING_CURRENCY),
  );
}

export async function getRateHistory(currencyCode?: string, take = 30) {
  const rows = await prisma.exchangeRate.findMany({
    where: currencyCode ? { currencyCode } : undefined,
    orderBy: { effectiveAt: "desc" },
    take,
    include: { enteredBy: { select: { name: true } }, currency: { select: { nameAr: true } } },
  });
  return rows.map((r) => ({ ...r, unitsPerUsd: r.unitsPerUsd.toString() }));
}

/** هل سعر الجنيه لليوم غائب؟ (لتنبيه المديرة في رأس اللوحة) */
export async function isSellingRateStale(now = new Date()): Promise<boolean> {
  const latest = await prisma.exchangeRate.findFirst({
    where: { currencyCode: SELLING_CURRENCY, effectiveAt: { lte: now } },
    orderBy: { effectiveAt: "desc" },
    select: { effectiveAt: true },
  });
  return !latest || shopDay(latest.effectiveAt) !== shopDay(now);
}
