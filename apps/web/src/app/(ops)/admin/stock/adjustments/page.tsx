import { ADJUSTMENT_REASONS, canApproveAdjustment, dec, shopMonthRange, type AdjustmentReason } from "@ghusn/core";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount, formatDateTime } from "@/lib/format";
import { currentShopMonth } from "@/lib/reports";
import { getStockSettings } from "@/lib/settings";
import { REASON_LABELS, STATUS_LABELS, listAdjustments } from "@/lib/stock-adjustments";
import { cn } from "@/lib/utils";
import { ApproveAdjustmentForm, RejectAdjustmentForm } from "./forms";

export const metadata: Metadata = { title: "تسويات المخزون | غصن" };

const UNIT_LABEL: Record<string, string> = { PIECE: "حبة", METER: "متر", SHEET: "ورقة" };
const LOSS_REASONS: AdjustmentReason[] = ["DAMAGED", "EXPIRED", "LOST", "INTERNAL_USE"];

function SignedUsd({ value }: { value: string | null | undefined }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const v = dec(value);
  return (
    <bdi dir="ltr" className={cn("tabular-nums", v.lt(0) ? "text-destructive" : v.gt(0) ? "text-foreground" : "")}>
      {v.gt(0) ? "+" : v.lt(0) ? "−" : ""}
      {formatAmount(v.abs().toFixed(2))} $
    </bdi>
  );
}

/**
 * تسويات المخزون (D-111): المنتظرة أولاً (مع الاعتماد والرفض لمن يملكهما حسب الحد)، ثم السجل.
 * الموظفة ترى ما سجّلته فقط وبلا قيم بالدولار.
 */
