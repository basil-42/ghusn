import { dec, type Decimal, type DecimalInput } from "./decimal";

/**
 * ربحية الشحنات والموردين وأوقات البيع (D-128). حسابات صافية بلا قاعدة بيانات.
 *
 * ربح الشحنة **تقديري**: المخزون يُصرف من الدفعات الأقرب انتهاءً ثم الأقدم (FEFO/FIFO)، فما خرج من دفعة
 * الشحنة = المستلم − المتبقي − ما سُجّل عليها تالفاً/مفقوداً. والإيراد = المباع × متوسط سعر بيع الصنف
 * منذ وصول الدفعة. التقرير الشهري يبقى بمتوسط التكلفة (D-28)؛ هذا للمقارنة بين الشحنات والموردين.
 */

export interface BatchInput {
  receivedQty: DecimalInput;
  remainingQty: DecimalInput;
  /** تالف/مفقود سُجّل على هذه الدفعة بعد الاستلام */
  lostQty: DecimalInput;
  landedUnitUsd: DecimalInput;
  /** متوسط صافي سعر بيع الوحدة بالدولار منذ وصول الدفعة، أو null بلا مبيعات */
  avgPriceUsd: DecimalInput | null;
}

export interface BatchEstimate {
  soldQty: Decimal;
  lostQty: Decimal;
  /** null إن بيع منها شيء ولا سعر معروف */
  revenueUsd: Decimal | null;
  costUsd: Decimal;
  lostUsd: Decimal;
  /** الإيراد − تكلفة المباع − التالف */
  profitUsd: Decimal | null;
  remainingUsd: Decimal;
}

const Decimal0 = (x: Decimal) => (x.lt(0) ? dec(0) : x);

export function batchEstimate(b: BatchInput): BatchEstimate {
  const received = dec(b.receivedQty);
  const remaining = dec(b.remainingQty);
  const out = Decimal0(received.minus(remaining));
  const lostQty = Decimal0(dec(b.lostQty).gt(out) ? out : dec(b.lostQty));
  const soldQty = out.minus(lostQty);
  const unit = dec(b.landedUnitUsd);
  const costUsd = soldQty.mul(unit);
  const lostUsd = lostQty.mul(unit);
  const revenueUsd = soldQty.isZero() ? dec(0) : b.avgPriceUsd === null ? null : soldQty.mul(b.avgPriceUsd);
  return {
    soldQty,
    lostQty,
    revenueUsd,
    costUsd,
    lostUsd,
    profitUsd: revenueUsd === null ? null : revenueUsd.minus(costUsd).minus(lostUsd),
    remainingUsd: Decimal0(remaining).mul(unit),
  };
}

export interface ShipmentTotals {
  receivedQty: Decimal;
  soldQty: Decimal;
  lostQty: Decimal;
  /** تكلفة ما وصل سليماً (landed) */
  costUsd: Decimal;
  revenueUsd: Decimal;
  profitUsd: Decimal;
  remainingUsd: Decimal;
  lostUsd: Decimal;
  /** المباع ÷ المستلم */
  sellThrough: Decimal | null;
  /** الربح ÷ الإيراد (للبنود المعروف سعرها) */
  margin: Decimal | null;
  /** بنود بيع منها بلا سعر معروف (لا تدخل في الربح) */
  unpricedLines: number;
}

/** مجموع بنود شحنة (أو مورد): البنود بلا سعر لا تدخل في الإيراد والربح والهامش. */
export function sumBatches(lines: readonly (BatchInput & { estimate?: BatchEstimate })[]): ShipmentTotals {
  const t = {
    receivedQty: dec(0),
    soldQty: dec(0),
    lostQty: dec(0),
    costUsd: dec(0),
    revenueUsd: dec(0),
    profitUsd: dec(0),
    remainingUsd: dec(0),
    lostUsd: dec(0),
    pricedCost: dec(0),
    unpricedLines: 0,
  };
  for (const l of lines) {
    const e = l.estimate ?? batchEstimate(l);
    t.receivedQty = t.receivedQty.plus(l.receivedQty);
    t.soldQty = t.soldQty.plus(e.soldQty);
    t.lostQty = t.lostQty.plus(e.lostQty);
    t.costUsd = t.costUsd.plus(dec(l.receivedQty).mul(l.landedUnitUsd));
    t.remainingUsd = t.remainingUsd.plus(e.remainingUsd);
    t.lostUsd = t.lostUsd.plus(e.lostUsd);
    if (e.revenueUsd === null || e.profitUsd === null) {
      t.unpricedLines += 1;
      continue;
    }
    t.revenueUsd = t.revenueUsd.plus(e.revenueUsd);
    t.profitUsd = t.profitUsd.plus(e.profitUsd);
  }
  return {
    receivedQty: t.receivedQty,
    soldQty: t.soldQty,
    lostQty: t.lostQty,
    costUsd: t.costUsd,
    revenueUsd: t.revenueUsd,
    profitUsd: t.profitUsd,
    remainingUsd: t.remainingUsd,
    lostUsd: t.lostUsd,
    sellThrough: t.receivedQty.gt(0) ? t.soldQty.div(t.receivedQty) : null,
    margin: t.revenueUsd.gt(0) ? t.profitUsd.div(t.revenueUsd) : null,
    unpricedLines: t.unpricedLines,
  };
}

export interface ShipmentNoteInput {
  id: string;
  number: string;
  supplierName: string;
  /** أيام منذ الاستلام */
  ageDays: number;
  sellThrough: DecimalInput | null;
  margin: DecimalInput | null;
  remainingUsd: DecimalInput;
}

