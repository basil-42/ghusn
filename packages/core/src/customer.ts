import { dec, sum, type DecimalInput } from "./decimal";
import { normalizeArabic } from "./search";

/**
 * تصنيف العملاء (D-115): مميز = أعلى 10% إنفاقاً، متكرر = 3 مشتريات أو أكثر، جديد = شراء واحد.
 * الترتيب بالإنفاق بالدولار (صافي الإيراد) حتى لا يظلم تضخم الجنيه من اشترى قديماً؛ العرض بالجنيه.
 */

export const VIP_SHARE = "0.1";
export const REPEAT_MIN_PURCHASES = 3;

export type CustomerSegment = "VIP" | "REPEAT" | "NEW";

export const CUSTOMER_SEGMENT_LABELS: Record<CustomerSegment, string> = {
  VIP: "مميز",
  REPEAT: "متكرر",
  NEW: "جديد",
};

export interface CustomerValue {
  id: string;
  spendUsd: DecimalInput;
}

/**
 * المميزون: أعلى ⌈10%⌉ من العملاء الذين أنفقوا شيئاً، ومن يساوي إنفاقه آخرهم يدخل معه.
 * يعيد المعرّفات وحد الدخول (أقل إنفاق مميز).
 */
export function vipCustomers(rows: readonly CustomerValue[]): { ids: Set<string>; thresholdUsd: string | null } {
  const paying = rows.filter((r) => dec(r.spendUsd).gt(0)).sort((a, b) => dec(b.spendUsd).cmp(a.spendUsd));
  if (paying.length === 0) return { ids: new Set(), thresholdUsd: null };
  const count = dec(paying.length).mul(VIP_SHARE).ceil().toNumber();
  const last = paying[count - 1] ?? paying[paying.length - 1];
  const threshold = dec(last?.spendUsd ?? 0);
  const ids = new Set(paying.filter((r) => dec(r.spendUsd).gte(threshold)).map((r) => r.id));
  return { ids, thresholdUsd: threshold.toFixed() };
}

/** الشارة الظاهرة بجانب الاسم — الأعلى أولاً: مميز ثم متكرر ثم جديد (شراءان بلا شارة). */
export function customerSegment(purchases: number, isVip: boolean): CustomerSegment | null {
  if (isVip) return "VIP";
  if (purchases >= REPEAT_MIN_PURCHASES) return "REPEAT";
  if (purchases === 1) return "NEW";
  return null;
}

/** نصيب مجموعة من العملاء من الإنفاق الكلي (كسر 0..1)، أو null إن لم يُنفَق شيء. */
export function spendShare(rows: readonly CustomerValue[], ids: ReadonlySet<string>): string | null {
  const total = sum(rows.map((r) => r.spendUsd));
  if (total.lte(0)) return null;
  const part = sum(rows.filter((r) => ids.has(r.id)).map((r) => r.spendUsd));
  return part.div(total).toDecimalPlaces(4).toFixed();
}

/** متوسط الفاتورة (مقرّب لأقرب جنيه) أو null بلا مشتريات. */
export function averageTicket(totalSdg: DecimalInput, purchases: number): string | null {
  if (purchases <= 0) return null;
  return dec(totalSdg).div(purchases).toDecimalPlaces(0).toFixed();
}

const sameName = (a: string, b: string) => normalizeArabic(a) === normalizeArabic(b);

/**
 * اسم العميل عند البيع أو الطلب (D-116): الاسم المسجّل لا يُستبدل بصمت.
 * - لا اسم مسجّل ← يُحفظ المكتوب.
 * - اسم مختلف ← يبقى المسجّل، إلا بتأكيد صريح من الموظفة (نقطة البيع فقط) فيُستبدل ويُسجَّل في التدقيق.
 * - الاسم المطبوع على الفاتورة (snapshot) = المكتوب الآن، وإلا المسجّل.
 */
export function resolveCustomerName(input: {
  existing: string | null;
  incoming: string | null;
  confirmRename: boolean;
}): { update: string | null; snapshot: string | null; renamed: { before: string; after: string } | null } {
  const existing = input.existing?.trim() || null;
  const incoming = input.incoming?.trim().replace(/\s+/g, " ") || null;
  if (!incoming) return { update: null, snapshot: existing, renamed: null };
  if (!existing) return { update: incoming, snapshot: incoming, renamed: null };
  if (sameName(existing, incoming)) return { update: null, snapshot: existing, renamed: null };
  if (input.confirmRename)
    return { update: incoming, snapshot: incoming, renamed: { before: existing, after: incoming } };
  return { update: null, snapshot: incoming, renamed: null };
}
