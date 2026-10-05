import { describe, expect, it } from "vitest";
import { DEFAULT_PUSH_TYPES, URGENT_REPEAT_MS, chimeToPlay, inQuietHours, isRinging, shouldPush } from "../src";

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
