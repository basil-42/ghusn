import { dec } from "@ghusn/core";
import { formatAmount, formatDateTime, formatMargin, formatMonthKey } from "@/lib/format";
import type { StatementData } from "@/lib/partners";

const usd = (v: string) => `${formatAmount(v)} $`;

function Row({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-2 ${strong ? "text-base font-bold" : ""}`}>
      <dt>
        {label}
        {sub ? <span className="block text-xs font-normal text-muted-foreground">{sub}</span> : null}
      </dt>
      <dd className="text-end tabular-nums">
        <bdi dir="ltr">{value}</bdi>
      </dd>
    </div>
  );
}

/**
 * كشف الشريك الشهري (D-130): صفحة A4 واحدة بهوية غصن — ملخص الشهر، ورأس المال، ونصيب الشريك.
 * نفس المكوّن للمعاينة في الإدارة وللصفحة التي يحوّلها الخادم إلى PDF.
 */
export function PartnerStatementDoc({ data, issuedAt }: { data: StatementData; issuedAt: Date }) {
  const c = data.capital;
  const loss = dec(data.netProfitUsd).lt(0);
  const share = dec(c.perPartnerUsd);
  const before = dec(c.recoveredUsd).minus(c.toCapitalThisMonthUsd);
  return (
    <article className="print-report mx-auto flex w-full max-w-[210mm] flex-col gap-6 bg-card p-8 text-sm text-foreground print:max-w-none print:p-0">
      {/* div لا header: رأس الشاشة (header) في تقارير الإدارة يُخفى عند الطباعة */}
      <div className="flex items-start justify-between gap-4 border-b-2 border-forest pb-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold">كشف الشريك الشهري</h1>
          <p className="text-base">
            {data.partner.name} · <b>{formatMonthKey(data.month)}</b>
          </p>
          <p className="text-xs text-muted-foreground">
            صدر في <bdi dir="ltr">{formatDateTime(issuedAt)}</bdi>
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- شعار SVG ثابت للطباعة */}
        <img src="/brand/logo-ar-mark-forest.svg" alt="غصن" width={120} height={62} />
      </div>

      <section className="rounded-2xl border-2 border-gold/60 bg-gold/10 p-5 text-center">
        <p className="text-sm text-muted-foreground">نصيبك هذا الشهر</p>
        <p className="font-display text-4xl font-bold tabular-nums">
          <bdi dir="ltr">{usd(share.toFixed(2))}</bdi>
        </p>
        <p className="mt-2 text-sm">
          {loss
            ? "لا توزيع هذا الشهر — الخسارة تُضاف إلى المتبقي من التمويل."
            : c.fullyRecovered && share.gt(0)
              ? `القابل للتوزيع ${usd(c.distributableUsd)} ÷ 4 شركاء (25% لكل واحد).`
              : `الربح كله يذهب لاسترداد التمويل أولاً — المتبقي ${usd(c.remainingUsd)}. بعد اكتماله يُوزَّع 25% لكل شريك.`}
        </p>
      </section>

      <section>
        <h2 className="mb-1 font-bold">ملخص الشهر</h2>
        <dl className="divide-y divide-border">
          <Row
            label="صافي المبيعات"
            value={usd(data.netRevenueUsd)}
            sub={`${formatAmount(data.netSalesSdg, 0)} ج.س بعد المرتجعات`}
          />
          <Row
            label="مجمل الربح"
            value={usd(data.grossProfitUsd)}
            sub={data.grossMargin ? `هامش ${formatMargin(data.grossMargin)}` : undefined}
          />
          <Row label="المصاريف" value={`− ${usd(data.expensesUsd)}`} />
          {data.expensesByCategory.map((e) => (
            <div key={e.name} className="flex justify-between gap-4 py-1 ps-4 text-xs text-muted-foreground">
              <dt>{e.name}</dt>
              <dd className="tabular-nums">
                <bdi dir="ltr">{usd(e.usd)}</bdi>
              </dd>
            </div>
          ))}
          {!dec(data.otherLossesUsd).isZero() ? (
            <Row
              label="خسائر المخزون وفروقات الصندوق"
              value={`${dec(data.otherLossesUsd).gt(0) ? "−" : "+"} ${usd(dec(data.otherLossesUsd).abs().toFixed(2))}`}
            />
          ) : null}
          <Row label={loss ? "صافي الخسارة" : "صافي الربح"} value={usd(data.netProfitUsd)} strong />
        </dl>
      </section>

      <section>
        <h2 className="mb-1 font-bold">التمويل واسترداده</h2>
        <dl className="divide-y divide-border">
          <Row label="التمويل الكلي" value={usd(c.totalUsd)} />
          <Row label="المسترد قبل هذا الشهر" value={usd(before.toFixed(2))} />
          <Row label="لاسترداد التمويل هذا الشهر" value={usd(c.toCapitalThisMonthUsd)} />
          <Row label="المسترد حتى الآن" value={usd(c.recoveredUsd)} />
          <Row
            label={c.fullyRecovered ? "اكتمل استرداد التمويل" : "المتبقي للاسترداد"}
            value={usd(c.remainingUsd)}
            strong
          />
        </dl>
      </section>

      <footer className="mt-auto border-t border-border pt-3 text-xs text-muted-foreground">
        المبالغ بالدولار (عملة الأساس) بسعر يوم كل عملية، والجنيه للمعلومة. أجر التشغيل للشريكات مصروف شهري، ثم يسترد
        الربح التمويل أولاً، وبعد اكتماله يُوزَّع 25% لكل شريك — كما اتفق الشركاء.
      </footer>
    </article>
  );
}
