import {
  DASHBOARD_PERIODS,
  type DashboardPeriod,
  type DashboardRange,
  SHOP_TIME_ZONE,
  addDays,
  dashboardRange,
  dec,
  shopDay,
} from "@ghusn/core";
import { ArrowLeft, ChevronDown } from "lucide-react";
import Link from "next/link";
import { type ChartPoint, SalesChart } from "@/components/admin/sales-chart";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleCan } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/auth/session";
import { expiringBatches, lowStock, openShifts, periodKpis, salesSeries, topProducts } from "@/lib/dashboard";
import { rateTicker } from "@/lib/exchange-rates";
import { formatAmount, formatDateTime, formatDay, formatPercent, formatRate, formatTime } from "@/lib/format";
import { countNewOrders, orderTabCounts } from "@/lib/orders";
import { countPriceReview } from "@/lib/pricing";
import { countSalesToReview } from "@/lib/sales";
import { getOpenShift, listLargeShortages, shiftSummary } from "@/lib/shifts";
import { listDueSoon } from "@/lib/shipments";
import { countPendingFor } from "@/lib/stock-adjustments";
import { activeCount } from "@/lib/stock-counts";
import { getGeneralSettings } from "@/lib/settings";
import { listWallets } from "@/lib/wallets";

const sdg = (v: string) => `${formatAmount(v, 0)} ج.س`;
const dayLabel = new Intl.DateTimeFormat("ar-u-nu-latn", { day: "numeric", month: "short", timeZone: "UTC" });
const hourFormat = new Intl.DateTimeFormat("en-u-nu-latn", {
  hour: "numeric",
  hourCycle: "h23",
  timeZone: SHOP_TIME_ZONE,
});

const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  today: "اليوم",
  "this-week": "هذا الأسبوع",
  "last-week": "الأسبوع السابق",
  "this-month": "هذا الشهر",
  "last-month": "الشهر السابق",
  "this-year": "هذه السنة",
  "last-year": "السنة السابقة",
};
const COMPARED_TO: Record<DashboardPeriod, string> = {
  today: "عن نفس الوقت أمس",
  "this-week": "عن نفس الأيام من الأسبوع السابق",
  "last-week": "عن الأسبوع الذي قبله",
  "this-month": "عن نفس الأيام من الشهر السابق",
  "last-month": "عن الشهر الذي قبله",
  "this-year": "عن نفس المدة من السنة السابقة",
  "last-year": "عن السنة التي قبلها",
};
const MENU: { group: string; periods: DashboardPeriod[] }[] = [
  { group: "يوم", periods: ["today"] },
  { group: "أسبوع", periods: ["this-week", "last-week"] },
  { group: "شهر", periods: ["this-month", "last-month"] },
  { group: "سنة", periods: ["this-year", "last-year"] },
];
// روابط قديمة (قبل D-133) تبقى تعمل
const LEGACY: Record<string, DashboardPeriod> = { week: "this-week", month: "this-month" };
const monthLabel = new Intl.DateTimeFormat("ar-u-nu-latn", { month: "long", year: "numeric", timeZone: "UTC" });
const monthShort = new Intl.DateTimeFormat("ar-u-nu-latn", { month: "short", timeZone: "UTC" });

