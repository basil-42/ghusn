import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { COUNT_STATUS_LABELS, activeCount, countCategories, listCounts } from "@/lib/stock-counts";
import { cn } from "@/lib/utils";
import { StartCountForm } from "./forms";

export const metadata: Metadata = { title: "الجرد | غصن" };

function parseSuggest(v: string | undefined) {
  if (v === "FULL" || v === "QUICK") return { scope: v, categoryId: null } as const;
  if (v?.startsWith("CATEGORY:")) return { scope: "CATEGORY", categoryId: v.slice(9) } as const;
  return null;
}

/** الجرد (D-112): الجاري، بدء جرد جديد (للمديرة والمالك)، والسجل. */
export default async function CountsPage({ searchParams }: { searchParams: Promise<{ suggest?: string }> }) {
  const session = await requirePermission({ stock: ["adjust"] });
  const { suggest } = await searchParams;
  const manager = roleCan(session.user.role, { stock: ["approve"] });
  const [active, counts, categories] = await Promise.all([activeCount(), listCounts(), countCategories()]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/admin/stock" className="text-sm text-muted-foreground hover:underline">
          المخزون ›
        </Link>
        <h1 className="font-display text-3xl font-bold">الجرد</h1>
        <p className="text-muted-foreground">
          عدّ ما على الرف ومقارنته بالنظام. العدّ أعمى، والمقارنة برصيد لحظة عدّ كل صنف — فلا داعي لإغلاق المحل.
        </p>
      </header>

      {active ? (
        <Card className="border-sand">
          <CardHeader>
            <CardTitle>
              {COUNT_STATUS_LABELS[active.status]} · <bdi dir="ltr">{active.number}</bdi>
            </CardTitle>
          </CardHeader>
          <div className="flex flex-wrap gap-2">
            {active.status === "OPEN" ? (
              <Button asChild>
                <Link href={`/admin/stock/counts/${active.id}/count`}>متابعة العد</Link>
              </Button>
            ) : null}
            {manager ? (
              <Button asChild variant={active.status === "OPEN" ? "outline" : "default"}>
                <Link href={`/admin/stock/counts/${active.id}`}>
                  {active.status === "SUBMITTED" ? "مراجعة الفروقات" : "التفاصيل"}
                </Link>
              </Button>
            ) : active.status === "SUBMITTED" ? (
              <Button asChild variant="outline">
                <Link href={`/admin/stock/counts/${active.id}/count`}>ما طُلبت إعادة عدّه</Link>
              </Button>
            ) : null}
          </div>
        </Card>
      ) : manager ? (
        <Card>
          <CardHeader>
            <CardTitle>جرد جديد</CardTitle>
            <CardDescription>بعد البدء تفتح الموظفات «الجرد» من جوالاتهن ويعددن بالمسح.</CardDescription>
          </CardHeader>
          <StartCountForm categories={categories} suggest={parseSuggest(suggest)} />
        </Card>
      ) : (
        <Card>
          <p className="text-muted-foreground">لا يوجد جرد جارٍ الآن — تبدؤه المديرة.</p>
        </Card>
      )}

      <Card className="p-0">
        <h2 className="p-6 pb-2 text-xl font-bold">السجل</h2>
        {counts.length === 0 ? (
          <p className="p-6 pt-2 text-muted-foreground">لم يُعمل جرد بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="p-3 text-start font-semibold">الرقم</th>
                  <th className="p-3 text-start font-semibold">النوع</th>
                  <th className="p-3 text-start font-semibold">عُدّ</th>
                  <th className="p-3 text-start font-semibold">الفروقات</th>
                  <th className="p-3 text-start font-semibold">بدأته ← حسمته</th>
                  <th className="p-3 text-start font-semibold">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {counts.map((c) => (
                  <tr key={c.id}>
                    <td className="p-3">
                      {manager ? (
                        <Link href={`/admin/stock/counts/${c.id}`} className="hover:underline">
                          <bdi dir="ltr">{c.number}</bdi>
                        </Link>
                      ) : (
                        <bdi dir="ltr">{c.number}</bdi>
                      )}
                      <span className="block text-xs text-muted-foreground">{formatDateTime(c.createdAt)}</span>
                    </td>
                    <td className="p-3">{c.title}</td>
                    <td className="p-3 tabular-nums">
                      <bdi dir="ltr">
                        {c.done} / {c.total}
                      </bdi>
                    </td>
                    <td className="p-3 tabular-nums">{c.status === "APPROVED" ? c.adjustments : "—"}</td>
                    <td className="p-3">
                      {c.createdBy} ← {c.decidedBy ?? "—"}
                    </td>
                    <td className={cn("p-3 font-semibold", c.status === "CANCELLED" && "text-muted-foreground")}>
                      {COUNT_STATUS_LABELS[c.status]}
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
