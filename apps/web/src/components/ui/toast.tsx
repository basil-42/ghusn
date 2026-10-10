"use client";

import { CheckCircle2, X } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

/**
 * رسائل نجاح مؤقتة (D-123): تظهر أسفل الشاشة وتختفي بعد 3.5 ثانية — بدل تنبيه أخضر يبقى داخل النموذج.
 * الأخطاء تبقى داخل النموذج قرب الحقول (تحتاج قراءة وتصحيحاً).
 */

interface Toast {
  id: number;
  message: string;
}

const DURATION_MS = 3500;
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(message: string) {
  const id = nextId++;
  toasts = [...toasts.slice(-2), { id, message }];
  emit();
  setTimeout(() => dismiss(id), DURATION_MS);
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const EMPTY: Toast[] = [];

/** نتيجة إجراء خادم ({ success }) ← رسالة مؤقتة مرة واحدة لكل إرسال. */
export function useActionToast(state: { success?: string } | undefined) {
  const shown = useRef(state);
  useEffect(() => {
    if (state && state !== shown.current && state.success) toast(state.success);
    shown.current = state;
  }, [state]);
}

export function Toaster() {
  const list = useSyncExternalStore(
    subscribe,
    () => toasts,
    () => EMPTY,
  );
  return (
    <div
      aria-live="polite"
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
    >
      {list.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex max-w-md items-center gap-2 rounded-xl bg-forest px-4 py-3 text-sm font-semibold text-ivory shadow-lg",
            "motion-safe:animate-[toast-in_200ms_ease-out]",
          )}
        >
          <CheckCircle2 aria-hidden className="size-4 shrink-0 text-sand" />
          <span className="min-w-0">{t.message}</span>
          <button
            type="button"
            aria-label="إغلاق"
            onClick={() => dismiss(t.id)}
            className="-me-1 flex size-7 shrink-0 items-center justify-center rounded-lg hover:bg-ivory/10"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
