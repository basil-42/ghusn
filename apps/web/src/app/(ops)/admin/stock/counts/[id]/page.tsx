import { canApproveAdjustment, dec, roundMoney } from "@ghusn/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount, formatDateTime, formatTime } from "@/lib/format";
import { getStockSettings } from "@/lib/settings";
import { COUNT_STATUS_LABELS, UNIT_LABELS, countReview } from "@/lib/stock-counts";
import { cn } from "@/lib/utils";
import { ApproveCountForm, CancelCountForm, RecountButton } from "../forms";

export const metadata: Metadata = { title: "مراجعة الجرد | غصن" };

function Usd({ value, signed = true }: { value: ReturnType<typeof dec>; signed?: boolean }) {
  return (
    <bdi dir="ltr" className="tabular-nums">
      {signed ? (value.gt(0) ? "+" : value.lt(0) ? "−" : "") : ""}
      {formatAmount(value.abs().toFixed(2))} $
    </bdi>
  );
}

/**
 * مراجعة الجرد (D-112) للمديرة والمالك: رصيد النظام لحظة العد، المعدود، الفرق وقيمته بمتوسط التكلفة؛
 * إعادة عدّ ما يُشك فيه، ثم الاعتماد (الصافي فوق حد المديرة للمالك).
 */