export type ShipmentNote =
  | { kind: "slow"; id: string; number: string; ageDays: number; sellThrough: string; remainingUsd: string }
  | { kind: "best_margin"; id: string; number: string; supplierName: string; margin: string }
  | { kind: "low_margin"; id: string; number: string; supplierName: string; margin: string };

/** بطيئة: بيع أقل من نصفها بعد 60 يوماً · أعلى وأقل هامش (شحنتان بهامش على الأقل). */
export const SLOW_AFTER_DAYS = 60;

export function shipmentNotes(shipments: readonly ShipmentNoteInput[]): ShipmentNote[] {
  const notes: ShipmentNote[] = [];
  const slow = shipments
    .filter((s) => s.ageDays >= SLOW_AFTER_DAYS && s.sellThrough !== null && dec(s.sellThrough).lt("0.5"))
    .sort((a, b) => dec(b.remainingUsd).comparedTo(a.remainingUsd))
    .slice(0, 3);
  for (const s of slow) {
    notes.push({
      kind: "slow",
      id: s.id,
      number: s.number,
      ageDays: s.ageDays,
      sellThrough: dec(s.sellThrough ?? 0).toFixed(4),
      remainingUsd: dec(s.remainingUsd).toFixed(2),
    });
  }
  const withMargin = shipments.filter((s) => s.margin !== null);
  if (withMargin.length >= 2) {
    const best = withMargin.reduce((a, b) => (dec(b.margin ?? 0).gt(a.margin ?? 0) ? b : a));
    const worst = withMargin.reduce((a, b) => (dec(b.margin ?? 0).lt(a.margin ?? 0) ? b : a));
    notes.push({
      kind: "best_margin",
      id: best.id,
      number: best.number,
      supplierName: best.supplierName,
      margin: dec(best.margin ?? 0).toFixed(4),
    });
    if (worst.id !== best.id) {
      notes.push({
        kind: "low_margin",
        id: worst.id,
        number: worst.number,
        supplierName: worst.supplierName,
        margin: dec(worst.margin ?? 0).toFixed(4),
      });
    }
  }
  return notes;
}

/** نسبة التكاليف الإضافية (شحن، جمارك…) من قيمة الشراء. */
export function extraCostRatio(purchaseUsd: DecimalInput, extraUsd: DecimalInput): Decimal | null {
  return dec(purchaseUsd).gt(0) ? dec(extraUsd).div(purchaseUsd) : null;
}

// ─── أوقات البيع ───────────────────────────────────────────────────────────

export interface TimeCell {
  /** 0 = السبت … 6 = الجمعة (أسبوع السودان) */
  day: number;
  /** 0–23 بتوقيت المحل */
  hour: number;
  count: number;
  amount: DecimalInput;
}

export type TimeNote =
  | { kind: "busiest"; day: number; fromHour: number; toHour: number; share: string }
  | { kind: "quietest_day"; day: number; share: string }
  | { kind: "web_peak"; fromHour: number; toHour: number };

const value = (c: TimeCell, metric: "count" | "amount") => (metric === "count" ? dec(c.count) : dec(c.amount));

/** أزحم 3 ساعات متتالية في يوم واحد، وأهدأ يوم، وذروة طلبات المتجر (ساعتان). */
export function salesTimeNotes(
  cells: readonly TimeCell[],
  metric: "count" | "amount",
  webCells?: readonly TimeCell[],
): TimeNote[] {
  const notes: TimeNote[] = [];
  const grid = (cs: readonly TimeCell[]) => {
    const g = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => dec(0)));
    for (const c of cs) {
      const row = g[c.day];
      if (row && c.hour >= 0 && c.hour < 24) row[c.hour] = (row[c.hour] ?? dec(0)).plus(value(c, metric));
    }
    return g;
  };
  const g = grid(cells);
  const total = g.flat().reduce((a, b) => a.plus(b), dec(0));
  if (total.isZero()) return notes;

  let best = { day: 0, hour: 0, sum: dec(-1) };
  g.forEach((row, day) => {
    for (let h = 0; h <= 21; h++) {
      const sum = (row[h] ?? dec(0)).plus(row[h + 1] ?? 0).plus(row[h + 2] ?? 0);
      if (sum.gt(best.sum)) best = { day, hour: h, sum };
    }
  });
  // تُقص أطراف النافذة الخالية: «3 م – 4 م» لا «1 م – 4 م» حين لا بيع إلا في الثالثة
  const row = g[best.day] ?? [];
  let from = best.hour;
  let to = best.hour + 2;
  while (from < to && (row[from] ?? dec(0)).isZero()) from++;
  while (to > from && (row[to] ?? dec(0)).isZero()) to--;
  notes.push({
    kind: "busiest",
    day: best.day,
    fromHour: from,
    toHour: to + 1,
    share: best.sum.div(total).toFixed(4),
  });

  const days = g.map((row, day) => ({ day, sum: row.reduce((a, b) => a.plus(b), dec(0)) }));
  const quiet = days.reduce((a, b) => (b.sum.lt(a.sum) ? b : a));
  if (quiet.day !== best.day) {
    notes.push({ kind: "quietest_day", day: quiet.day, share: quiet.sum.div(total).toFixed(4) });
  }

  if (webCells && webCells.length > 0) {
    const w = grid(webCells);
    const byHour = Array.from({ length: 24 }, (_, h) => w.reduce((a, row) => a.plus(row[h] ?? 0), dec(0)));
    let peak = { hour: 0, sum: dec(-1) };
    for (let h = 0; h <= 22; h++) {
      const sum = (byHour[h] ?? dec(0)).plus(byHour[h + 1] ?? 0);
      if (sum.gt(peak.sum)) peak = { hour: h, sum };
    }
    if (peak.sum.gt(0)) notes.push({ kind: "web_peak", fromHour: peak.hour, toHour: peak.hour + 2 });
  }
  return notes;
}
