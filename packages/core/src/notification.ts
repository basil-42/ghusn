/**
 * الإشعارات (D-109): متى يرنّ التنبيه داخل النظام. العاجل غير المقروء يتكرر كل دقيقة حتى 5 مرات
 * ما لم يُفتح طلبه؛ المهم نغمة واحدة؛ العادي بلا صوت.
 */

import { SHOP_TIME_ZONE } from "./exchange-rate";

export type NotificationPriority = "URGENT" | "IMPORTANT" | "NORMAL";

export const NOTIFICATION_TYPES = [
  "ORDER_NEW",
  "PAYMENT_PROOF",
  "ORDER_ESCALATED",
  "BANKAK_EXPIRING",
  "LOW_STOCK",
  "BATCH_EXPIRING",
  "PRICE_SUGGESTIONS",
  "DAILY_SUMMARY",
  "STOCK_ADJUSTMENT",
  "STOCK_ADJUSTED",
  "STOCK_COUNT",
  "SECURITY_ALERT",
] as const;
export type NotificationTypeName = (typeof NOTIFICATION_TYPES)[number];

/** ما يصل للجوال افتراضياً: العاجل والمهم والملخص؛ العادي داخل النظام فقط (D-109). */
export const DEFAULT_PUSH_TYPES: readonly NotificationTypeName[] = [
  "ORDER_NEW",
  "PAYMENT_PROOF",
  "ORDER_ESCALATED",
  "BANKAK_EXPIRING",
  "DAILY_SUMMARY",
  "STOCK_ADJUSTMENT",
  "STOCK_COUNT",
  "SECURITY_ALERT",
];
export const DEFAULT_QUIET = { start: "23:00", end: "08:00" } as const;
export type Chime = "urgent" | "important";

export const URGENT_REPEAT_MS = 60_000;
export const URGENT_REPEAT_MAX = 5;

export interface RingCandidate {
  priority: NotificationPriority;
  createdAt: Date;
  readAt: Date | null;
  /** آخر فتح لصفحة الطلب المرتبط (أي مستخدمة)، أو null. */
  orderOpenedAt: Date | null;
}

/** هل ما زال إشعار عاجل «يرنّ»؟ يتوقف بقراءته، أو بفتح طلبه بعد وصوله، أو بعد آخر تكرار. */
export function isRinging(n: RingCandidate, now: Date): boolean {
  if (n.priority !== "URGENT" || n.readAt) return false;
  if (n.orderOpenedAt && n.orderOpenedAt >= n.createdAt) return false;
  const age = now.getTime() - n.createdAt.getTime();
  return age >= 0 && age < URGENT_REPEAT_MS * URGENT_REPEAT_MAX;
}

export interface ChimeState {
  /** المعرّفات التي رآها هذا التبويب من قبل. */
  seen: ReadonlySet<string>;
  /** آخر مرة رنّ فيها العاجل (ms)، أو null. */
  lastUrgentAt: number | null;
}

/**
 * أي نغمة تُشغَّل الآن؟ إشعار جديد عاجل ← فوراً؛ عاجل ما زال يرنّ ← بعد دقيقة من آخر رنّة؛
 * جديد مهم ← نغمة واحدة. أول استطلاع بعد فتح الصفحة لا يرنّ للمهم القديم.
 */
export function chimeToPlay(
  state: ChimeState,
  incoming: { id: string; priority: NotificationPriority; ringing: boolean }[],
  nowMs: number,
  firstPoll = false,
): Chime | null {
  const fresh = incoming.filter((n) => !state.seen.has(n.id));
  if (fresh.some((n) => n.priority === "URGENT" && n.ringing)) return "urgent";
  const anyRinging = incoming.some((n) => n.ringing);
  if (anyRinging && (state.lastUrgentAt === null || nowMs - state.lastUrgentAt >= URGENT_REPEAT_MS)) return "urgent";
  if (!firstPoll && fresh.some((n) => n.priority === "IMPORTANT")) return "important";
  return null;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const isTimeOfDay = (v: string) => HHMM.test(v);
const minutesOf = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: SHOP_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** هل اللحظة داخل ساعات الهدوء بتوقيت الخرطوم؟ تعبر منتصف الليل (23:00–08:00). البداية شاملة والنهاية لا. */
export function inQuietHours(now: Date, start: string | null, end: string | null): boolean {
  if (!start || !end || !isTimeOfDay(start) || !isTimeOfDay(end) || start === end) return false;
  const m = minutesOf(clock.format(now));
  const s = minutesOf(start);
  const e = minutesOf(end);
  return s < e ? m >= s && m < e : m >= s || m < e;
}

export interface PushPrefs {
  pushTypes: readonly NotificationTypeName[];
  quietStart: string | null;
  quietEnd: string | null;
  urgentInQuiet: boolean;
}

/** هل يُرسل هذا الإشعار لجوال هذه المستخدمة الآن؟ */
export function shouldPush(
  n: { type: NotificationTypeName; priority: NotificationPriority },
  prefs: PushPrefs,
  now: Date,
): boolean {
  if (!prefs.pushTypes.includes(n.type)) return false;
  if (!inQuietHours(now, prefs.quietStart, prefs.quietEnd)) return true;
  // العاجل والتصعيد (طلب ينتظر بلا متابعة) يتجاوزان ساعات الهدوء إن سمحت المستخدمة
  return (n.priority === "URGENT" || n.type === "ORDER_ESCALATED") && prefs.urgentInQuiet;
}

// ---------- التصعيد والتذكير (D-109) ----------

export const ESCALATE_MANAGER_MS = 15 * 60_000;
export const ESCALATE_OWNER_MS = 30 * 60_000;

/**
 * مستوى تصعيد طلب جديد لم يُفتح: 0 لا شيء، 1 المديرة (بعد 15 دقيقة)، 2 المالك (بعد 30 دقيقة).
 * فتح الطلب بعد وصوله يوقف التصعيد.
 */
export function escalationLevel(createdAt: Date, openedAt: Date | null, now: Date): 0 | 1 | 2 {
  if (openedAt && openedAt >= createdAt) return 0;
  const age = now.getTime() - createdAt.getTime();
  if (age >= ESCALATE_OWNER_MS) return 2;
  if (age >= ESCALATE_MANAGER_MS) return 1;
  return 0;
}

export const BANKAK_REMIND_MS = 2 * 3_600_000;

/** تذكير حجز بنكك: خلال آخر ساعتين قبل الإلغاء التلقائي، وقبل انتهائه. */
export function bankakReminderDue(dueAt: Date | null, now: Date): boolean {
  if (!dueAt) return false;
  const left = dueAt.getTime() - now.getTime();
  return left > 0 && left <= BANKAK_REMIND_MS;
}

export const BURST_MIN = 3;

/**
 * تجميع إشعارات الجوال لمستخدمة واحدة في دفعة إرسال: 3 طلبات جديدة أو أكثر = إشعار واحد «N طلبات
 * جديدة» (كلها في الجرس)، والبقية كما هي.
 */
export function groupForPush<T extends { type: NotificationTypeName }>(
  items: readonly T[],
): { single: T[]; burst: T[] } {
  const orders = items.filter((n) => n.type === "ORDER_NEW");
  if (orders.length < BURST_MIN) return { single: [...items], burst: [] };
  return { single: items.filter((n) => n.type !== "ORDER_NEW"), burst: orders };
}
