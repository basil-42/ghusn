"use client";

import { CheckCircle2, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { FLASH_COOKIE } from "@/lib/flash-cookie";
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

/**
 * يلف إجراء الخادم فتظهر رسالة نجاحه فور وصولها — للنماذج التي تختفي بعد نجاحها (إلغاء مصروف، تغيير
 * حالة طلب)، حيث لا يلحق useActionToast أن يعمل قبل أن يُزال المكوّن.
 */
export function withToast<S extends { success?: string } | undefined, P>(fn: (prev: S, payload: P) => Promise<S>) {
  return async (prev: S, payload: P): Promise<S> => {
    const result = await fn(prev, payload);
    if (result?.success) toast(result.success);
    return result;
  };
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

/**
 * رسالة نجاح محفوظة قبل الانتقال (flash في الخادم، D-140): تُعرض مرة عند كل تغيّر في العنوان ثم تُمسح.
 * يحتاج Suspense في القالب (useSearchParams).
 */
export function FlashToast() {
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    const raw = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${FLASH_COOKIE}=`))
      ?.slice(FLASH_COOKIE.length + 1);
    if (!raw) return;
    document.cookie = `${FLASH_COOKIE}=; path=/; max-age=0; samesite=lax`;
    try {
      toast(decodeURIComponent(raw));
    } catch {
      // قيمة تالفة — تُتجاهل
    }
  }, [pathname, search]);
  return null;
}
