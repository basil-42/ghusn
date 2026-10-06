import { dec, formatPhone } from "@ghusn/core";
import { Download, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { customerDirectory, filterDirectory, parseDirectoryQuery, type DirectoryQuery } from "@/lib/customers";
import { formatAmount, formatDaysAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SegmentBadge } from "./segment-badge";

export const metadata: Metadata = { title: "العملاء | غصن" };

const PAGE_SIZE = 50;

type Params = Record<string, string | string[] | undefined>;

function hrefWith(q: DirectoryQuery, patch: Partial<DirectoryQuery> & { p?: number }): string {
  const s = new URLSearchParams();
  const next = { ...q, ...patch };
  if (next.q) s.set("q", next.q);
  if (next.filter) s.set("f", next.filter);
  if (next.sort) s.set("sort", next.sort);
  if (patch.p && patch.p > 1) s.set("p", String(patch.p));
  const str = s.toString();
  return str ? `/admin/customers?${str}` : "/admin/customers";
}

/**
 * العملاء (D-115): كل من اشترى برقم هاتفه من المحل أو المتجر — يُسجَّل تلقائياً.
 * الكل يرى القائمة؛ الإنفاق والمتوسط ونصيب المميزين والتصدير للمالك والمديرة فقط.
 */
export default async function CustomersPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requirePermission({ customer: ["read"] });
  const canSeeValue = roleCan(session.user.role, { customer: ["value"] });
  const params = await searchParams;
  const query = parseDirectoryQuery(params);
  const page = Math.max(1, Number(typeof params.p === "string" ? params.p : 1) || 1);
  const { rows, stats } = await customerDirectory();
  const list = filterDirectory(rows, query, canSeeValue);
  const shown = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));

  const chip = (active: boolean, warm = false) =>
    cn(
      "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : warm
          ? "border-sand bg-card text-warning"
          : "border-border bg-card",
    );
  const cols = canSeeValue ? "md:grid-cols-[2fr_1.3fr_1fr_1.3fr_1.1fr_1.1fr]" : "md:grid-cols-[2fr_1.4fr_1.2fr_1.2fr]";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-bold">العملاء</h1>
          <p className="text-muted-foreground">كل من اشترى من المحل (برقم هاتفه) أو من المتجر — يُسجَّل تلقائياً.</p>
        </div>
        {canSeeValue ? (
          <Button asChild variant="outline">
            <a href={`/admin/customers/export${hrefWith(query, {}).replace("/admin/customers", "")}`}>
              <Download aria-hidden /> تصدير Excel
            </a>
          </Button>
        ) : null}
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="gap-1 p-4">
          <span className="text-sm text-muted-foreground">كل العملاء</span>
          <b className="text-2xl tabular-nums">{stats.total}</b>
        </Card>
        <Card className="gap-1 p-4">
          <span className="text-sm text-muted-foreground">جدد هذا الشهر</span>
          <b className="text-2xl tabular-nums">{stats.newThisMonth}</b>
        </Card>
        <Card className="gap-1 p-4">
          <span className="text-sm text-muted-foreground">متكررون (3 مشتريات أو أكثر)</span>
          <b className="text-2xl tabular-nums">{stats.repeat}</b>
        </Card>
        {canSeeValue ? (
          <Card className="gap-1 border-sand p-4">
            <span className="text-sm text-warning">المميزون ({stats.vip}) من المبيعات</span>
            <b className="text-2xl tabular-nums text-warning">
              {stats.vipShare ? `${dec(stats.vipShare).mul(100).toFixed(0)}%` : "—"}
            </b>
          </Card>
        ) : (
          <Card className="gap-1 border-sand p-4">
            <span className="text-sm text-warning">المميزون (أعلى 10%)</span>
            <b className="text-2xl tabular-nums text-warning">{stats.vip}</b>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <form className="flex gap-2" role="search">
          {query.filter ? <input type="hidden" name="f" value={query.filter} /> : null}
          {query.sort ? <input type="hidden" name="sort" value={query.sort} /> : null}
          <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-input bg-card px-3">
            <Search aria-hidden className="size-4 text-muted-foreground" />
            <input
              type="search"
              name="q"
              defaultValue={query.q ?? ""}
              placeholder="ابحثي بالاسم أو رقم الهاتف"
              aria-label="بحث"
              className="min-w-0 flex-1 bg-transparent outline-none"
            />
          </label>
          <Button type="submit" variant="outline">
            بحث
          </Button>
        </form>
        <nav className="flex flex-wrap items-center gap-2" aria-label="تصفية العملاء">
          <Link href={hrefWith(query, { filter: undefined })} className={chip(!query.filter)}>
            الكل
          </Link>
          <Link href={hrefWith(query, { filter: "vip" })} className={chip(query.filter === "vip", true)}>
            مميز
          </Link>
          <Link href={hrefWith(query, { filter: "repeat" })} className={chip(query.filter === "repeat")}>
            متكرر
          </Link>
          <Link href={hrefWith(query, { filter: "new" })} className={chip(query.filter === "new")}>
            جديد (شراء واحد)
          </Link>
          <span className="ms-auto flex items-center gap-1 text-sm text-muted-foreground">
            ترتيب:
            <Link
              href={hrefWith(query, { sort: undefined })}
              className={cn(
                "rounded-lg px-2 py-2",
                !query.sort || query.sort === "recent" ? "font-bold text-foreground" : "",
              )}
            >
              آخر شراء
            </Link>
            <Link
              href={hrefWith(query, { sort: "purchases" })}
              className={cn("rounded-lg px-2 py-2", query.sort === "purchases" ? "font-bold text-foreground" : "")}
            >
              عدد المشتريات
            </Link>
            {canSeeValue ? (
              <Link
                href={hrefWith(query, { sort: "spend" })}
                className={cn("rounded-lg px-2 py-2", query.sort === "spend" ? "font-bold text-foreground" : "")}
              >
                الإنفاق
              </Link>
            ) : null}
          </span>
        </nav>
      </div>

      <Card className="gap-0 overflow-hidden p-0">
        {shown.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">
            {rows.length === 0 ? "لا عملاء بعد — يُسجَّلون تلقائياً مع أول طلب أو فاتورة برقم هاتف." : "لا نتائج."}
          </p>
        ) : (
          <>
            <div
              className={cn(
                "hidden gap-3 border-b border-border px-5 py-3 text-sm font-semibold text-muted-foreground md:grid",
                cols,
              )}
            >
              <span>العميل</span>
              <span>الهاتف</span>
              <span>المشتريات</span>
              {canSeeValue ? (
                <>
                  <span>الإنفاق ج.س</span>
                  <span>متوسط الفاتورة</span>
                </>
              ) : null}
              <span>آخر شراء</span>
            </div>
            <ul className="divide-y divide-border">
              {shown.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/admin/customers/${c.id}`}
                    className={cn(
                      "grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-5 py-3 hover:bg-muted/50 md:gap-y-0",
                      cols,
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <b className={cn("truncate", !c.name && "font-normal text-muted-foreground")}>
                        {c.name ?? "عميل بلا اسم"}
                      </b>
                      <SegmentBadge segment={c.segment} />
                    </span>
                    <bdi dir="ltr" className="text-end text-sm text-muted-foreground md:text-start">
                      {formatPhone(c.phone)}
                    </bdi>
                    <span className="text-sm tabular-nums">
                      {c.purchases}{" "}
                      {c.purchases ? (
                        <span className="text-xs text-muted-foreground">
                          (
                          {[c.shopCount ? `${c.shopCount} محل` : null, c.webCount ? `${c.webCount} متجر` : null]
                            .filter(Boolean)
                            .join(" · ")}
                          )
                        </span>
                      ) : null}
                    </span>
                    {canSeeValue ? (
                      <>
                        <b className="text-end tabular-nums md:text-start">{formatAmount(c.spendSdg, 0)}</b>
                        <span className="hidden tabular-nums md:inline">
                          {c.avgSdg ? formatAmount(c.avgSdg, 0) : "—"}
                        </span>
                      </>
                    ) : null}
                    <span className="text-sm text-muted-foreground md:text-foreground">
                      {c.lastAt ? formatDaysAgo(c.lastAt) : "لا شراء مكتمل"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {pages > 1 ? (
        <nav className="flex items-center justify-center gap-3 text-sm" aria-label="الصفحات">
          {page > 1 ? (
            <Link href={hrefWith(query, { p: page - 1 })} className="rounded-xl border border-border px-4 py-2">
              السابق
            </Link>
          ) : null}
          <span className="tabular-nums text-muted-foreground">
            {page} / {pages} · {list.length} عميل
          </span>
          {page < pages ? (
            <Link href={hrefWith(query, { p: page + 1 })} className="rounded-xl border border-border px-4 py-2">
              التالي
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
