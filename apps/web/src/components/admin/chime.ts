"use client";

import type { Chime } from "@ghusn/core";
import { useSyncExternalStore } from "react";

/**
 * نغمات التنبيه (D-109) مولَّدة بالمتصفح (Web Audio) — بلا ملف صوتي ولا حقوق، وتعمل مع ضعف الشبكة.
 * المتصفحات تمنع الصوت قبل أول تفاعل: أول ضغطة في الصفحة تفعّله (unlockAudio).
 * تبويب واحد فقط يرنّ (Web Locks) حتى لا يرنّ كل تبويب مفتوح معاً.
 */

const MUTE_KEY = "ghusn-sound-muted";
let ctx: AudioContext | null = null;
let leader = false;
let leaderRequested = false;

const NOTES: Record<Chime, [freq: number, at: number][]> = {
  // نوتتان صاعدتان مرتين — مميزة وواضحة في محل فيه ضجيج
  urgent: [
    [659.25, 0],
    [880, 0.18],
    [659.25, 0.55],
    [880, 0.73],
  ],
  // نوتة واحدة هادئة
  important: [[783.99, 0]],
};

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

const muteListeners = new Set<() => void>();

export function setMuted(muted: boolean): void {
  try {
    if (muted) localStorage.setItem(MUTE_KEY, "1");
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    // تخزين محظور: يبقى الاختيار لهذه الجلسة فقط
  }
  for (const l of muteListeners) l();
}

/** حالة الكتم للعرض (useSyncExternalStore) — على الخادم: غير مكتوم. */
export function useMuted(): boolean {
  return useSyncExternalStore(
    (cb) => {
      muteListeners.add(cb);
      return () => muteListeners.delete(cb);
    },
    isMuted,
    () => false,
  );
}

/** يُستدعى من ضغطة المستخدمة — المتصفح يسمح بالصوت بعدها. */
export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

export const audioReady = () => ctx?.state === "running";

/** يطلب «قفل الرنين»: التبويب الذي يحصل عليه يرنّ، والبقية تنتظر حتى يُغلق. */
export function claimChimeLeadership(): void {
  if (leaderRequested) return;
  leaderRequested = true;
  if (!("locks" in navigator)) {
    leader = true;
    return;
  }
  void navigator.locks.request("ghusn-chime", () => {
    leader = true;
    // يبقى القفل ما دام التبويب مفتوحاً
    return new Promise<void>(() => {});
  });
}

/** يشغّل النغمة إن كان الصوت مفعّلاً وهذا التبويب هو صاحب الرنين. يعيد هل رنّ فعلاً. */
export function playChime(kind: Chime, force = false): boolean {
  if (!ctx || ctx.state !== "running" || (!force && (isMuted() || !leader))) return false;
  const start = ctx.currentTime + 0.02;
  for (const [freq, at] of NOTES[kind]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = start + at;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(kind === "urgent" ? 0.32 : 0.2, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.45);
  }
  return true;
}
