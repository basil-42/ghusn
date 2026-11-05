import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount, formatDateTime } from "@/lib/format";
import { listReturnRequests } from "@/lib/returns";
import { cn } from "@/lib/utils";
import { DecideForm } from "./decide-form";

export const metadata: Metadata = { title: "طلبات المرتجع | غصن" };

const STATUS: Record<string, { label: string; variant: "default" | "success" | "warning" | "destructive" }> = {
  APPROVED: { label: "معتمد — بانتظار الإكمال", variant: "warning" },
  REJECTED: { label: "مرفوض", variant: "destructive" },
  USED: { label: "اكتمل المرتجع", variant: "success" },
  CANCELLED: { label: "أُلغي", variant: "default" },
};

/** مرتجعات بعد المدة بانتظار اعتماد المالك (D-150): الموظفة تطلب، والمالك يعتمد من هاتفه. */
export default async function ReturnRequestsPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  await requirePermission({ saleReturn: ["approveLate"] });
  const { focus } = await searchParams;
  const { pending, decided } = await listReturnRequests();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="طلبات المرتجع"
        description="مرتجع بعد المدة يحتاج اعتمادك. حين تعتمده يصل إشعار للموظفة فتُكمله من نقطة البيع."
      />
      <Card className={pending.length ? "border-sand" : undefined}>
        <CardHeader>
          <CardTitle>بانتظار اعتمادك · {pending.length}</CardTitle>
        </CardHeader>
        {pending.length === 0 ? (
          <p className="text-muted-foreground">لا شيء ينتظر.</p>
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((r) => (
              <li
                key={r.id}
                id={r.id}
                className={cn(
                  "flex flex-col gap-3 py-4 md:flex-row md:items-start md:justify-between",
                  focus === r.id && "rounded-xl bg-gold/10 px-3",
                )}
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="font-semibold">
                    مرتجع <bdi dir="ltr">{r.saleNumber}</bdi> ·{" "}
                    <span className="tabular-nums">{formatAmount(r.saleTotalSdg, 0)} ج.س</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {r.requestedBy} · بعد {r.days} يوماً من البيع · {formatDateTime(r.createdAt)}
                  </p>
                  <p className="text-sm">«{r.reason}»</p>
                </div>
                <div className="w-full md:w-72">
                  <DecideForm id={r.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>آخر ما حُسم</CardTitle>
          <CardDescription>الاعتماد يُستخدم لمرتجع واحد.</CardDescription>
        </CardHeader>
        {decided.length === 0 ? (
          <p className="text-muted-foreground">لا شيء بعد.</p>
        ) : (
          <ul className="divide-y divide-border">
            {decided.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span>
                  <bdi dir="ltr" className="font-semibold">
                    {r.saleNumber}
                  </bdi>{" "}
                  · {r.requestedBy} · «{r.reason}»{r.decidedBy ? ` · ${r.decidedBy}` : ""}
                  {r.decisionNote ? ` · «${r.decisionNote}»` : ""}
                  {r.returnId ? (
                    <>
                      {" · "}
                      <Link href={`/pos/returns/${r.returnId}`} className="underline">
                        <bdi dir="ltr">{r.returnNumber}</bdi>
                      </Link>
                    </>
                  ) : null}
                </span>
                <Badge variant={STATUS[r.status]?.variant ?? "default"}>{STATUS[r.status]?.label ?? r.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