const weekdayDay = new Intl.DateTimeFormat("ar-u-nu-latn", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const weekdayShort = new Intl.DateTimeFormat("ar-u-nu-latn", { weekday: "long", day: "numeric", timeZone: "UTC" });

/** أسماء أعمدة الرسم: الكامل للتلميح والجدول، والمختصر تحت المحور (لبعضها في الشهر). */
function bucketLabel(key: string, bucket: DashboardRange["bucket"]) {
  return bucket === "day"
    ? weekdayDay.format(new Date(`${key}T00:00:00Z`))
    : monthLabel.format(new Date(`${key}-01T00:00:00Z`));
}
function bucketTick(key: string, i: number, n: number, bucket: DashboardRange["bucket"]) {
  if (bucket === "month") return monthShort.format(new Date(`${key}-01T00:00:00Z`));
  // أسبوع أو آخر 7 أيام: اسم اليوم ورقمه؛ الشهر: رقم كل ثالث يوم
  return n <= 7 ? weekdayShort.format(new Date(`${key}T00:00:00Z`)) : i % 3 === 0 ? String(Number(key.slice(8))) : "";
}

/** مبلغ مختصر للمحور وفوق الأعمدة: 1.5م، 750 ألف (عرض فقط — الحساب بالـ Decimal في الخادم). */
function compactSdg(v: number): string {
  const one = (x: number) => String(Number(x.toFixed(1)));
  if (v >= 1_000_000) return `${one(v / 1_000_000)}م`;
  if (v >= 1_000) return `${one(v / 1_000)} ألف`;
  return String(Math.round(v));
}

/** أعلى خط في المحور برقم مستدير (1، 2، 2.5، 5 × 10^ن) ونحو 4 خطوط تحته. */
function niceAxis(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
  const lines: number[] = [];
  for (let v = 0; v < max + step; v += step) lines.push(v);
  return lines;
}

/** وصف الفترة في القائمة: تواريخها أو مقابلها. */
function periodHint(r: DashboardRange, period: DashboardPeriod) {
  if (period === "today") return "مقابل أمس";
  const first = shopDay(r.start);
  const last = addDays(shopDay(r.periodEnd), -1);
  if (r.bucket === "month") return first.slice(0, 4);
  if (period.endsWith("month")) return monthLabel.format(new Date(`${first}T00:00:00Z`));
  return `${dayLabel.format(new Date(`${first}T00:00:00Z`))} – ${dayLabel.format(new Date(`${last}T00:00:00Z`))}`;
}

type Can = (p: Parameters<typeof roleCan>[1]) => boolean;
type User = { id: string; name: string; role?: string | null };

function greeting(name: string, now: Date) {
  const h = Number(hourFormat.format(now));
  return `${h < 12 ? "صباح الخير" : "مساء الخير"} يا ${name}`;
}

/**
 * الرئيسية (D-120): للمالك والمدير أرقام الفترة وما يحتاج إجراءً؛ للموظفة ورديتها ومهامها بلا أرقام مالية كلية.
 */
export default async function AdminHome({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { user } = await requireSession();
  const can: Can = (p) => roleCan(user.role, p);
  if (!can({ sale: ["read"] })) return <StaffHome user={user} can={can} />;
  const { p } = await searchParams;
  const period = (DASHBOARD_PERIODS as readonly string[]).includes(p ?? "")
    ? (p as DashboardPeriod)
    : (LEGACY[p ?? ""] ?? "today");
  return <OwnerHome user={user} can={can} period={period} />;
}

async function OwnerHome({ user, can, period }: { user: User; can: Can; period: DashboardPeriod }) {
  const now = new Date();
  const { weekStartsOn } = await getGeneralSettings();
  const range = dashboardRange(period, now, weekStartsOn);
  const [kpis, series, top, shifts, orders, tabs, stock, expiring, wallets, rate] = await Promise.all([
    periodKpis(range),
    salesSeries(range, now),
    topProducts(3, now),
    openShifts(),
    can({ order: ["read"] }) ? countNewOrders() : null,
    can({ order: ["read"] }) ? orderTabCounts() : null,
    can({ stock: ["read"] }) ? lowStock(4) : null,
    can({ stock: ["read"] }) ? expiringBatches(3, now) : null,
    can({ wallet: ["update"] }) ? listWallets() : null,
    // سعر الصرف في الرئيسية للمالك فقط (D-133)
    can({ exchangeRate: ["dashboard"] }) ? rateTicker(now) : null,
  ]);
  const [due, priceReview, salesReview, shortages, adjustments] = await Promise.all([
    can({ supplier: ["read"] }) ? listDueSoon(7) : [],
    can({ price: ["approve"] }) ? countPriceReview() : 0,
    countSalesToReview(),
    can({ report: ["read"] }) ? listLargeShortages() : [],
    can({ stock: ["approve"] }) ? countPendingFor({ id: user.id, role: user.role }) : 0,
  ]);
  const paymentReview = can({ order: ["payment"] }) ? (orders?.paymentReview ?? 0) : 0;
  const seeProfit = can({ report: ["read"] });

  // شريط «يحتاج إجراء»: يختفي حين يخلو. سعر الجنيه القديم له شريطه الذهبي في الإطار فلا يتكرر هنا.
  const attention = [
    paymentReview && { href: "/admin/orders", text: `${paymentReview} إشعار بنكك للمراجعة`, urgent: false },
    orders?.new && { href: "/admin/orders", text: `${orders.new} طلب جديد`, urgent: false },
    salesReview && { href: "/admin/sales", text: `${salesReview} فاتورة دون اتصال للمراجعة`, urgent: true },
    shortages.length && { href: "/admin/sales", text: `عجز كبير في ${shortages.length} وردية`, urgent: true },
    priceReview && { href: "/admin/pricing", text: `${priceReview} صنف يحتاج مراجعة سعر`, urgent: false },
    adjustments && { href: "/admin/stock/adjustments", text: `${adjustments} تسوية مخزون للاعتماد`, urgent: false },
    due.length && {
      href: "/admin/suppliers",
      text: `${due.length} دفعة لمورد خلال 7 أيام`,
      urgent: due.some((d) => d.overdue),
    },
  ].filter(Boolean) as { href: string; text: string; urgent: boolean }[];

  // المحور: خطوط بأرقام مستديرة، والأعمدة نسبة من أعلاها
  const axis = niceAxis(series.reduce((m, pt) => Math.max(m, dec(pt.totalSdg).toNumber()), 0));
  const axisTop = axis[axis.length - 1] ?? 0;
  const ratio = (v: string) => (axisTop > 0 ? Math.max(dec(v).toNumber() / axisTop, 0) : 0);
  const nowKey = range.bucket === "day" ? shopDay(now) : shopDay(now).slice(0, 7);
  const points: ChartPoint[] = series.map((pt, i) => ({
    key: pt.key,
    label: bucketLabel(pt.key, range.bucket),
    tick: period === "today" && pt.key === nowKey ? "اليوم" : bucketTick(pt.key, i, series.length, range.bucket),
    shop: formatAmount(pt.shopSdg, 0),
    store: formatAmount(pt.storeSdg, 0),
    total: formatAmount(pt.totalSdg, 0),
    short: compactSdg(dec(pt.totalSdg).toNumber()),
    ratio: ratio(pt.totalSdg),
    future: pt.future,
    current: !range.complete && pt.key === nowKey,
  }));
  const chartTotal = series.reduce((a, pt) => a.plus(pt.totalSdg), dec(0));
  const hasSales = chartTotal.gt(0) || series.some((pt) => dec(pt.totalSdg).gt(0));

  const pipeline = tabs
    ? [
        { key: "new", label: "جديدة وبانتظار الدفع", count: tabs.new },
        { key: "confirmed", label: "مؤكدة", count: tabs.confirmed },
        { key: "preparing", label: "قيد التجهيز", count: tabs.preparing },
        { key: "ready", label: "جاهزة", count: tabs.ready },
        { key: "delivery", label: "مع التوصيل", count: tabs.delivery },
      ]
    : [];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">
            {formatDay(now)}
            {" · "}
            <Link href="/admin/sales" className="hover:underline">
              {shifts.length ? `${shifts.length} وردية مفتوحة` : "لا ورديات مفتوحة"}
            </Link>
          </p>
          <h1 className="font-display text-3xl font-bold">{greeting(user.name, now)}</h1>
        </div>
        <div className="flex flex-wrap items-stretch gap-2">
          {rate ? <RateCard rate={rate} /> : null}
          {/* قائمة الفترة (D-133): تتحكم في الأرقام والرسم معاً، وتُحفظ في الرابط */}
          <details key={period} className="group relative">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-xl bg-forest px-4 text-sm font-bold text-ivory [&::-webkit-details-marker]:hidden">
              <span className="flex flex-col leading-tight">
                {PERIOD_LABELS[period]}
                <span className="text-xs font-normal opacity-80">{periodHint(range, period)}</span>
              </span>
              <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
            </summary>
            <nav
              aria-label="فترة الأرقام"
              className="absolute end-0 top-full z-20 mt-2 flex w-64 flex-col rounded-xl border border-line bg-card p-1.5 text-sm shadow-lg"
            >
              {MENU.map((g) => (
                <div key={g.group} className="flex flex-col">
                  <span className="px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground">{g.group}</span>
                  {g.periods.map((k) => (
                    <Link
                      key={k}
                      href={k === "today" ? "/admin" : `/admin?p=${k}`}
                      aria-current={k === period ? "page" : undefined}
                      className={`flex min-h-10 items-center justify-between gap-2 rounded-lg px-3 hover:bg-muted ${
                        k === period ? "bg-muted font-bold" : ""
                      }`}
                    >
                      {PERIOD_LABELS[k]}
                      <span className="text-xs text-muted-foreground">
                        {periodHint(dashboardRange(k, now, weekStartsOn), k)}
                      </span>
                    </Link>
                  ))}
                </div>
              ))}
            </nav>
          </details>
        </div>
      </header>

      {attention.length ? (
        <section
          aria-label="يحتاج إجراء"
          className="flex flex-wrap items-center gap-2 rounded-2xl border border-sand bg-card px-4 py-3"
        >
          <b className="text-sm text-warning">يحتاج إجراء · {attention.length}</b>
          {attention.map((a) => (
            <Link
              key={a.text}
              href={a.href}
              className={`flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold ${
                a.urgent ? "bg-danger/10 text-danger hover:bg-danger/15" : "bg-gold/15 hover:bg-gold/25"
              }`}
            >
              {a.text}
              <ArrowLeft aria-hidden className="size-4" />
            </Link>
          ))}
        </section>
      ) : null}

      <section aria-label={`أرقام ${PERIOD_LABELS[period]}`} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          title="المبيعات"
          value={sdg(kpis.netSdg)}
          sub={
            <>
              <Growth value={kpis.change} label={COMPARED_TO[period]} />
              {` · ${kpis.count} فاتورة وطلب`}
            </>
          }
        />
        {seeProfit ? (
          <Stat
            title="مجمل الربح"
            value={sdg(kpis.profitSdg)}
            sub={
              <>
                <span className="block font-semibold tabular-nums">
                  ≈ <bdi dir="ltr">${formatAmount(kpis.profitUsd)}</bdi>
                  {kpis.margin !== null ? ` · هامش ${formatPercent(kpis.margin)}` : null}
                </span>
                <Growth value={kpis.profitChange} label={COMPARED_TO[period]} />
              </>
            }
          />
        ) : null}
        <Stat
          title="متوسط الفاتورة"
          value={kpis.avgTicketSdg ? sdg(kpis.avgTicketSdg) : "—"}
          sub={<Growth value={kpis.avgTicketChange} label={COMPARED_TO[period]} />}
        />
        <Stat
          title="العملاء"
          value={<span className="tabular-nums">{kpis.customers}</span>}
          sub={
            <>
              <Growth value={kpis.customersChange} label="" />
              {" · "}
              {can({ customer: ["read"] }) ? (
                <Link href="/admin/customers" className="hover:underline">
                  منهم {kpis.newCustomers} جديد ←
                </Link>
              ) : (
                `منهم ${kpis.newCustomers} جديد`
              )}
            </>
          }
        />
      </section>

      <div className={`grid gap-4 ${tabs ? "lg:grid-cols-[2fr_1fr]" : ""}`}>
        <Card className="min-w-0">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <CardTitle>المبيعات · {period === "today" ? "آخر 7 أيام" : PERIOD_LABELS[period]}</CardTitle>
                <CardDescription>
                  {range.bucket === "day" ? "كل عمود يوم" : "كل عمود شهر"} — المحل والمتجر معاً
                  {range.complete ? "" : period === "today" ? "، واليوم بلون أغمق" : "، والجاري بلون أغمق"}. مرّر على
                  العمود للتفاصيل.
                </CardDescription>
              </div>
              <div className="flex flex-col text-sm">
                <span className="text-xs text-muted-foreground">المجموع</span>
                <span className="text-lg font-bold tabular-nums">{sdg(chartTotal.toFixed(0))}</span>
              </div>
            </div>
          </CardHeader>
          {hasSales ? (
            <SalesChart
              points={points}
              gridlines={axis.map((v) => ({ ratio: axisTop > 0 ? v / axisTop : 0, label: compactSdg(v) }))}
              ariaLabel={`المبيعات ${period === "today" ? "آخر 7 أيام" : PERIOD_LABELS[period]}`}
            />
          ) : (
            <p className="text-muted-foreground">لا مبيعات في هذه الفترة بعد.</p>
          )}
        </Card>
        {tabs ? (
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>طلبات المتجر الآن</CardTitle>
            </CardHeader>
            <ul className="flex flex-col gap-2">
              {pipeline.map((s) => (
                <li key={s.key}>
                  <Link
                    href={s.key === "new" ? "/admin/orders" : `/admin/orders?tab=${s.key}`}
                    className={`flex min-h-11 items-center justify-between gap-2 rounded-xl px-3 text-sm hover:bg-muted ${
                      s.key === "new" && s.count ? "bg-gold/15" : "border border-line"
                    }`}
                  >
                    <span>{s.label}</span>
                    <b className="tabular-nums">{s.count}</b>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {wallets ? (
          <Card className="min-w-0">
            <CardHeader>
              <div className="flex items-baseline justify-between gap-2">
                <CardTitle>المال</CardTitle>
              </div>
            </CardHeader>
            <ul className="flex flex-col divide-y divide-line text-sm">
              {wallets
                .filter((w) => w.isActive)
                .map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`/admin/wallets/${w.id}`} className="min-w-0 hover:underline">
                      {w.name}
                    </Link>
                    <bdi dir="ltr" className="shrink-0 font-semibold tabular-nums">
                      {formatAmount(w.balance, w.currencyCode === "SDG" ? 0 : 2)} {w.symbol}
                    </bdi>
                  </li>
                ))}
            </ul>
          </Card>
        ) : null}

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>الأكثر مبيعاً هذا الشهر</CardTitle>
          </CardHeader>
          {top.length ? (
            <ol className="flex flex-col divide-y divide-line text-sm">
              {top.map((t, i) => (
                <li key={t.productId} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/admin/products/${t.productId}`} className="min-w-0 font-semibold hover:underline">
                    <span className="text-muted-foreground tabular-nums">{i + 1}. </span>
                    {t.name}
                  </Link>
                  <span className="shrink-0 text-muted-foreground tabular-nums">{formatAmount(t.qty, 0)} قطعة</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">لا مبيعات هذا الشهر بعد.</p>
          )}
          {can({ report: ["read"], cost: ["read"] }) ? (
            <Link href="/admin/insights" className="text-sm font-semibold hover:underline">
              كل التحليلات ←
            </Link>
          ) : null}
        </Card>

        {stock ? (
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>تنبيهات المخزون</CardTitle>
              <CardDescription>
                {stock.total ? `${stock.total} صنف قارب على النفاد` : "المخزون فوق الحد."}
                {expiring?.total ? ` · ${expiring.total} دفعة صلاحيتها قريبة` : ""}
              </CardDescription>
            </CardHeader>
            <LowStockList items={stock.items} />
            {expiring?.items.length ? (
              <ul className="flex flex-col gap-1.5 border-t border-line pt-2 text-sm">
                {expiring.items.map((b) => (
                  <li key={b.id} className="flex justify-between gap-2">
                    <Link href={`/admin/products/${b.productId}`} className="min-w-0 hover:underline">
                      {b.label}
                    </Link>
                    <span className={`shrink-0 tabular-nums ${b.expired ? "font-semibold text-danger" : ""}`}>
                      {b.expired ? "منتهية" : b.expiresOn}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <Link
              href={can({ report: ["read"], cost: ["read"] }) ? "/admin/insights?tab=reorder" : "/admin/stock"}
              className="text-sm font-semibold hover:underline"
            >
              {can({ report: ["read"], cost: ["read"] }) ? "اقتراحات إعادة الطلب ←" : "كل المخزون ←"}
            </Link>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

/** رئيسية الموظفة (D-120): ورديتها، مهامها، وما قارب النفاد — بلا أرباح أو محافظ أو تكاليف. */
async function StaffHome({ user, can }: { user: User; can: Can }) {
  const now = new Date();
  const sells = can({ pos: ["sell"] });
  const [shift, tabs, count, stock] = await Promise.all([
    sells ? getOpenShift(user.id) : null,
    can({ order: ["read"] }) ? orderTabCounts() : null,
    can({ stock: ["adjust"] }) ? activeCount() : null,
    can({ stock: ["read"] }) ? lowStock(5) : null,
  ]);
  const summary = shift ? await shiftSummary(shift.id) : null;

  const tasks = [
    tabs?.new && { href: "/admin/orders", text: `${tabs.new} طلب جديد`, hint: "ابدئي التأكيد والتجهيز", hot: true },
    tabs?.ready && {
      href: "/admin/orders?tab=ready",
      text: `${tabs.ready} طلب جاهز`,
      hint: "بانتظار الاستلام أو التوصيل",
      hot: false,
    },
    count?.status === "OPEN" && {
      href: `/admin/stock/counts/${count.id}/count`,
      text: `جرد ${count.category?.nameAr ?? "المحل"}`,
      hint: "جرد مفتوح — أكملي العدّ",
      hot: false,
    },
  ].filter(Boolean) as { href: string; text: string; hint: string; hot: boolean }[];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{formatDay(now)}</p>
          <h1 className="font-display text-3xl font-bold">{greeting(user.name, now)}</h1>
        </div>
        {sells ? (
          <Link
            href="/pos"
            className="flex min-h-13 items-center gap-3 rounded-2xl bg-primary px-6 text-lg font-bold text-primary-foreground"
          >
            بيع جديد
            <ArrowLeft aria-hidden className="size-5" />
          </Link>
        ) : null}
      </header>

      {sells ? (
        <section aria-label="ورديتك" className="grid gap-3 sm:grid-cols-3">
          <Stat
            title="ورديتك"
            value={
              summary
                ? `مفتوحة منذ ${shopDay(summary.openedAt) === shopDay(now) ? formatTime(summary.openedAt) : formatDateTime(summary.openedAt)}`
                : "لا وردية مفتوحة"
            }
            sub={
              <Link href="/pos" className="font-semibold text-foreground hover:underline">
                {summary ? "إغلاق الوردية من نقطة البيع ←" : "افتحيها من نقطة البيع ←"}
              </Link>
            }
          />
          {summary ? (
            <>
              <Stat title="مبيعاتك في الوردية" value={sdg(summary.totalSdg)} sub={`${summary.salesCount} فاتورة`} />
              <Stat title="نقد الدرج المتوقع" value={sdg(summary.expectedCashSdg)} sub="للمطابقة عند الإغلاق" />
            </>
          ) : null}
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>مهامك الآن</CardTitle>
          </CardHeader>
          {tasks.length ? (
            <ul className="flex flex-col gap-2">
              {tasks.map((t) => (
                <li key={t.href}>
                  <Link
                    href={t.href}
                    className={`flex min-h-12 items-center justify-between gap-2 rounded-xl px-4 hover:bg-muted ${
                      t.hot ? "bg-gold/15" : "border border-line"
                    }`}
                  >
                    <span>
                      <b>{t.text}</b> <span className="text-sm text-muted-foreground">· {t.hint}</span>
                    </span>
                    <ArrowLeft aria-hidden className="size-4 shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">لا مهام معلّقة الآن.</p>
          )}
        </Card>

        {stock ? (
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>قارب على النفاد</CardTitle>
              <CardDescription>{stock.total ? `${stock.total} صنف` : "المخزون فوق الحد."}</CardDescription>
            </CardHeader>
            <LowStockList items={stock.items} />
            {can({ stock: ["adjust"] }) ? (
              <p className="text-xs text-muted-foreground">للإبلاغ عن تالف أو مفقود: «+ جديد» ← تسوية مخزون</p>
            ) : null}
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function LowStockList({ items }: { items: { variantId: string; productId: string; label: string; qty: string }[] }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {items.map((s) => (
        <li key={s.variantId} className="flex justify-between gap-2">
          <Link href={`/admin/products/${s.productId}`} className="min-w-0 hover:underline">
            {s.label}
          </Link>
          <span className={`shrink-0 font-semibold tabular-nums ${dec(s.qty).lte(0) ? "text-danger" : "text-warning"}`}>
            {dec(s.qty).lte(0) ? "نفد" : `${formatAmount(s.qty, 0)} متبقٍ`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Stat({
  title,
  value,
  sub,
  children,
}: {
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-card p-4">
      <span className="text-sm text-muted-foreground">{title}</span>
      <span className="text-lg font-bold break-words tabular-nums sm:text-2xl">{value}</span>
      {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
      {children}
    </div>
  );
}

/** نسبة النمو عن فترة المقارنة: ▲ أخضر / ▼ أحمر، أو «لا مقارنة بعد». */
function Growth({ value, label }: { value: string | null; label: string }) {
  if (value === null) return <span>لا مقارنة بعد</span>;
  const down = value.startsWith("-");
  return (
    <span className={`font-semibold ${down ? "text-danger" : "text-forest"}`}>
      {down ? "▼" : "▲"} <bdi dir="ltr">{formatPercent(value)}</bdi>
      {label ? <span className="font-normal text-muted-foreground"> {label}</span> : null}
    </span>
  );
}

/**
 * سعر الصرف الآن (D-133، للمالك): الجنيه لكل دولار، والجنيه لكل ريال قطري، ووقت الإدخال، وتغيّر
 * الجنيه عن قبل أسبوع — ▲ أحمر يعني أن الجنيه ضعف (جنيه أكثر لكل دولار).
 */
function RateCard({ rate }: { rate: NonNullable<Awaited<ReturnType<typeof rateTicker>>> }) {
  const weaker = rate.weekChange !== null && dec(rate.weekChange).gt(0);
  return (
    <Link
      href="/admin/exchange-rates"
      className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-1.5 hover:border-sage"
    >
      <span className="flex flex-col">
        <span className="text-xs text-muted-foreground">سعر الصرف الآن</span>
        <span className="font-bold tabular-nums">
          <bdi dir="ltr">1 $ = {formatRate(rate.sdgPerUsd)}</bdi> ج.س
        </span>
      </span>
      <span aria-hidden className="self-stretch border-s border-line" />
      <span className="flex flex-col text-xs text-muted-foreground">
        {rate.sdgPerQar ? (
          <span className="font-semibold text-foreground tabular-nums">
            <bdi dir="ltr">1 ر.ق = {formatAmount(rate.sdgPerQar, 0)}</bdi> ج.س
          </span>
        ) : null}
        <span>
          {formatDateTime(rate.effectiveAt)}
          {rate.weekChange !== null && !dec(rate.weekChange).isZero() ? (
            <span className={`ms-1 font-semibold ${weaker ? "text-danger" : "text-forest"}`}>
              {weaker ? "▲" : "▼"} <bdi dir="ltr">{formatPercent(rate.weekChange)}</bdi> عن الأسبوع الماضي
            </span>
          ) : null}
        </span>
      </span>
    </Link>
  );
}
