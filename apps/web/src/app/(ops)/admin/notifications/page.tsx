import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NotificationIcon, PriorityTag } from "@/components/admin/notification-bell";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth/session";
import { formatDay, formatRelative, formatTime } from "@/lib/format";
import {
  NOTIFICATION_FILTERS,
  countUnread,
  listNotifications,
  type NotificationFilter,
  type NotificationItem,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { markAllReadAction } from "./actions";

export const metadata: Metadata = { title: "الإشعارات | غصن" };

const FILTER_LABELS: Record<NotificationFilter, string> = {
  all: "الكل",
  unread: "غير المقروءة",
  urgent: "العاجلة",
  orders: "الطلبات",
  payment: "الدفع",
};

const minutesBetween = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60_000));

/** «فوراً»، «بعد دقيقة»، «بعد دقيقتين»، «بعد 5 دقائق»، «بعد 15 دقيقة». */
function afterMinutes(m: number): string {
  if (m < 1) return "فوراً";
  if (m === 1) return "بعد دقيقة";
  if (m === 2) return "بعد دقيقتين";
  return `بعد ${m} ${m <= 10 ? "دقائق" : "دقيقة"}`;
}

/** حالة الطلب تحت إشعاره: من فتحه وبعد كم، أو أنه لم يُفتح بعد. */
function OpenedLine({ n }: { n: NotificationItem }) {
  if (n.openedBy) {
    const m = minutesBetween(n.createdAt, n.openedBy.at);
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check aria-hidden className="size-3.5 text-sage" strokeWidth={2.4} />
        فتحته {n.openedBy.name} {afterMinutes(m)}
      </span>
    );
  }
  if (n.type === "ORDER_NEW" && !n.read) {
    return <span className="text-xs font-semibold text-danger">لم يفتحه أحد بعد</span>;
  }
  return null;
}

/** كل الإشعارات (D-109): تصفية، وتجميع حسب اليوم، وأحدثها أولاً. */
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const session = await requireSession();
  const { f } = await searchParams;
  const filter: NotificationFilter = NOTIFICATION_FILTERS.includes(f as NotificationFilter)
    ? (f as NotificationFilter)
    : "all";
  const now = new Date();
  const [items, unread] = await Promise.all([
    listNotifications(session.user.id, { filter, take: 100, now }),
    countUnread(session.user.id),
  ]);
  const groups = new Map<string, NotificationItem[]>();
  for (const n of items) {
    const day = formatDay(new Date(n.createdAt));
    groups.set(day, [...(groups.get(day) ?? []), n]);
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">الإشعارات</h1>
          <p className="text-muted-foreground">
            {unread ? `${unread.toLocaleString("en-US")} غير مقروءة` : "لا إشعارات غير مقروءة"}
          </p>
        </div>
        {unread ? (
          <form action={markAllReadAction}>
            <Button type="submit" variant="outline">
              تحديد الكل كمقروء
            </Button>
          </form>
        ) : null}
      </header>

      <nav aria-label="تصفية" className="flex flex-wrap gap-2">
        {NOTIFICATION_FILTERS.map((key) => (
          <Link
            key={key}
            href={key === "all" ? "/admin/notifications" : `/admin/notifications?f=${key}`}
            aria-current={key === filter ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold",
              key === filter ? "border-forest bg-forest text-ivory" : "border-border bg-card hover:bg-muted",
            )}
          >
            {FILTER_LABELS[key]}
            {key === "unread" && unread ? ` · ${unread}` : ""}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
          لا إشعارات هنا.
        </p>
      ) : (
        [...groups].map(([day, list]) => (
          <section key={day} className="flex flex-col gap-2">
            <h2 className="text-sm font-bold text-muted-foreground">{day}</h2>
            <ul className="overflow-hidden rounded-2xl border border-border bg-card">
              {list.map((n) => (
                <li key={n.id} className={cn("border-b border-border last:border-b-0", !n.read && "bg-background")}>
                  <Link href={n.href} className="flex items-start gap-3 p-4 hover:bg-muted">
                    <NotificationIcon item={n} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <PriorityTag priority={n.priority} />
                        <span className={cn(n.read ? "font-semibold" : "font-bold")}>{n.title}</span>
                      </span>
                      <span className={cn("text-sm leading-relaxed", n.read && "text-muted-foreground")}>{n.body}</span>
                      <OpenedLine n={n} />
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground" title={formatTime(new Date(n.createdAt))}>
                      {formatRelative(new Date(n.createdAt), now)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <p className="text-xs text-muted-foreground">يُعرض آخر 100 إشعار.</p>
    </div>
  );
}