export default async function AdjustmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; reason?: string; focus?: string }>;
}) {
  const session = await requirePermission({ stock: ["adjust"] });
  const { month: m, reason: r, focus } = await searchParams;
  const role = session.user.role;
  const withCost = roleCan(role, { cost: ["read"] });
  const canApprove = roleCan(role, { stock: ["approve"] });
  const unlimited = roleCan(role, { stock: ["approveAll"] });
  const seesAll = canApprove || unlimited;
  const month = m && /^\d{4}-\d{2}$/.test(m) ? m : currentShopMonth();
  const reason = ADJUSTMENT_REASONS.includes(r as AdjustmentReason) ? (r as AdjustmentReason) : undefined;
  const onlyUserId = seesAll ? undefined : session.user.id;

  const [{ managerAdjustLimitUsd }, pending, history] = await Promise.all([
    getStockSettings(),
    listAdjustments({ status: "PENDING", onlyUserId }, withCost),
    listAdjustments({ range: shopMonthRange(month), reason, onlyUserId }, withCost),
  ]);
  const decided = history.filter((a) => a.status !== "PENDING");
  const monthLoss = decided
    .filter((a) => a.status === "APPROVED" && a.valueUsd)
    .reduce((acc, a) => acc.plus(a.valueUsd ?? "0"), dec(0));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href="/admin/stock" className="text-sm text-muted-foreground hover:underline">
            المخزون ›
          </Link>
          <h1 className="font-display text-3xl font-bold">تسويات المخزون</h1>
          <p className="text-muted-foreground">
            لكل تسوية سبب ومن سجّلها ومن اعتمدها، ولا تُحذف — الخطأ يُصحَّح بتسوية عكسية.
            {canApprove && !unlimited ? ` حد اعتمادك ${formatAmount(String(managerAdjustLimitUsd))} $.` : ""}
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/stock/adjustments/new">
            <Plus aria-hidden /> تسوية جديدة
          </Link>
        </Button>
      </header>

      <Card className={pending.length ? "border-sand" : undefined}>
        <CardHeader>
          <CardTitle>بانتظار الاعتماد · {pending.length}</CardTitle>
          {!seesAll ? <CardDescription>تسوياتك التي لم تُحسم بعد.</CardDescription> : null}
        </CardHeader>
        {pending.length === 0 ? (
          <p className="text-muted-foreground">لا شيء ينتظر.</p>
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((a) => {
              const mayDecide =
                seesAll &&
                canApproveAdjustment({
                  valueUsd: a.valueUsd ?? "0",
                  limitUsd: managerAdjustLimitUsd,
                  canApprove,
                  unlimited,
                });
              return (
                <li
                  key={a.id}
                  id={a.id}
                  className={cn(
                    "flex flex-col gap-3 py-4 lg:flex-row lg:items-center",
                    focus === a.id && "rounded-xl bg-gold/10 px-3",
                  )}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={LOSS_REASONS.includes(a.reason) ? "destructive" : "default"}>
                        {REASON_LABELS[a.reason]}
                      </Badge>
                      <Link href={`/admin/stock/${a.variantId}`} className="font-semibold hover:underline">
                        {a.label}
                      </Link>
                      <span className="font-bold tabular-nums">
                        <bdi dir="ltr">{dec(a.qty).gt(0) ? `+${dec(a.qty).toFixed()}` : dec(a.qty).toFixed()}</bdi>{" "}
                        {UNIT_LABEL[a.unit] ?? a.unit}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {a.note ? `«${a.note}» · ` : ""}
                      سجّلتها {a.requestedBy} · {formatDateTime(a.createdAt)} · <bdi dir="ltr">{a.number}</bdi>
                      {a.hasPhoto ? (
                        <>
                          {" · "}
                          <a href={`/admin/stock/adjustments/${a.id}/photo`} target="_blank" className="underline">
                            الصورة
                          </a>
                        </>
                      ) : null}
                    </p>
                    {seesAll && !mayDecide ? (
                      <p className="text-sm font-semibold text-warning">
                        فوق حد المديرة ({formatAmount(String(managerAdjustLimitUsd))} $) ← يعتمدها المالك
                      </p>
                    ) : null}
                    {a.needsCost ? (
                      <p className="text-sm font-semibold text-warning">
                        صنف بلا تكلفة — أدخلي تكلفة الوحدة عند الاعتماد
                      </p>
                    ) : null}
                  </div>
                  {withCost ? (
                    <span className="font-bold">
                      ≈ <SignedUsd value={a.valueUsd} />
                    </span>
                  ) : null}
                  {mayDecide ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <RejectAdjustmentForm id={a.id} />
                      <ApproveAdjustmentForm id={a.id} needsCost={!!a.needsCost} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 p-6 pb-2">
          <div>
            <h2 className="text-xl font-bold">السجل · {month}</h2>
            {withCost && decided.length ? (
              <p className="text-sm text-muted-foreground">
                صافي أثر المعتمدة على قيمة المخزون: <SignedUsd value={monthLoss.toFixed(2)} />
              </p>
            ) : null}
          </div>
          <form className="flex flex-wrap items-center gap-2">
            <input
              type="month"
              name="month"
              defaultValue={month}
              aria-label="الشهر"
              className="min-h-11 rounded-xl border border-input bg-card px-3"
            />
            <select
              name="reason"
              defaultValue={reason ?? ""}
              aria-label="السبب"
              className="min-h-11 rounded-xl border border-input bg-card px-3"
            >
              <option value="">كل الأسباب</option>
              {ADJUSTMENT_REASONS.map((x) => (
                <option key={x} value={x}>
                  {REASON_LABELS[x]}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline">
              عرض
            </Button>
          </form>
        </div>
        {decided.length === 0 ? (
          <p className="p-6 pt-2 text-muted-foreground">لا توجد تسويات محسومة في هذا الشهر.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr className="text-start">
                  <th className="p-3 text-start font-semibold">الرقم</th>
                  <th className="p-3 text-start font-semibold">السبب</th>
                  <th className="p-3 text-start font-semibold">الصنف</th>
                  <th className="p-3 text-start font-semibold">الكمية</th>
                  {withCost ? <th className="p-3 text-start font-semibold">القيمة</th> : null}
                  <th className="p-3 text-start font-semibold">سجّلت ← حسمت</th>
                  <th className="p-3 text-start font-semibold">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {decided.map((a) => (
                  <tr key={a.id} id={a.id} className={cn(focus === a.id && "bg-gold/10")}>
                    <td className="p-3">
                      <bdi dir="ltr">{a.number}</bdi>
                      <span className="block text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</span>
                    </td>
                    <td className="p-3">{REASON_LABELS[a.reason]}</td>
                    <td className="p-3">
                      <Link href={`/admin/stock/${a.variantId}`} className="hover:underline">
                        {a.label}
                      </Link>
                      {a.note ? <span className="block text-xs text-muted-foreground">«{a.note}»</span> : null}
                    </td>
                    <td className="p-3 tabular-nums">
                      <bdi dir="ltr">{dec(a.qty).gt(0) ? `+${dec(a.qty).toFixed()}` : dec(a.qty).toFixed()}</bdi>
                    </td>
                    {withCost ? (
                      <td className="p-3">{a.status === "APPROVED" ? <SignedUsd value={a.valueUsd} /> : "—"}</td>
                    ) : null}
                    <td className="p-3">
                      {a.requestedBy} ← {a.decidedBy ?? "—"}
                    </td>
                    <td className="p-3">
                      <span className={cn("font-semibold", a.status === "REJECTED" && "text-muted-foreground")}>
                        {STATUS_LABELS[a.status]}
                      </span>
                      {a.rejectReason ? (
                        <span className="block text-xs text-muted-foreground">«{a.rejectReason}»</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
