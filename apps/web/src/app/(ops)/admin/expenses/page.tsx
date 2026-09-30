import { shopDay, shopMonthRange, sumUsd } from "@ghusn/core";
import { prisma } from "@ghusn/db";
import type { Metadata } from "next";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { listExpenseCategories, listExpenses } from "@/lib/expenses";
import { formatAmount, formatDateTime } from "@/lib/format";
import { currentShopMonth } from "@/lib/reports";
import { getPosSettings } from "@/lib/settings";
import { ExpenseForm, VoidExpenseForm } from "./forms";

export const metadata: Metadata = { title: "المصاريف | غصن" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const session = await requirePermission({ expense: ["create"] });
  const full = roleCan(session.user.role, { expense: ["void"] });
  const { month: m } = await searchParams;
  const month = m && /^\d{4}-\d{2}$/.test(m) ? m : currentShopMonth();
  const [categories, wallets, settings, expenses] = await Promise.all([
    listExpenseCategories({ staffOnly: !full }),
    full ? prisma.wallet.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }) : [],
    getPosSettings(),
    // الموظفة ترى ما سجّلته فقط
    listExpenses(shopMonthRange(month), full ? undefined : session.user.id),
  ]);
  const active = expenses.filter((e) => !e.voided);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-bold">المصاريف</h1>
      <Card>
        <CardHeader>
          <CardTitle>مصروف جديد</CardTitle>
          <CardDescription>
            {full
              ? "من أي محفظة بعملتها، ويُحسب بالدولار بسعر يوم الدفع. النقد من صندوق المحل أثناء ورديتك ينقص من درجها."
              : "للأقسام المسموحة لكِ فقط، ويُخصم من نقد درج ورديتك."}
          </CardDescription>
        </CardHeader>
        {categories.length ? (
          <ExpenseForm
            full={full}
            today={shopDay(new Date())}
            limitSdg={settings.staffExpenseLimitSdg}
            categories={categories.map((c) => ({ value: c.id, label: c.name }))}
            wallets={wallets.map((w) => ({ value: w.id, label: `${w.name} (${w.currencyCode})` }))}
          />
        ) : (
          <p className="text-muted-foreground">لا توجد أقسام مصاريف مسموحة.</p>
        )}
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>مصاريف {month}</CardTitle>
            <form className="flex items-center gap-2">
              <input
                type="month"
                name="month"
                defaultValue={month}
                className="min-h-11 rounded-xl border border-input bg-card px-3"
                aria-label="الشهر"
              />
              <button type="submit" className="min-h-11 rounded-xl border border-border px-4 font-semibold">
                عرض
              </button>
            </form>
          </div>
          {full ? (
            <CardDescription>
              الإجمالي{" "}
              <bdi dir="ltr" className="font-bold text-foreground">
                {formatAmount(sumUsd(active.map((e) => e.amountUsd)).toString())} $
              </bdi>{" "}
              ({active.length} مصروف)
            </CardDescription>
          ) : null}
        </CardHeader>
        {expenses.length === 0 ? (
          <p className="text-muted-foreground">لا مصاريف في هذا الشهر.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {expenses.map((e) => (
              <li
                key={e.id}
                className={`flex flex-wrap items-start justify-between gap-2 rounded-xl border border-border p-3 ${e.voided ? "opacity-60" : ""}`}
              >
                <div className="min-w-0">
                  <p className={`font-semibold ${e.voided ? "line-through" : ""}`}>
                    {e.category} — {e.walletName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <bdi dir="ltr">{e.number}</bdi> · {formatDateTime(e.spentAt)}
                    {e.createdBy ? ` · ${e.createdBy}` : ""}
                    {e.fromShift ? " · من درج الوردية" : ""}
                    {e.note ? ` · ${e.note}` : ""}
                  </p>
                  {e.hasAttachment ? (
                    // رابط ملف عادي (لا Link): لا جلب مسبق لمسار ملف
                    <a
                      href={`/admin/expenses/${e.id}/attachment`}
                      target="_blank"
                      rel="noopener"
                      className="text-sm font-semibold underline"
                    >
                      صورة الفاتورة
                    </a>
                  ) : null}
                  {e.voided ? (
                    <p className="text-sm text-destructive">
                      ملغى{e.voided.by ? ` · ${e.voided.by}` : ""} — {e.voided.reason}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <bdi dir="ltr" className="font-bold tabular-nums">
                    {formatAmount(e.amount, e.currencyCode === "SDG" ? 0 : 2)} {e.currencyCode}
                  </bdi>
                  {full ? (
                    <span dir="ltr" className="text-xs text-muted-foreground tabular-nums">
                      = {formatAmount(e.amountUsd)} $
                    </span>
                  ) : null}
                  {full && !e.voided ? <VoidExpenseForm id={e.id} /> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
