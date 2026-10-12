import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { roleCan, type Permissions } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "التقارير | غصن" };

interface Report {
  question: string;
  answer: string;
  href?: string;
  permission?: Permissions;
  isNew?: boolean;
}

const INSIGHTS: Permissions = { report: ["read"], cost: ["read"] };

/** مركز التقارير (D-127): كل تقرير بالسؤال الذي يجيب عنه، بحسب صلاحيات المستخدم. */
const GROUPS: { label: string; soon?: boolean; reports: Report[] }[] = [
  {
    label: "المال",
    reports: [
      { question: "كم ربحنا هذا الشهر؟", answer: "التقرير الشهري — الربح والخسارة بالدولار", href: "/admin/reports" },
      {
        question: "هل نكبر أم نتراجع؟",
        answer: "الاتجاه — آخر 12 شهراً مع ملاحظات تلقائية",
        href: "/admin/reports/trend",
        isNew: true,
      },
      {
        question: "من أين دخل المال وأين ذهب؟",
        answer: "التدفق النقدي — كل محفظة بعملتها",
        href: "/admin/reports/cash",
        permission: { report: ["read"], wallet: ["update"] },
        isNew: true,
      },
    ],
  },
  {
    label: "المنتجات والمخزون",
    reports: [
      {
        question: "ما الذي يربح وما الراكد؟",
        answer: "التحليلات — الأكثر ربحاً، الراكد، إعادة الطلب",
        href: "/admin/insights",
        permission: INSIGHTS,
      },
      {
        question: "كيف تعمل الموظفات؟",
        answer: "التحليلات — الموظفات وفروقات الصندوق",
        href: "/admin/insights?tab=staff",
        permission: INSIGHTS,
      },
      {
        question: "أي الأقسام والمناسبات تبيع أكثر؟",
        answer: "التحليلات — الأقسام والمناسبات",
        href: "/admin/insights?tab=breakdown",
        permission: INSIGHTS,
      },
    ],
  },
  {
    label: "قريباً",
    soon: true,
    reports: [
      { question: "أي مورد أربح لنا؟", answer: "ربحية الشحنات والموردين" },
      { question: "متى يشتري الناس؟", answer: "أوقات البيع خلال الأسبوع واليوم" },
    ],
  },
];

export default async function ReportsHubPage() {
  const session = await requirePermission({ report: ["read"] });
  const groups = GROUPS.map((g) => ({
    ...g,
    reports: g.reports.filter((r) => !r.permission || roleCan(session.user.role, r.permission)),
  })).filter((g) => g.reports.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="التقارير" description="اختاري السؤال الذي تريدين جوابه." />
      {groups.map((g) => (
        <section key={g.label} aria-labelledby={`g-${g.label}`} className="flex flex-col gap-3">
          <h2 id={`g-${g.label}`} className="text-sm font-bold text-muted-foreground">
            {g.label}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.reports.map((r) => {
              const body = (
                <>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <b className="text-base">
                      {r.question}
                      {r.isNew ? (
                        <span className="ms-2 rounded-full bg-gold/20 px-2 py-0.5 align-middle text-[11px] text-warning">
                          جديد
                        </span>
                      ) : null}
                    </b>
                    <span className="text-sm text-muted-foreground">{r.answer}</span>
                  </span>
                  {r.href ? <ChevronLeft aria-hidden className="size-5 shrink-0 text-muted-foreground" /> : null}
                </>
              );
              const box = "flex min-h-24 items-center gap-3 rounded-2xl border border-border bg-card p-5";
              return r.href ? (
                <Link key={r.question} href={r.href} className={cn(box, "transition-colors hover:border-primary")}>
                  {body}
                </Link>
              ) : (
                <div key={r.question} className={cn(box, g.soon && "border-dashed opacity-60")}>
                  {body}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
