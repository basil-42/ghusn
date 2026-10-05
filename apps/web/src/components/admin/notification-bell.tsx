"use client";

import { chimeToPlay } from "@ghusn/core";
import {
  Bell,
  Clock,
  CreditCard,
  ShoppingBag,
  TriangleAlert,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatRelative } from "@/lib/format";
import type { NotificationItem } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { audioReady, claimChimeLeadership, playChime, setMuted, unlockAudio, useMuted } from "./chime";
import { setPendingOrders } from "./pending-orders";

const POLL_MS = 30_000;

const ICONS: Partial<Record<NotificationItem["type"], LucideIcon>> = {
  ORDER_NEW: ShoppingBag,
  PAYMENT_PROOF: CreditCard,
  ORDER_ESCALATED: TriangleAlert,
  BANKAK_EXPIRING: Clock,
};
const ACTIONS: Partial<Record<NotificationItem["type"], string>> = {
  ORDER_NEW: "فتح الطلب",
  PAYMENT_PROOF: "مراجعة الدفع",
};
type Tab = "all" | "unread" | "urgent";
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "unread", label: "غير المقروءة" },
  { key: "urgent", label: "العاجلة" },
];

interface Summary {
  unread: number;
  items: NotificationItem[];
  pendingOrders: number | null;
  now: string;
}

function markRead(body: { ids: string[] } | { all: true }) {
  return fetch("/api/v1/notifications/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}

/** وسم الأولوية: عاجل/مهم. */
export function PriorityTag({ priority }: { priority: NotificationItem["priority"] }) {
  if (priority === "URGENT")
    return <span className="rounded-md bg-danger px-1.5 py-px text-[11px] font-bold text-white">عاجل</span>;
  if (priority === "IMPORTANT")
    return <span className="rounded-md bg-gold/20 px-1.5 py-px text-[11px] font-bold text-warning">مهم</span>;
  return null;
}

export function NotificationIcon({ item }: { item: Pick<NotificationItem, "type" | "priority" | "read"> }) {
  const Icon = ICONS[item.type] ?? Bell;
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl",
        item.read
          ? "bg-muted text-muted-foreground"
          : item.priority === "IMPORTANT"
            ? "bg-sand text-forest"
            : "bg-forest text-ivory",
      )}
    >
      <Icon className="size-5" strokeWidth={1.8} />
    </span>
  );
}

/**
 * جرس الإشعارات (D-109): يستطلع كل 30 ثانية، ويعرض العدّاد والقائمة، ويرنّ حسب الأولوية
 * (العاجل يتكرر كل دقيقة حتى 5 مرات ما لم يُفتح طلبه)، ويُظهر تنبيهاً منبثقاً للعاجل الجديد.
 */
