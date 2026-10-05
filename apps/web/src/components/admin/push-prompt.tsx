"use client";

import { Smartphone } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { enablePush, pushState, type PushState } from "./push-client";

const DISMISS_KEY = "ghusn-push-prompt-dismissed";
const DISMISS_DAYS = 7;

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/**
 * شريط «فعّلي إشعارات الجوال على هذا الجهاز» (D-109) — يظهر فقط إن كان الجهاز يدعمها ولم تُفعَّل،
 * و«لاحقاً» تخفيه أسبوعاً. على آيفون غير المضاف للشاشة: رابط لشرح الإضافة.
 */
export function PushPrompt({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;
    void pushState().then((s) => {
      if (cancelled) return;
      setState(s);
      setHidden(dismissedRecently());
    });
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  if (!publicKey || hidden || (state !== "off" && state !== "ios-install")) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // بلا تخزين: يُخفى لهذه الزيارة
    }
    setHidden(true);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-forest/20 bg-forest px-4 py-3 text-sm text-ivory">
      <Smartphone aria-hidden className="size-5 shrink-0 text-sand" />
      <p className="min-w-0 flex-1 leading-relaxed">
        {state === "ios-install" ? (
          <>
            <b>لتصلك الإشعارات على آيفون</b> أضيفي غصن إلى الشاشة الرئيسية أولاً.
          </>
        ) : (
          <>
            <b>فعّلي إشعارات الجوال على هذا الجهاز</b> — تصلك الطلبات وإشعارات الدفع حتى والنظام مغلق.
          </>
        )}
      </p>
      {state === "ios-install" ? (
        <Link
          href="/admin/notifications/settings#ios"
          className="flex min-h-10 items-center rounded-lg bg-ivory px-4 font-bold text-forest hover:bg-sand"
        >
          الطريقة
        </Link>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              setState(await enablePush(publicKey));
            } catch {
              setState("off");
            } finally {
              setBusy(false);
            }
          }}
          className="flex min-h-10 items-center rounded-lg bg-ivory px-4 font-bold text-forest hover:bg-sand disabled:opacity-60"
        >
          {busy ? "جارٍ التفعيل…" : "تفعيل"}
        </button>
      )}
      <button type="button" onClick={dismiss} className="min-h-10 rounded-lg px-3 text-sand hover:bg-ivory/10">
        لاحقاً
      </button>
    </div>
  );
}