export default async function CountReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ all?: string }>;
}) {
  const session = await requirePermission({ stock: ["adjust"] });
  const { id } = await params;
  const role = session.user.role;
  if (!roleCan(role, { stock: ["approve"] })) redirect(`/admin/stock/counts/${id}/count`);
  const { all } = await searchParams;
  const [r, { managerAdjustLimitUsd }] = await Promise.all([countReview(id), getStockSettings()]);
  if (!r) notFound();
  const showAll = all === "1" || r.status === "OPEN";
  const counted = r.lines.filter((l) => l.status !== "PENDING");
  const rows = showAll ? r.lines : r.lines.filter((l) => !l.difference.isZero() || l.status === "RECOUNT");
  const s = r.summary;
  const mayApprove = canApproveAdjustment({
    valueUsd: s.netUsd,
    limitUsd: managerAdjustLimitUsd,
    canApprove: true,
    unlimited: roleCan(role, { stock: ["approveAll"] }),
  });
  const costLines = r.lines.filter((l) => l.needsCost).map((l) => ({ lineId: l.lineId, label: l.label }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href="/admin/stock/counts" className="text-sm text-muted-foreground hover:underline">
            الجرد ›
          </Link>
          <h1 className="font-display text-3xl font-bold">{r.title}</h1>
          <p className="text-muted-foreground">
            <bdi dir="ltr">{r.number}</bdi> · بدأته {r.createdBy} {formatDateTime(r.createdAt)}
            {r.submittedBy ? ` · أرسلته ${r.submittedBy} ${formatTime(r.submittedAt!)}` : ""}
            {r.decidedBy ? ` · ${r.status === "APPROVED" ? "اعتمدته" : "ألغته"} ${r.decidedBy}` : ""} · {counted.length}{" "}
            من {r.lines.length} صنفاً
          </p>
        </div>
        <span className="rounded-lg bg-gold/15 px-3 py-1.5 text-sm font-bold text-warning">
          {COUNT_STATUS_LABELS[r.status]}
        </span>
      </header>

      {r.status === "CANCELLED" && r.cancelReason ? <Alert>سبب الإلغاء: «{r.cancelReason}»</Alert> : null}
      {r.status === "APPROVED" ? (
        <Alert variant="success">
          اعتُمد الجرد{r.decidedAt ? ` ${formatDateTime(r.decidedAt)}` : ""} —{" "}
          {r.lines.filter((l) => l.adjustmentId).length
            ? `${r.lines.filter((l) => l.adjustmentId).length} تسوية «فرق جرد» وتعدّلت الأرصدة.`
            : "كل الأصناف مطابقة، ولم تتغير الأرصدة."}
        </Alert>
      ) : null}
      {r.status === "OPEN" ? (
        <Alert variant="warning">
          العد جارٍ — بقي {r.pendingCount} صنف. تظهر الفروقات هنا أولاً بأول، والاعتماد بعد إرسال العد.{" "}
          <Link href={`/admin/stock/counts/${r.id}/count`} className="font-semibold underline">
            شاشة العد
          </Link>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="gap-1 p-5">
          <span className="text-sm text-muted-foreground">مطابقة</span>
          <b className="text-2xl">{s.matched} صنفاً</b>
        </Card>
        <Card className="gap-1 p-5">
          <span className="text-sm text-muted-foreground">عجز</span>
          <b className="text-2xl text-destructive">
            <Usd value={s.shortageUsd.neg()} />
          </b>
          <span className="text-xs text-muted-foreground">{s.shortageLines} أصناف</span>
        </Card>
        <Card className="gap-1 p-5">
          <span className="text-sm text-muted-foreground">زيادة</span>
          <b className="text-2xl">
            <Usd value={s.surplusUsd} />
          </b>
          <span className="text-xs text-muted-foreground">{s.surplusLines} أصناف</span>
        </Card>
        <Card className="gap-1 bg-primary p-5 text-primary-foreground">
          <span className="text-sm opacity-85">الصافي</span>
          <b className="text-2xl">
            <Usd value={s.netUsd} />
          </b>
          <span className="text-xs opacity-85">بمتوسط التكلفة الحالي</span>
        </Card>
      </div>

      <nav className="flex gap-2" aria-label="تصفية">
        <Link
          href={`/admin/stock/counts/${r.id}`}
          aria-current={!showAll ? "page" : undefined}
          className={cn(
            "inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold",
            !showAll ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
          )}
        >
          بفرق فقط · {s.shortageLines + s.surplusLines}
        </Link>
        <Link
          href={`/admin/stock/counts/${r.id}?all=1`}
          aria-current={showAll ? "page" : undefined}
          className={cn(
            "inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold",
            showAll ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
          )}
        >
          الكل · {r.lines.length}
        </Link>
      </nav>

      <Card className="p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">لا توجد فروقات — كل ما عُدّ مطابق.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="p-3 text-start font-semibold">الصنف</th>
                  <th className="p-3 text-start font-semibold">النظام وقت العد</th>
                  <th className="p-3 text-start font-semibold">المعدود</th>
                  <th className="p-3 text-start font-semibold">الفرق</th>
                  <th className="p-3 text-start font-semibold">القيمة</th>
                  <th className="p-3 text-start font-semibold">عدّته</th>
                  <th className="p-3">
                    <span className="sr-only">إجراء</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((l) => {
                  const d = l.difference;
                  const value = dec(l.avgCostUsd).gt(0) ? roundMoney(d.mul(l.avgCostUsd)) : null;
                  return (
                    <tr key={l.lineId} className={cn(l.status === "RECOUNT" && "bg-gold/10")}>
                      <td className="p-3">
                        <Link href={`/admin/stock/${l.variantId}`} className="hover:underline">
                          {l.label}
                        </Link>
                        {l.status === "RECOUNT" ? (
                          <span className="block text-xs font-semibold text-warning">طُلبت إعادة عدّه</span>
                        ) : null}
                        {l.needsCost ? (
                          <span className="block text-xs font-semibold text-warning">صنف بلا تكلفة</span>
                        ) : null}
                      </td>
                      <td className="p-3 tabular-nums">
                        {l.systemQty !== null ? <bdi dir="ltr">{dec(l.systemQty).toFixed()}</bdi> : "—"}
                      </td>
                      <td className="p-3 font-bold tabular-nums">
                        {l.status === "PENDING" ? (
                          <span className="font-normal text-muted-foreground">لم يُعدّ</span>
                        ) : (
                          <>
                            <bdi dir="ltr">{dec(l.countedQty ?? "0").toFixed()}</bdi>{" "}
                            {l.status === "MISSING" ? (
                              <span className="text-xs font-semibold text-warning">(غير موجود)</span>
                            ) : (
                              <span className="text-xs font-normal">{UNIT_LABELS[l.unit] ?? l.unit}</span>
                            )}
                          </>
                        )}
                      </td>
                      <td
                        className={cn(
                          "p-3 font-bold tabular-nums",
                          d.lt(0) && "text-destructive",
                          d.gt(0) && "text-foreground",
                        )}
                      >
                        {l.status === "PENDING" ? (
                          "—"
                        ) : (
                          <bdi dir="ltr">{d.gt(0) ? `+${d.toFixed()}` : d.toFixed()}</bdi>
                        )}
                      </td>
                      <td className={cn("p-3", value?.lt(0) && "text-destructive")}>
                        {value && !d.isZero() ? <Usd value={value} /> : "—"}
                      </td>
                      <td className="p-3 text-xs">
                        {l.countedBy ? `${l.countedBy} ${l.countedAt ? formatTime(l.countedAt) : ""}` : "—"}
                      </td>
                      <td className="p-3">
                        {r.status === "SUBMITTED" && (l.status === "COUNTED" || l.status === "MISSING") ? (
                          <RecountButton countId={r.id} lineId={l.lineId} />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {r.status === "SUBMITTED" || r.status === "OPEN" ? (
        <Card className="gap-4 p-5">
          <div className="flex flex-col gap-1 text-sm leading-7 text-muted-foreground">
            <span>الفرق = المعدود − رصيد النظام لحظة عدّ الصنف؛ ما بِيع بعد عدّه لا يُفسد النتيجة.</span>
            <span>
              كل فرق يصبح تسوية «فرق جرد» بمتوسط التكلفة لحظة الاعتماد. الصافي فوق{" "}
              {formatAmount(String(managerAdjustLimitUsd))} $ يعتمده المالك.
            </span>
          </div>
          {r.status === "SUBMITTED" ? (
            r.recountCount ? (
              <Alert variant="warning">بانتظار إعادة عدّ {r.recountCount} صنف قبل الاعتماد.</Alert>
            ) : !mayApprove ? (
              <Alert variant="warning">الصافي فوق حد اعتمادك — يعتمده المالك، وقد وصله إشعار.</Alert>
            ) : null
          ) : null}
          <div className="flex flex-wrap items-start justify-between gap-4">
            {r.status === "SUBMITTED" ? (
              <ApproveCountForm countId={r.id} costLines={costLines} disabled={!!r.recountCount || !mayApprove} />
            ) : (
              <span />
            )}
            <CancelCountForm countId={r.id} />
          </div>
        </Card>
      ) : r.status === "APPROVED" ? (
        <Button asChild variant="outline" className="self-start">
          <Link href="/admin/stock/adjustments?reason=COUNT">تسويات هذا الجرد في سجل التسويات</Link>
        </Button>
      ) : null}
    </div>
  );
}
