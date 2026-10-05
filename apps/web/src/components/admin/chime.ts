"use client";

import type { Chime } from "@ghusn/core";
import { useSyncExternalStore } from "react";

/**
 * نغمات التنبيه (D-109) مولَّدة بالمتصفح (Web Audio) — بلا ملف صوتي ولا حقوق، وتعمل مع ضعف الشبكة.
 * المتصفحات تمنع الصوت قبل أول تفاعل: أول ضغطة في الصفحة تفعّله (unlockAudio).
 * أي تبويب فُعّل فيه الصوت يرنّ، ووقت آخر رنّة مشترك بين التبويبات (localStorage) حتى لا يرنّ تبويبان
 * لنفس الطلب. (كان «قفل رنين» لتبويب واحد — فإن وقع على تبويب لم يُضغط فيه لم يرنّ أحد.)
 */

const MUTE_KEY = "ghusn-sound-muted";
const SHARED_KEY = "ghusn-chime-last-urgent";
let ctx: AudioContext | null = null;

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

/** وقت آخر رنّة عاجلة في أي تبويب (ms)، أو null. */
export function sharedLastUrgent(): number | null {
  try {
    const v = Number(localStorage.getItem(SHARED_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function markUrgentChimed(at: number): void {
  try {
    localStorage.setItem(SHARED_KEY, String(at));
  } catch {
    // بلا تخزين: قد يرنّ تبويبان — أفضل من ألا يرنّ أحد
  }
}

/**
 * يشغّل النغمة إن كان الصوت مفعّلاً في هذا التبويب (ضُغط فيه بعد فتحه) وغير مكتوم. يعيد هل رنّ.
 * Safari يعلّق الصوت أحياناً بعد إخفاء التبويب: نحاول استئنافه قبل الحكم.
 */
export function playChime(kind: Chime, force = false): boolean {
  if (!ctx || (!force && isMuted())) return false;
  if (ctx.state !== "running") {
    // «suspended» أو «interrupted»: الاستئناف يعمل إن سبق تفعيل الصوت بضغطة
    void ctx
      .resume()
      .then(() => ctx?.state === "running" && schedule(kind))
      .catch(() => {});
    return false;
  }
  schedule(kind);
  return true;
}

function schedule(kind: Chime): void {
  if (!ctx) return;
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
}
