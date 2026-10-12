import { Download, Eye, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount, formatDateTime, formatMonthKey } from "@/lib/format";
import { LINK_DAYS, listPartners, renderToken, statementLink, statementsForMonth } from "@/lib/partners";
import { currentShopMonth, monthlyReport, reportMonths } from "@/lib/reports";
import { whatsappLink } from "@/lib/site";
import { togglePartnerAction } from "./actions";
import { IssueButton, PartnerForm } from "./forms";

export const metadata: Metadata = { title: "كشوف الشركاء | غصن" };

/**
 * كشوف الشركاء الشهرية (D-130): PDF يُنشأ في الخادم ويُحفظ كما صدر، ويُرسل لكل شريك على واتساب برابط
 * صالح 7 أيام. تصدر تلقائياً يوم 1 من كل شهر للشهر السابق.
 */
export default async function PartnersPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const session = await requirePermission({ partner: ["read"] });
  const manage = roleCan(session.user.role, { partner: ["manage"] });
  const months = (await reportMonths()).filter((m) => m < currentShopMonth());
  const q = (await searchParams).month;
  const month = q && months.includes(q) ? q : (months[0] ?? null);
  const [rows, partners, report] = await Promise.all([
    month ? statementsForMonth(month) : Promise.resolve([]),
    manage ? listPartners(true) : Promise.resolve([]),
    month ? monthlyReport(month) : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="كشوف الشركاء"
        description="كشف شهري لكل شريك: ملخص الشهر، واسترداد التمويل، ونصيبه — PDF يُرسل على واتساب. يصدر تلقائياً يوم 1 من كل شهر."
        actions={
          months.length ? (
            <form className="flex items-center gap-2">
              <select
                name="month"
                defaultValue={month ?? undefined}
                className="min-h-11 flex-1 rounded-xl border border-input bg-card px-3"
                aria-label="الشهر"
              >
                {months.map((m) => (
                  <option key={m} value={m}>
                    {formatMonthKey(m)}
                  </option>
                ))}
              </select>
              <button type="submit" className="min-h-11 rounded-xl border border-border px-4 font-semibold">
                عرض
              </button>
            </form>
          ) : null
        }
      />

      {!month || !report ? (
        <Card className="p-6 text-muted-foreground">لا شهر مكتمل بعد — أول كشف يصدر بعد نهاية أول شهر.</Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{formatMonthKey(month)}</CardTitle>
            <CardDescription>
              صافي الربح <bdi dir="ltr">{formatAmount(report.netProfitUsd)} $</bdi> · لاسترداد التمويل{" "}
              <bdi dir="ltr">{formatAmount(report.capital.toCapitalThisMonthUsd)} $</bdi> · نصيب كل شريك{" "}
              <b>
                <bdi dir="ltr">{formatAmount(report.capital.perPartnerUsd)} $</bdi>
              </b>
            </CardDescription>
          </CardHeader>
          {rows.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              أضيفي الشركاء أدناه (الاسم ورقم واتساب) لتصدر كشوفهم.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map(({ partner, statement }) => {
                const link = statement ? statementLink(statement.id) : null;
                const wa =
                  link &&
                  whatsappLink(
                    partner.phone,
                    `السلام عليكم ${partner.name}،\nكشف غصن لشهر ${formatMonthKey(month)}:\n${link}\n(الرابط صالح ${LINK_DAYS} أيام)`,
                  );
                return (
                  <li key={partner.id} className="flex flex-col gap-3 px-6 py-4 lg:flex-row lg:items-center">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <b>{partner.name}</b>
                      <span className="text-sm text-muted-foreground">
                        {statement ? (
                          <>
                            صدر {formatDateTime(statement.issuedAt)} · {statement.issuedBy} · نصيبه{" "}
                            <bdi dir="ltr">{formatAmount(statement.shareUsd)} $</bdi>
                          </>
                        ) : (
                          "لم يصدر الكشف بعد"
                        )}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {statement ? (
                        <>
                          {wa ? (
                            <Button asChild>
                              <a href={wa} target="_blank" rel="noreferrer">
                                <MessageCircle aria-hidden /> إرسال على واتساب
                              </a>
                            </Button>
                          ) : null}
                          <Button asChild variant="outline">
                            <a href={`/admin/reports/partners/file/${statement.id}`} download>
                              <Download aria-hidden /> تنزيل
                            </a>
                          </Button>
                        </>
                      ) : null}
                      <Button asChild variant="outline">
                        <a
                          href={`/doc/partner-statement/${renderToken(partner.id, month)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Eye aria-hidden /> معاينة
                        </a>
                      </Button>
                      {manage && partner.isActive ? (
                        <IssueButton
                          month={month}
                          partnerId={partner.id}
                          label={statement ? "إعادة إصدار" : "إصدار PDF"}
                          reissue={Boolean(statement)}
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {manage && rows.some((r) => !r.statement && r.partner.isActive) ? (
            <div className="border-t border-border px-6 py-4">
              <IssueButton month={month} label="إصدار كشوف كل الشركاء" />
            </div>
          ) : null}
        </Card>
      )}

      {manage ? (
        <Card>
          <CardHeader>
            <CardTitle>الشركاء</CardTitle>
            <CardDescription>
              أربعة شركاء بنسبة 25% لكل واحد. رقم واتساب لإرسال الكشف (يُكتب بالرمز الدولي أو 09… للسودان).
            </CardDescription>
          </CardHeader>
          <div className="flex flex-col gap-4 px-6 pb-6">
            {partners.map((p) => (
              <div key={p.id} className="flex flex-col gap-2 border-b border-border pb-4">
                <PartnerForm partner={p} />
                <form action={togglePartnerAction} className="self-start">
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="active" value={p.isActive ? "0" : "1"} />
                  <button
                    type="submit"
                    className="text-sm font-semibold text-muted-foreground underline-offset-4 hover:underline"
                  >
                    {p.isActive ? "إيقاف" : "تفعيل"}
                  </button>
                  {p.isActive ? null : <span className="ms-2 text-xs text-muted-foreground">موقوف</span>}
                </form>
              </div>
            ))}
            {partners.filter((p) => p.isActive).length < 4 ? <PartnerForm /> : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
