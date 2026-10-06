import { shopDay } from "@ghusn/core";
import { prisma } from "@ghusn/db";
import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import {
  AUDIT_CATEGORIES,
  AUDIT_CATEGORY_LABELS,
  auditFeed,
  feedStats,
  parseFeedParams,
  type FeedParams,
} from "@/lib/audit-feed";
import { formatDay, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "سجل التدقيق | غصن" };

const SHOW_MAX = 300;

/** يبقي باقي الفلاتر ويغيّر واحداً. */
function hrefWith(p: FeedParams, patch: Partial<FeedParams>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...p, ...patch })) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `/admin/audit?${s}` : "/admin/audit";
}

/**
 * سجل التدقيق الموحّد (D-114) — للمالك فقط: كل ما تغيّر في النظام، من، ومتى، وماذا، مع رابط لكل حدث.
 * «تستحق انتباهك» تجمع الحساس: الإلغاءات، الخصم فوق الحد، العجز، تجاوز الرصيد، المستخدمون والإعدادات…
 */
export default async function AuditPage({ searchParams }: { searchParams: Promise<FeedParams> }) {
  await requirePermission({ audit: ["read"] });
  const params = await searchParams;
  const p = parseFeedParams(params);
  const [all, users] = await Promise.all([
    auditFeed({ ...p.range }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const stats = feedStats(all);
  const items = all
    .filter((i) => (p.category ? i.category === p.category : true))
    .filter((i) => (p.actorId ? i.actorIds.includes(p.actorId) : true))
    .filter((i) => (p.attentionOnly ? i.sensitive : true));
  // الصفحة تعرض حتى 300 حدث؛ الفترة الأطول تُصدَّر كاملة
  const shown = items.slice(0, SHOW_MAX);
  const days = new Map<string, typeof items>();
  for (const i of shown) {
    const d = shopDay(i.at);
    days.set(d, [...(days.get(d) ?? []), i]);
  }
  const chip = (active: boolean, warm = false) =>
    cn(
      "inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold",
      active
        ? warm
          ? "border-warning bg-warning text-white"
          : "border-primary bg-primary text-primary-foreground"
        : warm
          ? "border-sand bg-card text-warning"
          : "border-border bg-card",
    );
  const exportQuery = new URLSearchParams(
    Object.entries({ from: p.fromDay, to: p.toDay, c: p.category, actor: p.actorId, f: params.f }).filter(
      (e): e is [string, string] => !!e[1],
    ),
  ).toString();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-bold">سجل التدقيق</h1>
          <p className="text-muted-foreground">كل ما تغيّر في النظام: من، ومتى، وماذا — لا يُعدَّل ولا يُحذف.</p>
        </div>
        <Button asChild variant="outline">
          <a href={`/admin/audit/export?${exportQuery}`}>
            <Download aria-hidden /> تصدير Excel
          </a>
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="gap-1 p-4">
          <span className="text-sm text-muted-foreground">أحداث الفترة</span>
          <b className="text-2xl tabular-nums">{stats.total}</b>
        </Card>
        <Card className={cn("gap-1 p-4", stats.attention && "border-sand")}>
          <span className="text-sm text-warning">تستحق انتباهك</span>
          <b className="text-2xl tabular-nums text-warning">{stats.attention}</b>
        </Card>
        <Card className="gap-1 p-4">
          <span className="text-sm text-muted-foreground">إلغاءات (مصاريف، دفعات، تحويلات)</span>
          <b className="text-2xl tabular-nums">{stats.voids}</b>
        </Card>
        <Card className="gap-1 p-4">
          <span className="text-sm text-muted-foreground">دخول فاشل</span>
          <b className={cn("text-2xl tabular-nums", stats.failedLogins && "text-destructive")}>{stats.failedLogins}</b>
        </Card>
      </div>

      <nav className="flex flex-wrap items-center gap-2" aria-label="تصفية حسب النوع">
        <Link href={hrefWith(params, { c: undefined, f: undefined })} className={chip(!p.category && !p.attentionOnly)}>
          الكل
        </Link>
        <Link
          href={hrefWith(params, { f: p.attentionOnly ? undefined : "attention" })}
          className={chip(p.attentionOnly, true)}
        >
          تستحق انتباهك · {stats.attention}
        </Link>
        {AUDIT_CATEGORIES.map((c) => (
          <Link
            key={c}
            href={hrefWith(params, { c: p.category === c ? undefined : c })}
            className={chip(p.category === c)}
          >
            {AUDIT_CATEGORY_LABELS[c]}
          </Link>
        ))}
      </nav>

      <form className="flex flex-wrap items-end gap-3" aria-label="الفترة والموظفة">
        {p.category ? <input type="hidden" name="c" value={p.category} /> : null}
        {p.attentionOnly ? <input type="hidden" name="f" value="attention" /> : null}
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">من</span>
          <input
            type="date"
            name="from"
            defaultValue={p.fromDay}
            max={p.toDay}
            className="min-h-11 rounded-xl border border-input bg-card px-3"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">إلى</span>
          <input
            type="date"
            name="to"
            defaultValue={p.toDay}
            className="min-h-11 rounded-xl border border-input bg-card px-3"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">الموظفة</span>
          <select
            name="actor"
            defaultValue={p.actorId ?? ""}
            className="min-h-11 rounded-xl border border-input bg-card px-3"
          >
            <option value="">الكل</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          عرض
        </Button>
      </form>

      {items.length === 0 ? (
        <Card>
          <p className="text-center text-muted-foreground">لا توجد أحداث في هذه الفترة.</p>
        </Card>
      ) : (
        [...days.entries()].map(([day, list]) => (
          <section key={day} className="flex flex-col gap-2" aria-label={day}>
            <h2 className="text-sm font-bold text-muted-foreground">
              {formatDay(list[0]!.at)} · {list.length}
            </h2>
            <Card className="gap-0 p-0">
              <ul className="divide-y divide-border">
                {list.map((i) => (
                  <li
                    key={i.id}
                    className={cn(
                      "grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[4.5rem_1fr_10rem_6rem] sm:items-center",
                      i.sensitive && "bg-gold/10",
                    )}
                  >
                    <span className="text-sm text-muted-foreground tabular-nums">{formatTime(i.at)}</span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <b className="text-sm">
                        {i.sensitive ? (
                          <span className="me-1 text-warning" aria-label="تستحق انتباهك">
                            ●
                          </span>
                        ) : null}
                        {i.title}
                      </b>
                      {i.detail ? <span className="text-sm text-muted-foreground">{i.detail}</span> : null}
                    </div>
                    <span className="col-start-2 text-sm sm:col-start-auto">{i.actors ?? "—"}</span>
                    {i.href ? (
                      <Link
                        href={i.href}
                        className="col-start-2 text-sm font-semibold underline sm:col-start-auto sm:justify-self-end"
                      >
                        فتح
                      </Link>
                    ) : (
                      <span className="hidden sm:block" />
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ))
      )}
      {items.length > SHOW_MAX ? (
        <p className="text-center text-sm text-muted-foreground">
          يظهر أحدث {SHOW_MAX} من {items.length} حدثاً — اختاري فترة أقصر، أو صدّري الفترة كاملة إلى Excel.
        </p>
      ) : null}
    </div>
  );
}
