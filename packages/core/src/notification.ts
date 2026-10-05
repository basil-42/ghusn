/**
 * الإشعارات (D-109): متى يرنّ التنبيه داخل النظام. العاجل غير المقروء يتكرر كل دقيقة حتى 5 مرات
 * ما لم يُفتح طلبه؛ المهم نغمة واحدة؛ العادي بلا صوت.
 */

export type NotificationPriority = "URGENT" | "IMPORTANT" | "NORMAL";
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
