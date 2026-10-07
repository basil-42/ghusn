import { formatPhone } from "@ghusn/core";
import { MessageCircle, ShoppingCart, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { customerProfile } from "@/lib/customers";
import { formatAmount, formatDaysAgo, formatMonthYear, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deleteNoteAction } from "../actions";
import { AddNoteForm, RenameCustomer } from "../forms";
import { SegmentBadge, whatsappChatUrl } from "../segment-badge";

export const metadata: Metadata = { title: "العميل | غصن" };

const HISTORY_PREVIEW = 10;

/**
 * صفحة العميل (D-115): السجل الكامل من المحل والمتجر، ما يحبه، لمن يهدي، والمناسبات، وملاحظات الفريق.
 * الموظفة ترى كل شيء عدا المبالغ (الإنفاق، المتوسط، مبالغ الفواتير).
 */
export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ all?: string }>;
}) {
  const session = await requirePermission({ customer: ["read"] });
  const role = session.user.role;
  const canSeeValue = roleCan(role, { customer: ["value"] });
  const canEdit = roleCan(role, { customer: ["update"] });
  const canSell = roleCan(role, { pos: ["sell"] });
  const canOpenOrders = roleCan(role, { order: ["read"] });
  const [{ id }, { all }] = await Promise.all([params, searchParams]);
  const profile = await customerProfile(id);
  if (!profile) notFound();
  const { customer: c, history, notes, likes, recipients, occasions } = profile;
  const shownHistory = all ? history : history.slice(0, HISTORY_PREVIEW);
  const lastEntry = history.find((h) => h.kind === "SALE" || h.status === "DELIVERED");
  const historyCols = canSeeValue ? "sm:grid-cols-[6.5rem_10rem_1fr_7rem]" : "sm:grid-cols-[6.5rem_10rem_1fr]";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <Link href="/admin/customers" className="text-sm text-muted-foreground hover:underline">
            العملاء ›
          </Link>
          <h1 className="flex flex-wrap items-center gap-3 font-display text-3xl font-bold">
            {c.name ?? <span className="text-muted-foreground">عميل بلا اسم</span>}
            <SegmentBadge segment={c.segment} className="font-sans text-sm" />
          </h1>
          <p className="text-sm text-muted-foreground">
            <bdi dir="ltr">{formatPhone(c.phone)}</bdi> · عميل منذ {formatMonthYear(c.firstAt ?? c.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit ? <RenameCustomer customerId={c.id} name={c.name} /> : null}
          <Button asChild variant="outline">
            <a href={whatsappChatUrl(c.phone)} target="_blank" rel="noopener noreferrer">
              <MessageCircle aria-hidden /> واتساب
            </a>
          </Button>
          {canSell ? (
            <Button asChild>
              <Link href={`/pos?customer=${c.id}`}>
                <ShoppingCart aria-hidden /> بيع الآن
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {canSeeValue ? (
          <Card className="gap-1 p-4">
            <span className="text-sm text-muted-foreground">إجمالي الإنفاق</span>
            <b className="text-xl tabular-nums">{formatAmount(c.spendSdg, 0)} ج.س</b>
          </Card>
        ) : null}
        <Card className="gap-1 p-4">
          <span className="text-sm text-muted-foreground">المشتريات</span>
          <b className="text-xl tabular-nums">{c.purchases}</b>
          <span className="text-xs text-muted-foreground">
            {c.shopCount} من المحل · {c.webCount} من المتجر
          </span>
        </Card>
        {canSeeValue ? (
          <Card className="gap-1 p-4">
            <span className="text-sm text-muted-foreground">متوسط الفاتورة</span>
            <b className="text-xl tabular-nums">{c.avgSdg ? `${formatAmount(c.avgSdg, 0)} ج.س` : "—"}</b>
          </Card>
        ) : null}
        <Card className="gap-1 p-4">
          <span className="text-sm text-muted-foreground">آخر شراء</span>
          <b className="text-xl">{c.lastAt ? formatDaysAgo(c.lastAt) : "—"}</b>
          {lastEntry ? (
            <span className="text-xs text-muted-foreground">
              {formatShortDate(lastEntry.at)} · {lastEntry.kind === "SALE" ? "المحل" : "المتجر"}
            </span>
          ) : null}
        </Card>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card className="gap-0 overflow-hidden p-0">
          <h2 className="px-5 pt-5 pb-3 font-bold">سجل المشتريات</h2>
          {history.length === 0 ? (
            <p className="border-t border-border p-6 text-center text-muted-foreground">لا مشتريات بعد.</p>
          ) : (
            <>
              <div
                className={cn(
                  "hidden gap-3 border-y border-border px-5 py-2 text-sm font-semibold text-muted-foreground sm:grid",
                  historyCols,
                )}
              >
                <span>التاريخ</span>
                <span>الرقم</span>
                <span>الأصناف</span>
                {canSeeValue ? <span>المبلغ ج.س</span> : null}
              </div>
              <ul className="divide-y divide-border border-t border-border sm:border-t-0">
                {shownHistory.map((h) => {
                  const href =
                    h.kind === "SALE"
                      ? canSell
                        ? `/pos/receipt/${h.id}`
                        : null
                      : canOpenOrders
                        ? `/admin/orders/${h.id}`
                        : null;
                  const cancelled = h.status === "CANCELLED";
                  return (
                    <li
                      key={`${h.kind}:${h.id}`}
                      className={cn(
                        "grid grid-cols-1 gap-1 px-5 py-3 text-sm sm:gap-3",
                        historyCols,
                        cancelled && "opacity-60",
                      )}
                    >
                      <span className="font-semibold sm:font-normal">{formatShortDate(h.at)}</span>
                      <span className="flex flex-col">
                        {href ? (
                          <Link href={href} className="font-semibold hover:underline">
                            <bdi dir="ltr">{h.number}</bdi>
                          </Link>
                        ) : (
                          <bdi dir="ltr">{h.number}</bdi>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {[
                            h.kind === "SALE" ? "المحل" : "المتجر",
                            h.by,
                            h.boughtAs ? `باسم ${h.boughtAs}` : null,
                            h.recipient ? `هدية إلى ${h.recipient}` : null,
                            h.statusLabel,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className={cn(cancelled && "line-through")}>{h.items}</span>
                      {canSeeValue ? (
                        <span className="flex flex-col tabular-nums">
                          <b className={cn(cancelled && "line-through")}>{formatAmount(h.totalSdg, 0)}</b>
                          {h.returnedSdg ? (
                            <span className="text-xs text-destructive">مرتجع {formatAmount(h.returnedSdg, 0)}</span>
                          ) : null}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {!all && history.length > HISTORY_PREVIEW ? (
                <Link
                  href={`/admin/customers/${c.id}?all=1`}
                  className="block border-t border-border px-5 py-3 text-center text-sm font-semibold hover:bg-muted/50"
                >
                  عرض الكل ({history.length})
                </Link>
              ) : null}
            </>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="gap-3 p-5">
            <h2 className="font-bold">ملاحظات الفريق</h2>
            {notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا ملاحظات بعد. ما تعرفينه عنه يفيد من تخدمه بعدك.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {notes.map((n) => (
                  <li
                    key={n.id}
                    className="flex items-start gap-2 rounded-xl bg-background p-3 text-sm leading-relaxed"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-line">{n.body}</p>
                      <span className="text-xs text-muted-foreground">
                        {n.authorName} · {formatShortDate(n.createdAt)}
                      </span>
                    </div>
                    {canEdit && (n.authorId === session.user.id || canSeeValue) ? (
                      <form action={deleteNoteAction}>
                        <input type="hidden" name="noteId" value={n.id} />
                        <Button type="submit" variant="ghost" size="icon" aria-label="حذف الملاحظة">
                          <Trash2 aria-hidden />
                        </Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {canEdit ? <AddNoteForm customerId={c.id} /> : null}
          </Card>

          <Card className="gap-2 p-5">
            <h2 className="font-bold">ما يحبه</h2>
            {likes.categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">يظهر بعد أول شراء.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {likes.categories.map((x) => (
                    <span key={x.label} className="rounded-full bg-muted px-3 py-1 text-sm">
                      {x.label} · <span className="tabular-nums">{x.count}</span>
                    </span>
                  ))}
                </div>
                {likes.topItem ? (
                  <span className="text-sm text-muted-foreground">
                    أكثر صنف: {likes.topItem.label} ({likes.topItem.count} مرات)
                  </span>
                ) : null}
              </>
            )}
          </Card>

          {recipients.length ? (
            <Card className="gap-2 p-5">
              <h2 className="font-bold">لمن يهدي</h2>
              <ul className="flex flex-col gap-1.5">
                {recipients.map((r) => (
                  <li key={`${r.name}-${r.lastAt.getTime()}`} className="flex justify-between gap-3 text-sm">
                    <span>{r.name}</span>
                    <span className="text-muted-foreground">
                      {r.count === 1 ? "هدية واحدة" : r.count === 2 ? "هديتان" : `${r.count} هدايا`} · آخرها{" "}
                      {formatShortDate(r.lastAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {occasions.length ? (
            <Card className="gap-2 p-5">
              <h2 className="font-bold">المناسبات</h2>
              <div className="flex flex-wrap gap-1.5">
                {occasions.map((o) => (
                  <span key={o.label} className="rounded-full bg-gold/20 px-3 py-1 text-sm text-warning">
                    {o.label} · <span className="tabular-nums">{o.count}</span>
                  </span>
                ))}
              </div>
              <span className="text-xs text-muted-foreground">حسب مناسبات الأصناف التي اشتراها.</span>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
