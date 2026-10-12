import { dec, salesTimeNotes, type TimeCell, type TimeNote } from "@ghusn/core";
import type { Metadata } from "next";
import { ExportLink } from "@/components/admin/export-button";
import { PageHeader } from "@/components/admin/page-header";
import { PrintButton } from "@/components/admin/print-button";
import { PrintHeader } from "@/components/admin/print-header";
import { ChipNav, ReportNotes } from "@/components/admin/report-bits";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount, formatMargin, formatShortDate } from "@/lib/format";
import { TIME_WEEKS, salesTimes, type TimeChannel } from "@/lib/purchasing-report";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "أوقات البيع | غصن" };

/** أسبوع السودان يبدأ السبت (اليوم 0). */
const DAYS = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
const CHANNELS: { key: TimeChannel; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "shop", label: "المحل" },
  { key: "web", label: "المتجر" },
];
/** درجات من الهوية: لا شيء ← غابة. */
const SHADES = ["bg-muted", "bg-sage/20", "bg-sage/40", "bg-sage/60", "bg-sage/80", "bg-sage", "bg-forest"];

const hourLabel = (h: number) => `${h % 12 || 12} ${h % 24 < 12 ? "ص" : "م"}`;
const range = (from: number, to: number) => `${hourLabel(from)} – ${hourLabel(to)}`;

function noteText(n: TimeNote, metricLabel: string): string {
  switch (n.kind) {
    case "busiest":
      return `أزحم وقت: ${DAYS[n.day]} ${range(n.fromHour, n.toHour)} (${formatMargin(n.share)} من ${metricLabel} الفترة).`;
    case "quietest_day":
      return dec(n.share).isZero()
        ? `لا مبيعات يوم ${DAYS[n.day]} في هذه الفترة.`
        : `أهدأ يوم: ${DAYS[n.day]} (${formatMargin(n.share)} فقط) — مناسب للجرد واستلام الشحنات.`;
    case "web_peak":
      return `طلبات المتجر تبلغ ذروتها ${range(n.fromHour, n.toHour)}.`;
  }
}

function merge(a: TimeCell[], b: TimeCell[]): TimeCell[] {
  const map = new Map<string, TimeCell>();
  for (const c of [...a, ...b]) {
    const k = `${c.day}-${c.hour}`;
    const prev = map.get(k);
    map.set(
      k,
      prev ? { ...c, count: prev.count + c.count, amount: dec(prev.amount).plus(c.amount).toFixed(2) } : { ...c },
    );
  }
  return [...map.values()];
}

