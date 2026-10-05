import { describe, expect, it } from "vitest";
import {
  DEFAULT_PUSH_TYPES,
  URGENT_REPEAT_MS,
  bankakReminderDue,
  chimeToPlay,
  escalationLevel,
  groupForPush,
  inQuietHours,
  isRinging,
  shouldPush,
} from "../src";

const t0 = new Date("2026-10-05T10:00:00Z");
const at = (ms: number) => new Date(t0.getTime() + ms);
const urgent = { priority: "URGENT" as const, createdAt: t0, readAt: null, orderOpenedAt: null };

describe("isRinging (D-109)", () => {
  it("rings for an unread urgent notification within five minutes", () => {
    expect(isRinging(urgent, at(0))).toBe(true);
    expect(isRinging(urgent, at(4 * 60_000 + 59_000))).toBe(true);
  });

  it("stops after the fifth repeat window", () => {
    expect(isRinging(urgent, at(5 * 60_000))).toBe(false);
  });

  it("stops once read or once the order is opened after it arrived", () => {
    expect(isRinging({ ...urgent, readAt: at(10_000) }, at(20_000))).toBe(false);
    expect(isRinging({ ...urgent, orderOpenedAt: at(30_000) }, at(40_000))).toBe(false);
  });

  it("keeps ringing when the order was opened before this notification", () => {
    expect(isRinging({ ...urgent, orderOpenedAt: at(-60_000) }, at(10_000))).toBe(true);
  });

  it("never rings for important or normal notifications", () => {
    expect(isRinging({ ...urgent, priority: "IMPORTANT" }, at(0))).toBe(false);
    expect(isRinging({ ...urgent, priority: "NORMAL" }, at(0))).toBe(false);
  });
});

describe("chimeToPlay (D-109)", () => {
  const none = { seen: new Set<string>(), lastUrgentAt: null };

  it("plays the urgent chime at once for a new ringing notification", () => {
    expect(chimeToPlay(none, [{ id: "a", priority: "URGENT", ringing: true }], 0)).toBe("urgent");
  });

  it("repeats a ringing notification only after a minute", () => {
    const state = { seen: new Set(["a"]), lastUrgentAt: 0 };
    const items = [{ id: "a", priority: "URGENT" as const, ringing: true }];
    expect(chimeToPlay(state, items, URGENT_REPEAT_MS - 1)).toBeNull();
    expect(chimeToPlay(state, items, URGENT_REPEAT_MS)).toBe("urgent");
  });

  it("plays the soft chime once for a new important notification", () => {
    const items = [{ id: "b", priority: "IMPORTANT" as const, ringing: false }];
    expect(chimeToPlay(none, items, 0)).toBe("important");
    expect(chimeToPlay({ seen: new Set(["b"]), lastUrgentAt: null }, items, 0)).toBeNull();
  });

  it("stays quiet for old important items on the first poll, and for normal ones", () => {
    expect(chimeToPlay(none, [{ id: "b", priority: "IMPORTANT", ringing: false }], 0, true)).toBeNull();
    expect(chimeToPlay(none, [{ id: "c", priority: "NORMAL", ringing: false }], 0)).toBeNull();
  });

  it("still rings on the first poll if an urgent order is waiting", () => {
    expect(chimeToPlay(none, [{ id: "a", priority: "URGENT", ringing: true }], 0, true)).toBe("urgent");
  });
});

describe("inQuietHours (D-109, Khartoum time)", () => {
  // الخرطوم = UTC+2
  const k = (hhmm: string) => new Date(`2026-10-05T${hhmm}:00+02:00`);

  it("spans midnight for 23:00–08:00", () => {
    expect(inQuietHours(k("23:00"), "23:00", "08:00")).toBe(true);
    expect(inQuietHours(k("03:15"), "23:00", "08:00")).toBe(true);
    expect(inQuietHours(k("07:59"), "23:00", "08:00")).toBe(true);
    expect(inQuietHours(k("08:00"), "23:00", "08:00")).toBe(false);
    expect(inQuietHours(k("22:59"), "23:00", "08:00")).toBe(false);
  });

  it("handles a same-day window and disabled values", () => {
    expect(inQuietHours(k("14:00"), "13:00", "15:00")).toBe(true);
    expect(inQuietHours(k("15:00"), "13:00", "15:00")).toBe(false);
    expect(inQuietHours(k("03:00"), null, null)).toBe(false);
    expect(inQuietHours(k("03:00"), "25:00", "08:00")).toBe(false);
    expect(inQuietHours(k("03:00"), "08:00", "08:00")).toBe(false);
  });
});

