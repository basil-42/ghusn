import { shopDay } from "@ghusn/core";
import { prisma } from "@ghusn/db";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { listContributions, totalCapitalUsd } from "@/lib/capital";
import { formatAmount, formatDateTime } from "@/lib/format";
import { voidContributionAction } from "./actions";
import { ContributionForm } from "./form";
import { PageHeader } from "@/components/admin/page-header";

export const metadata: Metadata = { title: "التمويل | غصن" };

export default async function CapitalPage() {
  await requirePermission({ capital: ["update"] });
  const [rows, total, currencies, wallets] = await Promise.all([
    listContributions(),
    totalCapitalUsd(),
    prisma.currency.findMany({ orderBy: { code: "asc" }, select: { code: true } }),
    prisma.wallet.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, currencyCode: true },
    }),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="التمويل"
        description={
          <>
            الإجمالي{" "}
            <bdi dir="ltr" className="font-bold text-foreground">
              {formatAmount(total)} $
            </bdi>{" "}
            — مال دخل المحل من خارجه، بعملته وسعر يومه. رأس المال واسترداده خارج النظام (D-142).
          </>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>تمويل جديد</CardTitle>
          <CardDescription>
            مال جديد دخل محفظة: تمويل، تغطية عجز، تحويل من خارج المحل. ليس دخلاً ولا ربحاً.
          </CardDescription>
        </CardHeader>
        <ContributionForm currencies={currencies.map((c) => c.code)} wallets={wallets} today={shopDay(new Date())} />
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>السجل</CardTitle>
        </CardHeader>
        {rows.length === 0 ? (
          <p className="text-muted-foreground">لا تمويل مسجّل بعد.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((c) => (
              <li
                key={c.id}
                className={`flex flex-wrap items-start justify-between gap-2 rounded-xl border border-border p-3 ${c.voided ? "opacity-60" : ""}`}
              >
                <div>
                  <p className={`font-semibold ${c.voided ? "line-through" : ""}`}>{c.partnerName}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(c.contributedAt)}
                    {c.wallet ? ` · إلى ${c.wallet}` : ""}
                    {c.note ? ` · ${c.note}` : ""}
                    {c.voided ? ` · ملغى: ${c.voided.reason}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <bdi dir="ltr" className="font-bold tabular-nums">
                    {formatAmount(c.amount)} {c.currencyCode}
                  </bdi>
                  <span dir="ltr" className="text-xs text-muted-foreground tabular-nums">
                    = {formatAmount(c.amountUsd)} $
                  </span>
                  {!c.voided ? (
                    <form action={voidContributionAction} className="flex gap-1">
                      <input type="hidden" name="id" value={c.id} />
                      <input
                        name="reason"
                        placeholder="سبب الإلغاء"
                        aria-label="سبب الإلغاء"
                        className="min-h-9 w-32 rounded-lg border border-input bg-card px-2 text-sm"
                      />
                      <Button type="submit" size="sm" variant="ghost" className="text-destructive">
                        إلغاء
                      </Button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