export default async function SalesTimesPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; m?: string; c?: string }>;
}) {
  const session = await requirePermission({ report: ["read"] });
  const q = await searchParams;
  const weeks = (TIME_WEEKS as readonly string[]).includes(q.w ?? "") ? Number(q.w) : 4;
  const metric = q.m === "amount" ? "amount" : "count";
  const channel = CHANNELS.find((c) => c.key === q.c)?.key ?? "all";
  const data = await salesTimes(weeks);
  const cells = channel === "shop" ? data.shop : channel === "web" ? data.web : merge(data.shop, data.web);
  const metricLabel = metric === "count" ? "فواتير" : "مبيعات";
  const notes = salesTimeNotes(cells, metric, channel === "all" ? data.web : undefined);

  const val = (c: TimeCell | undefined) => (c ? (metric === "count" ? dec(c.count) : dec(c.amount)) : dec(0));
  const at = (day: number, hour: number) => cells.find((c) => c.day === day && c.hour === hour);
  const active = cells.filter((c) => val(c).gt(0)).map((c) => c.hour);
  const from = Math.min(9, ...active);
  const to = Math.max(23, ...active);
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  // عناوين كل 3 ساعات تمتد على أعمدتها حتى تقع فوق ساعتها بالضبط
  const groups = hours.reduce<{ from: number; span: number }[]>((acc, h) => {
    const last = acc[acc.length - 1];
    if (last && h % 3 !== 0) last.span += 1;
    else acc.push({ from: h, span: 1 });
    return acc;
  }, []);
  const max = cells.reduce((a, c) => (val(c).gt(a) ? val(c) : a), dec(0));
  const shade = (v: ReturnType<typeof dec>) =>
    v.isZero() || max.isZero() ? SHADES[0] : SHADES[Math.min(6, 1 + Math.floor(v.div(max).mul(5.99).toNumber()))];
  const show = (v: ReturnType<typeof dec>) => (metric === "count" ? v.toFixed(0) : `${formatAmount(v, 0)} ج.س`);
  const dayTotals = DAYS.map((_, d) => hours.reduce((a, h) => a.plus(val(at(d, h))), dec(0)));
  const query = (patch: Record<string, string>) => {
    const p = { w: String(weeks), m: metric, c: channel, ...patch };
    return `?w=${p.w}&m=${p.m}&c=${p.c}`;
  };
  const period = `${formatShortDate(data.start)} – ${formatShortDate(new Date())}`;

  return (
    <div className="print-report flex flex-col gap-6">
      <PrintHeader title="أوقات البيع" period={`آخر ${weeks} أسابيع · ${period}`} issuedBy={session.user.name} />
      <PageHeader
        title="أوقات البيع"
        description="متى يشتري الناس؟ بتوقيت الخرطوم — فواتير المحل بوقت البيع، وطلبات المتجر بوقت إنشائها (بلا الملغاة)."
        actions={
          <>
            <ExportLink href={`/admin/export/times?w=${weeks}`} />
            <PrintButton />
          </>
        }
      />

      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <ChipNav
          label="الفترة"
          items={TIME_WEEKS.map((w) => ({
            href: query({ w }),
            label: w === "4" ? "آخر 4 أسابيع" : "12 أسبوعاً",
            active: Number(w) === weeks,
          }))}
        />
        <ChipNav
          label="المقياس"
          items={[
            { href: query({ m: "count" }), label: "عدد الفواتير", active: metric === "count" },
            { href: query({ m: "amount" }), label: "المبيعات ج.س", active: metric === "amount" },
          ]}
        />
        <ChipNav
          label="القناة"
          items={CHANNELS.map((c) => ({ href: query({ c: c.key }), label: c.label, active: c.key === channel }))}
        />
      </div>

      <Card className="overflow-hidden p-4 md:p-5">
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-[3px] text-xs tabular-nums print:min-w-0">
            <caption className="sr-only">{metric === "count" ? "عدد الفواتير" : "المبيعات"} حسب اليوم والساعة</caption>
            <thead>
              <tr>
                <th className="w-16" />
                {groups.map((g) => (
                  <th
                    key={g.from}
                    colSpan={g.span}
                    scope="colgroup"
                    className="text-start font-normal whitespace-nowrap text-muted-foreground"
                  >
                    {g.from % 3 === 0 ? hourLabel(g.from) : ""}
                  </th>
                ))}
                <th scope="col" className="w-24 ps-2 text-end font-semibold text-muted-foreground">
                  اليوم
                </th>
              </tr>
            </thead>
            <tbody>
              {DAYS.map((name, d) => (
                <tr key={name}>
                  <th scope="row" className="text-start font-semibold">
                    {name}
                  </th>
                  {hours.map((h) => {
                    const c = at(d, h);
                    const v = val(c);
                    const label = `${name} ${hourLabel(h)}: ${c ? `${c.count} فاتورة · ${formatAmount(c.amount, 0)} ج.س${c.count ? ` · متوسط ${formatAmount(dec(c.amount).div(c.count), 0)}` : ""}` : "لا شيء"}`;
                    return (
                      <td key={h} title={label} className={cn("h-7 rounded", shade(v))}>
                        <span className="sr-only">{label}</span>
                      </td>
                    );
                  })}
                  <td className="ps-2 text-end font-semibold">
                    <bdi dir="ltr">{show(dayTotals[d] ?? dec(0))}</bdi>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          أقل
          <span className="flex gap-0.5">
            {SHADES.map((s) => (
              <span key={s} className={cn("h-2.5 w-4 rounded-sm", s)} />
            ))}
          </span>
          أكثر · مرّري على مربع لعدد الفواتير ومتوسطها
        </div>
      </Card>

      <ReportNotes notes={notes.map((n) => noteText(n, metricLabel))} empty="لا مبيعات في هذه الفترة بعد." />
    </div>
  );
}