describe("shouldPush (D-109)", () => {
  const prefs = { pushTypes: DEFAULT_PUSH_TYPES, quietStart: "23:00", quietEnd: "08:00", urgentInQuiet: true };
  const day = new Date("2026-10-05T12:00:00+02:00");
  const night = new Date("2026-10-05T02:00:00+02:00");

  it("pushes enabled types during the day, never disabled ones", () => {
    expect(shouldPush({ type: "ORDER_NEW", priority: "URGENT" }, prefs, day)).toBe(true);
    expect(shouldPush({ type: "LOW_STOCK", priority: "NORMAL" }, prefs, day)).toBe(false);
  });

  it("lets only urgent through quiet hours, and only when allowed", () => {
    expect(shouldPush({ type: "ORDER_NEW", priority: "URGENT" }, prefs, night)).toBe(true);
    expect(shouldPush({ type: "BANKAK_EXPIRING", priority: "IMPORTANT" }, prefs, night)).toBe(false);
    expect(shouldPush({ type: "ORDER_NEW", priority: "URGENT" }, { ...prefs, urgentInQuiet: false }, night)).toBe(
      false,
    );
  });
});

describe("escalation and reminders (D-109)", () => {
  const created = new Date("2026-10-05T10:00:00Z");
  const after = (min: number) => new Date(created.getTime() + min * 60_000);

  it("escalates to the manager at 15 minutes and the owner at 30", () => {
    expect(escalationLevel(created, null, after(14))).toBe(0);
    expect(escalationLevel(created, null, after(15))).toBe(1);
    expect(escalationLevel(created, null, after(29))).toBe(1);
    expect(escalationLevel(created, null, after(30))).toBe(2);
  });

  it("stops once the order is opened after it arrived", () => {
    expect(escalationLevel(created, after(5), after(40))).toBe(0);
    expect(escalationLevel(created, after(-60), after(20))).toBe(1);
  });

  it("reminds about a Bankak reservation only in its last two hours", () => {
    const due = after(24 * 60);
    expect(bankakReminderDue(due, after(21 * 60))).toBe(false);
    expect(bankakReminderDue(due, after(22 * 60))).toBe(true);
    expect(bankakReminderDue(due, after(24 * 60))).toBe(false);
    expect(bankakReminderDue(null, after(0))).toBe(false);
  });

  it("lets escalation through quiet hours like urgent", () => {
    const prefs = { pushTypes: DEFAULT_PUSH_TYPES, quietStart: "23:00", quietEnd: "08:00", urgentInQuiet: true };
    const night = new Date("2026-10-05T02:00:00+02:00");
    expect(shouldPush({ type: "ORDER_ESCALATED", priority: "IMPORTANT" }, prefs, night)).toBe(true);
  });
});

describe("groupForPush (D-109)", () => {
  const n = (type: "ORDER_NEW" | "PAYMENT_PROOF", id: string) => ({ type, id });

  it("keeps up to two new orders as separate pushes", () => {
    const r = groupForPush([n("ORDER_NEW", "a"), n("ORDER_NEW", "b"), n("PAYMENT_PROOF", "c")]);
    expect(r.burst).toEqual([]);
    expect(r.single.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("folds three or more new orders into one burst", () => {
    const r = groupForPush([n("ORDER_NEW", "a"), n("PAYMENT_PROOF", "c"), n("ORDER_NEW", "b"), n("ORDER_NEW", "d")]);
    expect(r.burst.map((x) => x.id)).toEqual(["a", "b", "d"]);
    expect(r.single.map((x) => x.id)).toEqual(["c"]);
  });
});