export function NotificationBell() {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [toast, setToast] = useState<NotificationItem | null>(null);
  const muted = useMuted();
  const [soundOn, setSoundOn] = useState(true);
  const seen = useRef(new Set<string>());
  const lastUrgentAt = useRef<number | null>(null);
  const firstPoll = useRef(true);
  const root = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    let data: Summary;
    try {
      const res = await fetch("/api/v1/notifications", { cache: "no-store" });
      if (!res.ok) return;
      data = (await res.json()) as Summary;
    } catch {
      return; // بلا اتصال: المحاولة التالية بعد 30 ثانية
    }
    setSummary(data);
    setPendingOrders(data.pendingOrders);
    const now = Date.now();
    const chime = chimeToPlay(
      { seen: seen.current, lastUrgentAt: lastUrgentAt.current },
      data.items,
      now,
      firstPoll.current,
    );
    if (chime && playChime(chime) && chime === "urgent") lastUrgentAt.current = now;
    const freshUrgent = data.items.find((n) => !seen.current.has(n.id) && n.priority === "URGENT" && !n.read);
    if (freshUrgent && !firstPoll.current) setToast(freshUrgent);
    for (const n of data.items) seen.current.add(n.id);
    firstPoll.current = false;
    setSoundOn(audioReady());
  }, []);

  useEffect(() => {
    claimChimeLeadership();
    const unlock = () => {
      unlockAudio();
      setTimeout(() => setSoundOn(audioReady()), 50);
    };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    const first = setTimeout(poll, 0);
    const timer = setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  // العدّاد في عنوان التبويب: يظهر حتى والتبويب في الخلفية
  const unread = summary?.unread ?? 0;
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\)\s/, "");
    document.title = unread > 0 ? `(${unread > 99 ? "99+" : unread}) ${base}` : base;
  }, [unread, summary]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 12_000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openItem = (n: NotificationItem) => {
    setOpen(false);
    setToast(null);
    if (!n.read) void markRead({ ids: [n.id] }).then(poll);
    router.push(n.href);
  };

  const items = (summary?.items ?? []).filter((n) =>
    tab === "unread" ? !n.read : tab === "urgent" ? n.priority === "URGENT" : true,
  );
  const now = summary ? new Date(summary.now) : new Date();

  return (
    <div ref={root} className="relative flex items-center gap-1.5">
      {!muted && !soundOn ? (
        <button
          type="button"
          onClick={() => {
            unlockAudio();
            setTimeout(() => {
              setSoundOn(audioReady());
              playChime("important", true);
            }, 50);
          }}
          className="flex min-h-11 items-center gap-1 rounded-xl px-2 text-xs font-semibold text-warning hover:bg-muted"
        >
          <VolumeX aria-hidden className="size-4" />
          <span className="hidden sm:inline">تفعيل الصوت</span>
          <span className="sr-only sm:hidden">تفعيل صوت التنبيه</span>
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={unread ? `الإشعارات، ${unread} غير مقروءة` : "الإشعارات"}
        className={cn(
          "relative flex size-11 items-center justify-center rounded-xl border",
          unread ? "border-forest bg-forest text-ivory" : "border-border bg-card text-forest hover:bg-muted",
        )}
      >
        <Bell aria-hidden className="size-5" strokeWidth={1.8} />
        {unread ? (
          <span className="absolute -start-1.5 -top-1.5 flex h-[22px] min-w-[22px] items-center justify-center rounded-full border-2 border-card bg-danger px-1 text-xs font-bold text-white tabular-nums">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <section
          aria-label="الإشعارات"
          className="fixed inset-x-2 top-16 z-50 flex max-h-[78vh] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_48px_rgb(47_59_44/0.18)] sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:mt-2 sm:w-[420px]"
        >
          <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
            <h2 className="text-lg font-bold">الإشعارات</h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const next = !muted;
                  setMuted(next);
                  if (!next) {
                    unlockAudio();
                    setTimeout(() => playChime("important", true), 50);
                  }
                }}
                aria-label={muted ? "تشغيل صوت التنبيه" : "كتم صوت التنبيه"}
                aria-pressed={muted}
                className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              >
                {muted ? <VolumeX aria-hidden className="size-5" /> : <Volume2 aria-hidden className="size-5" />}
              </button>
              {unread ? (
                <button
                  type="button"
                  onClick={() => void markRead({ all: true }).then(poll)}
                  className="min-h-10 rounded-lg px-2 text-sm font-semibold text-muted-foreground hover:bg-muted"
                >
                  تحديد الكل كمقروء
                </button>
              ) : null}
            </div>
          </div>
          <div className="flex gap-1.5 border-b border-border px-4 pb-3" role="group" aria-label="تصفية">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                aria-pressed={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "min-h-9 rounded-full border px-3.5 text-sm font-semibold",
                  tab === t.key ? "border-forest bg-forest text-ivory" : "border-border bg-card hover:bg-muted",
                )}
              >
                {t.label}
                {t.key === "unread" && unread ? ` · ${unread}` : ""}
              </button>
            ))}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <li className="p-8 text-center text-sm text-muted-foreground">
                {summary ? "لا إشعارات هنا." : "جارٍ التحميل…"}
              </li>
            ) : (
              items.map((n) => (
                <li key={n.id} className={cn("border-b border-border", !n.read && "bg-background")}>
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className="flex w-full gap-3 px-4 py-3 text-start hover:bg-muted"
                  >
                    <NotificationIcon item={n} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-2">
                        <PriorityTag priority={n.priority} />
                        <span className={cn("min-w-0 text-sm break-words", n.read ? "font-semibold" : "font-bold")}>
                          {n.title}
                        </span>
                        <span className="ms-auto shrink-0 text-xs text-muted-foreground">
                          {formatRelative(new Date(n.createdAt), now)}
                        </span>
                      </span>
                      <span className={cn("text-[13px] leading-relaxed", n.read && "text-muted-foreground")}>
                        {n.body}
                      </span>
                      {!n.read && ACTIONS[n.type] ? (
                        <span className="mt-1 inline-flex min-h-8 w-fit items-center rounded-lg bg-forest px-3 text-[13px] font-semibold text-ivory">
                          {ACTIONS[n.type]}
                        </span>
                      ) : null}
                    </span>
                    {!n.read ? (
                      <span aria-label="غير مقروء" className="mt-1.5 size-2 shrink-0 rounded-full bg-danger" />
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
          <Link
            href="/admin/notifications"
            onClick={() => setOpen(false)}
            className="flex min-h-12 items-center justify-center text-sm font-bold hover:bg-muted"
          >
            عرض كل الإشعارات
          </Link>
        </section>
      ) : null}

      {toast ? (
        <div
          role="status"
          className="fixed start-4 bottom-4 z-50 flex w-[min(360px,calc(100vw-2rem))] items-center gap-3 rounded-2xl bg-forest p-4 text-ivory shadow-[0_12px_32px_rgb(47_59_44/0.3)] motion-safe:animate-fade-up"
        >
          <Bell aria-hidden className="size-5 shrink-0 text-sand" />
          <button
            type="button"
            onClick={() => openItem(toast)}
            className="min-w-0 flex-1 text-start text-sm leading-relaxed"
          >
            <b className="block truncate">{toast.title}</b>
            <span className="line-clamp-2 text-ivory/85">{toast.body}</span>
          </button>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="إغلاق"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-sand hover:bg-ivory/10"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
