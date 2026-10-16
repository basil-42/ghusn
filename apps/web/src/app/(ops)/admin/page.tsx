import {
  DASHBOARD_PERIODS,
  type DashboardPeriod,
  type DashboardRange,
  type WeekStart,
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
import {
  expiringBatches,
  lowStock,
  openShifts,
  periodKpis,
  periodSpending,
  salesSeries,
  topProducts,
} from "@/lib/dashboard";
import { isSellingRateStale, rateTicker } from "@/lib/exchange-rates";
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

/** أسماء أعمدة الرسم: الكامل للتلميح والجدول، والمختصر تحت المحور (لبعضها في الشهر). */
function bucketLabel(key: string, bucket: DashboardRange["bucket"]) {
  return bucket === "day"
    ? weekdayDay.format(new Date(`${key}T00:00:00Z`))
    : monthLabel.format(new Date(`${key}-01T00:00:00Z`));
}
/** اسم العمود تحت المحور بسطرين (على نمط Zoho): اليوم ثم الشهر، أو الشهر ثم السنة. */
function bucketTick(key: string, bucket: DashboardRange["bucket"]) {
  if (bucket === "month") {
    return { top: monthShort.format(new Date(`${key}-01T00:00:00Z`)), sub: key.slice(0, 4) };
  }
  return { top: key.slice(8), sub: monthShort.format(new Date(`${key}T00:00:00Z`)) };
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
  const [kpis, series, top, shifts, orders, tabs, stock, expiring, wallets, rate, spending] = await Promise.all([
    periodKpis(range),
    salesSeries(range, now),
    topProducts(5, now),
    openShifts(),
    can({ order: ["read"] }) ? countNewOrders() : null,
    can({ order: ["read"] }) ? orderTabCounts() : null,
    can({ stock: ["read"] }) ? lowStock(4) : null,
    can({ stock: ["read"] }) ? expiringBatches(3, now) : null,
    can({ wallet: ["update"] }) ? listWallets() : null,
    // سعر الصرف في الرئيسية للمالك فقط (D-133)
    can({ exchangeRate: ["dashboard"] }) ? rateTicker(now) : null,
    // المنصرفات لمن يرى التقارير (D-137)
    can({ report: ["read"] }) ? periodSpending(range, now) : null,
  ]);
  const [due, priceReview, salesReview, shortages, adjustments, rateStale] = await Promise.all([
    can({ supplier: ["read"] }) ? listDueSoon(7) : [],
    can({ price: ["approve"] }) ? countPriceReview() : 0,
    countSalesToReview(),
    can({ report: ["read"] }) ? listLargeShortages() : [],
    can({ stock: ["approve"] }) ? countPendingFor({ id: user.id, role: user.role }) : 0,
    can({ exchangeRate: ["update"] }) ? isSellingRateStale(now) : false,
  ]);
  const paymentReview = can({ order: ["payment"] }) ? (orders?.paymentReview ?? 0) : 0;
  const seeProfit = can({ report: ["read"] });

  // «يحتاج إجراء» شارات تحت التحية (D-136)، ومعها سعر الجنيه القديم (شريط الإطار مخفي في الرئيسية)
  const attention = [
    rateStale && { href: "/admin/exchange-rates", text: "سعر الجنيه لم يُدخل اليوم", urgent: false },
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

  // الأعمدة حتى اليوم فقط (لا أيام فارغة قادمة)، والمحور بأرقام مستديرة والأعمدة نسبة من أعلاه
  const shown = series.filter((pt) => !pt.future);
  const axis = niceAxis(shown.reduce((m, pt) => Math.max(m, dec(pt.totalSdg).toNumber()), 0));
  const axisTop = axis[axis.length - 1] ?? 0;
  const ratio = (v: string) => (axisTop > 0 ? Math.max(dec(v).toNumber() / axisTop, 0) : 0);
  const nowKey = range.bucket === "day" ? shopDay(now) : shopDay(now).slice(0, 7);
  const every = shown.length > 16 ? 2 : 1; // الشهر: كل يومين اسم
  const points: ChartPoint[] = shown.map((pt, i) => {
    const tick = bucketTick(pt.key, range.bucket);
    const labelled = i % every === 0 || i === shown.length - 1;
    return {
      key: pt.key,
      label: bucketLabel(pt.key, range.bucket),
      tick: labelled ? tick.top : "",
      tickSub: labelled ? tick.sub : "",
      shop: formatAmount(pt.shopSdg, 0),
      store: formatAmount(pt.storeSdg, 0),
      total: formatAmount(pt.totalSdg, 0),
      short: compactSdg(dec(pt.totalSdg).toNumber()),
      ratio: ratio(pt.totalSdg),
      current: !range.complete && pt.key === nowKey,
    };
  });
  const hasSales = shown.some((pt) => dec(pt.totalSdg).gt(0));

  const pipeline = tabs
    ? [
        { key: "new", label: "جديدة", count: tabs.new },
        { key: "confirmed", label: "مؤكدة", count: tabs.confirmed },
        { key: "preparing", label: "تجهيز", count: tabs.preparing },
        { key: "ready", label: "جاهزة", count: tabs.ready },
        { key: "delivery", label: "توصيل", count: tabs.delivery },
      ]
    : [];
  // الورديات المفتوحة ونقد الدرج المتوقع — يتابعها المالك من قطر (D-135)
  const shiftCash = await Promise.all(shifts.map((sh) => shiftSummary(sh.id)));
  const topMax = top.reduce((m, t) => (dec(t.qty).gt(m) ? dec(t.qty) : m), dec(0));
  const today = shopDay(now);
  const seeInsights = can({ report: ["read"], cost: ["read"] });

  const activeWallets = wallets?.filter((w) => w.isActive) ?? [];
  const shownWallets = activeWallets.filter((w) => !dec(w.balance).isZero());
  const zeroWallets = activeWallets.length - shownWallets.length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
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
          {/* الفترة (D-133، D-135): أزرار للجارية، و«أخرى» للسابقة — تتحكم في كل الأرقام والرسم */}
          <PeriodTabs period={period} now={now} weekStartsOn={weekStartsOn} />
        </div>
        {attention.length ? (
          <nav aria-label="يحتاج إجراء" className="flex flex-wrap items-center gap-2">
            {attention.map((a) => (
              <Link
                key={a.text}
                href={a.href}
                className={`flex min-h-9 items-center gap-2 rounded-full px-3.5 text-sm font-semibold ${
                  a.urgent ? "bg-danger/10 text-danger hover:bg-danger/15" : "bg-gold/15 text-warning hover:bg-gold/25"
                }`}
              >
                <span aria-hidden className="size-1.5 rounded-full bg-current" />
                {a.text}
                <ArrowLeft aria-hidden className="size-3.5" />
              </Link>
            ))}
          </nav>
        ) : null}
      </header>

      <Section title={`الأداء · ${PERIOD_LABELS[period]}`}>
        <div className="grid gap-4 lg:grid-cols-[2.1fr_1fr]">
          <Panel title="صافي المبيعات" note={period === "today" ? "الرسم: آخر 7 أيام" : periodHint(range, period)}>
            <div className="flex flex-col gap-2">
              <span className="text-4xl font-bold tabular-nums">{sdg(kpis.netSdg)}</span>
              <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <GrowthPill value={kpis.change} />
                {kpis.change !== null ? COMPARED_TO[period] : "لا مقارنة بعد"}
                {` · ${kpis.count} فاتورة وطلب`}
              </span>
              <span className="flex gap-5 text-sm text-muted-foreground">
                <span>
                  المحل <b className="text-foreground tabular-nums">{formatAmount(kpis.shopNetSdg, 0)}</b>
                </span>
                <span>
                  المتجر <b className="text-foreground tabular-nums">{formatAmount(kpis.storeSdg, 0)}</b>
                </span>
              </span>
            </div>
            {hasSales ? (
              <SalesChart
                points={points}
                gridlines={axis.map((v) => ({ ratio: axisTop > 0 ? v / axisTop : 0, label: compactSdg(v) }))}
                ariaLabel={`صافي المبيعات ${period === "today" ? "آخر 7 أيام" : PERIOD_LABELS[period]}`}
              />
            ) : (
              <p className="text-muted-foreground">لا مبيعات في هذه الفترة بعد.</p>
            )}
          </Panel>
          {/* المؤشرات الثلاثة بطاقة واحدة بأسطر بنفس ارتفاع بطاقة المبيعات (D-136) */}
          <Panel title="مؤشرات الفترة" href={seeProfit ? "/admin/reports" : undefined} link="التقرير الشهري" flush>
            <div className="flex flex-1 flex-col divide-y divide-line">
              {seeProfit ? (
                <Indicator
                  title="مجمل الربح"
                  value={sdg(kpis.profitSdg)}
                  growth={kpis.profitChange}
                  sub={
                    <>
                      ≈ <bdi dir="ltr">${formatAmount(kpis.profitUsd)}</bdi>
                      {kpis.margin !== null ? ` · هامش ${formatPercent(kpis.margin)}` : null}
                    </>
                  }
                />
              ) : null}
              <Indicator
                title="متوسط الفاتورة"
                value={kpis.avgTicketSdg ? sdg(kpis.avgTicketSdg) : "—"}
                growth={kpis.avgTicketChange}
                sub={`${kpis.count} فاتورة وطلب`}
              />
              <Indicator
                title="العملاء"
                value={String(kpis.customers)}
                growth={kpis.customersChange}
                sub={
                  can({ customer: ["read"] }) ? (
                    <Link href="/admin/customers" className="hover:underline">
                      منهم {kpis.newCustomers} جديد ←
                    </Link>
                  ) : (
                    `منهم ${kpis.newCustomers} جديد`
                  )
                }
              />
            </div>
          </Panel>
        </div>
      </Section>

      {spending ? (
        <Section title={`المنصرفات · ${PERIOD_LABELS[period]}`}>
          <SpendingPanel
            spending={spending}
            profitSdg={kpis.profitSdg}
            period={period}
            bucket={range.bucket}
            nowKey={range.complete ? null : nowKey}
          />
        </Section>
      ) : null}

      <Section title="المال والعمليات · الآن">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {wallets ? (
            <Panel title="المال" href="/admin/wallets" link="صفحة المال">
              {rate ? <RateBand rate={rate} /> : null}
              <ul className="flex flex-col divide-y divide-line text-sm">
                {shownWallets.map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`/admin/wallets/${w.id}`} className="min-w-0 hover:underline">
                      {w.name}
                    </Link>
                    <bdi dir="ltr" className="shrink-0 font-semibold tabular-nums">
                      {formatAmount(w.balance, w.decimals)} {w.symbol}
                    </bdi>
                  </li>
                ))}
              </ul>
              {zeroWallets ? (
                <span className="text-xs text-muted-foreground">
                  {zeroWallets === 1 ? "محفظة واحدة رصيدها صفر مخفية" : `${zeroWallets} محافظ رصيدها صفر مخفية`}
                </span>
              ) : null}
            </Panel>
          ) : null}

          {tabs ? (
            <Panel title="طلبات المتجر" href="/admin/orders" link="كل الطلبات">
              <ul className="grid grid-cols-5 gap-1.5">
                {pipeline.map((st) => (
                  <li key={st.key}>
                    <Link
                      href={st.key === "new" ? "/admin/orders" : `/admin/orders?tab=${st.key}`}
                      className={`flex min-h-16 flex-col items-center justify-center rounded-xl border text-xs ${
                        st.count ? "border-sand bg-gold/15 text-foreground" : "border-line text-muted-foreground"
                      }`}
                    >
                      <b className="text-xl tabular-nums">{st.count}</b>
                      {st.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="flex flex-wrap justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                <span className="text-muted-foreground">مسلَّمة · {PERIOD_LABELS[period]}</span>
                <span>
                  <b className="tabular-nums">{kpis.storeCount}</b> طلب ·{" "}
                  <b className="tabular-nums">{formatAmount(kpis.storeSdg, 0)}</b> ج.س
                </span>
              </p>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground">الورديات المفتوحة</span>
                {shifts.length ? (
                  shifts.map((sh, i) => (
                    <Link
                      key={sh.id}
                      href="/admin/sales"
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-muted px-3 py-2 text-sm hover:bg-muted/70"
                    >
                      <span>
                        <b>{sh.userName}</b> · منذ{" "}
                        {shopDay(sh.openedAt) === today ? formatTime(sh.openedAt) : formatDateTime(sh.openedAt)} ·{" "}
                        {sh.sales} فاتورة
                      </span>
                      {shiftCash[i] ? (
                        <span className="text-muted-foreground">
                          الدرج{" "}
                          <b className="text-foreground tabular-nums">
                            {formatAmount(shiftCash[i].expectedCashSdg, 0)}
                          </b>
                        </span>
                      ) : null}
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">لا ورديات مفتوحة الآن.</p>
                )}
              </div>
            </Panel>
          ) : null}

          <Panel title="الأكثر مبيعاً · الشهر" href={seeInsights ? "/admin/insights" : undefined} link="التحليلات">
            {top.length ? (
              <ol className="flex flex-col divide-y divide-line text-sm">
                {top.map((t, i) => (
                  <li key={t.productId} className="flex items-center gap-3 py-2">
                    <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-xs font-bold tabular-nums">
                      {i + 1}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <Link href={`/admin/products/${t.productId}`} className="truncate hover:underline">
                        {t.name}
                      </Link>
                      <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-sage"
                          style={{ width: `${topMax.gt(0) ? dec(t.qty).div(topMax).times(100).toNumber() : 0}%` }}
                        />
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{formatAmount(t.qty, 0)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">لا مبيعات هذا الشهر بعد.</p>
            )}
          </Panel>
        </div>
      </Section>

      {stock ? (
        <Section title="المخزون">
          {/* بطاقة واحدة بعمودين: النفاد | الصلاحية — الفارغ منهما سطر ✓ (D-136) */}
          <Panel
            title="يحتاج متابعة"
            href={seeInsights ? "/admin/insights?tab=reorder" : "/admin/stock"}
            link={seeInsights ? "اقتراحات إعادة الطلب" : "كل المخزون"}
            flush
          >
            <div className="grid md:grid-cols-2">
              <div className="flex flex-col gap-2 p-5">
                <h3 className="flex justify-between text-sm font-semibold text-muted-foreground">
                  نفد أو قارب على النفاد
                  {stock.total ? <span className="tabular-nums">{stock.total} صنف</span> : null}
                </h3>
                {stock.items.length ? (
                  <LowStockList items={stock.items} />
                ) : (
                  <p className="text-sm font-semibold text-forest">✓ المخزون فوق الحد</p>
                )}
                {stock.total > stock.items.length ? (
                  <span className="text-xs text-muted-foreground">+{stock.total - stock.items.length} صنف آخر</span>
                ) : null}
              </div>
              <div className="flex flex-col gap-2 border-t border-line p-5 md:border-s md:border-t-0">
                <h3 className="flex justify-between text-sm font-semibold text-muted-foreground">
                  صلاحية قريبة
                  {expiring ? <span>خلال {expiring.days} يوماً</span> : null}
                </h3>
                {expiring?.items.length ? (
                  <ul className="flex flex-col divide-y divide-line text-sm">
                    {expiring.items.map((b) => {
                      const days = Math.round(
                        (new Date(`${b.expiresOn}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
                          86_400_000,
                      );
                      return (
                        <li key={b.id} className="flex items-center justify-between gap-2 py-2">
                          <Link href={`/admin/products/${b.productId}`} className="min-w-0 hover:underline">
                            {b.label}
                          </Link>
                          <Tag tone={b.expired ? "danger" : "warn"}>{b.expired ? "منتهية" : `${days} يوماً`}</Tag>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm font-semibold text-forest">✓ لا شيء قريب الانتهاء</p>
                )}
              </div>
            </div>
          </Panel>
        </Section>
      ) : null}
    </div>
  );
}

/** رئيسية الموظفة (D-120): ورديتها، مهامها، وما قارب النفاد — بلا أرباح أو محافظ أو تكاليف. */
async function StaffHome({ user, can }: { user: User; can: Can }) {
  const now = new Date();
  const sells = can({ pos: ["sell"] });
  const [shift, tabs, count, stock] = await Promise.all([
    sells ? getOpenShift() : null,
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
    <ul className="flex flex-col divide-y divide-line text-sm">
      {items.map((s) => (
        <li key={s.variantId} className="flex items-center justify-between gap-2 py-2">
          <Link href={`/admin/products/${s.productId}`} className="min-w-0 hover:underline">
            {s.label}
          </Link>
          <Tag tone={dec(s.qty).lte(0) ? "danger" : "warn"}>
            {dec(s.qty).lte(0) ? "نفد" : `${formatAmount(s.qty, 0)} متبقٍ`}
          </Tag>
        </li>
      ))}
    </ul>
  );
}

/** شارة صغيرة: أحمر للنفاد/الانتهاء، ذهبي للتنبيه. */
function Tag({ tone, children }: { tone: "danger" | "warn"; children: React.ReactNode }) {
  return (
    <span
      className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${
        tone === "danger" ? "bg-danger/10 text-danger" : "bg-gold/20 text-warning"
      }`}
    >
      {children}
    </span>
  );
}

type Spending = NonNullable<Awaited<ReturnType<typeof periodSpending>>>;

/**
 * المنصرفات (D-137): كم صُرف ومتوسط اليوم ونموه، والتقسيم: تشغيل (يُخصم من الربح) | مشتريات بضاعة
 * (تصير مخزوناً)، ثم البنود بشرائط، والمنصرف لكل عمود، والصافي التقريبي = مجمل الربح − التشغيل.
 */
function SpendingPanel({
  spending,
  profitSdg,
  period,
  bucket,
  nowKey,
}: {
  spending: Spending;
  profitSdg: string;
  period: DashboardPeriod;
  bucket: DashboardRange["bucket"];
  nowKey: string | null;
}) {
  const total = dec(spending.totalSdg);
  const opShare = total.gt(0) ? dec(spending.operatingSdg).div(total).times(100).toNumber() : 0;
  const net = dec(profitSdg).minus(spending.operatingSdg);
  // نفس رسم المبيعات مكدّساً: التشغيل (غابة) أسفل والمشتريات (رملي) فوقه، بمحور وأسماء أيام وتلميح
  const axis = niceAxis(spending.series.reduce((m, r) => Math.max(m, dec(r.operating).plus(r.purchase).toNumber()), 0));
  const axisTop = axis[axis.length - 1] ?? 0;
  // الرسم في عمود أضيق: اسم كل يومين إن زادت الأعمدة عن 7
  const every = spending.series.length > 7 ? 2 : 1;
  const points: ChartPoint[] = spending.series.map((r, i) => {
    const sum = dec(r.operating).plus(r.purchase);
    const tick = bucketTick(r.key, bucket);
    const labelled = i % every === 0 || i === spending.series.length - 1;
    return {
      key: r.key,
      label: bucketLabel(r.key, bucket),
      tick: labelled ? tick.top : "",
      tickSub: labelled ? tick.sub : "",
      shop: formatAmount(r.operating, 0),
      store: formatAmount(r.purchase, 0),
      total: formatAmount(sum.toFixed(0), 0),
      short: compactSdg(sum.toNumber()),
      ratio: axisTop > 0 ? sum.toNumber() / axisTop : 0,
      split: sum.gt(0) ? dec(r.operating).div(sum).toNumber() : 0,
      current: r.key === nowKey,
    };
  });
  const kinds = [
    { kind: "OPERATING", title: "مصاريف التشغيل", note: "تُخصم من الربح" },
    { kind: "PURCHASE", title: "مشتريات بضاعة", note: "تصير مخزوناً — ليست خسارة" },
  ] as const;
  return (
    <Panel title="كم صرفنا وعلى ماذا" href="/admin/expenses" link="كل المصاريف" flush>
      <div className="grid lg:grid-cols-[1.35fr_1fr]">
        <div className="flex flex-col gap-3 p-5">
          <span className="text-3xl font-bold tabular-nums">{sdg(spending.totalSdg)}</span>
          <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <GrowthPill value={spending.change} invert />
            {spending.change !== null ? `${COMPARED_TO[period]} · ` : null}
            <b className="text-foreground">متوسط اليوم {sdg(spending.perDaySdg)}</b>
          </span>
          {total.gt(0) ? (
            <>
              <span aria-hidden className="flex h-3 overflow-hidden rounded-full bg-sand">
                <span className="h-full bg-forest" style={{ width: `${opShare}%` }} />
              </span>
              <span className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <i className="inline-block size-2.5 rounded-sm bg-forest" />
                  مصاريف التشغيل{" "}
                  <b className="text-foreground tabular-nums">{formatAmount(spending.operatingSdg, 0)}</b>
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="inline-block size-2.5 rounded-sm bg-sand" />
                  مشتريات بضاعة <b className="text-foreground tabular-nums">{formatAmount(spending.purchaseSdg, 0)}</b>
                </span>
              </span>
              {kinds.map((k) => {
                const rows = spending.groups.filter((g) => g.kind === k.kind);
                return rows.length ? (
                  <div key={k.kind} className="flex flex-col gap-1">
                    <h3 className="mt-2 flex justify-between text-sm font-semibold text-muted-foreground">
                      {k.title}
                      <span className="text-xs font-normal">{k.note}</span>
                    </h3>
                    <ul className="flex flex-col text-sm">
                      {rows.map((g) => (
                        <li
                          key={g.group}
                          className="grid grid-cols-[minmax(0,8rem)_1fr_6.5rem_3rem] items-center gap-3 py-1.5"
                        >
                          <span className="truncate">{g.group}</span>
                          <span aria-hidden className="h-2 overflow-hidden rounded-full bg-muted">
                            <span
                              className={`block h-full rounded-full ${k.kind === "OPERATING" ? "bg-sage" : "bg-sand"}`}
                              style={{ width: `${dec(g.share).times(100).toNumber()}%` }}
                            />
                          </span>
                          <b className="text-end tabular-nums">{formatAmount(g.sdg, 0)}</b>
                          <span className="text-end text-xs text-muted-foreground tabular-nums">
                            {formatPercent(g.share).replace("+", "")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null;
              })}
              {spending.unpriced ? (
                <span className="text-xs text-warning">
                  {spending.unpriced} حركة بعملة أجنبية بلا سعر جنيه يومها — لم تُحسب.
                </span>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">لا منصرفات مسجّلة في هذه الفترة.</p>
          )}
        </div>
        <div className="flex flex-col gap-4 border-t border-line p-5 lg:border-s lg:border-t-0">
          <div className="flex flex-col gap-2 rounded-xl bg-muted p-4 text-sm">
            <b>النتيجة {soFar(period)}</b>
            <span className="flex justify-between">
              مجمل الربح <b className="tabular-nums">{formatAmount(profitSdg, 0)}</b>
            </span>
            <span className="flex justify-between">
              − مصاريف التشغيل <b className="text-danger tabular-nums">{formatAmount(spending.operatingSdg, 0)}</b>
            </span>
            <span className="flex items-baseline justify-between border-t border-line pt-2">
              صافي الربح التقريبي
              <b className={`text-lg tabular-nums ${net.lt(0) ? "text-danger" : "text-forest"}`}>
                {sdg(net.toFixed(0))}
              </b>
            </span>
            {net.lt(0) ? (
              <span className="text-xs font-semibold text-warning">
                سالب لأن مصاريف الفترة (مثل إيجار أو راتب دُفع فيها) أكبر من ربحها — اختر «الشهر» للصورة الكاملة.
              </span>
            ) : null}
            <span className="text-xs text-muted-foreground">
              المشتريات لا تدخل هنا لأنها مخزون؛ تكلفتها في مجمل الربح حين يُباع الصنف. الصافي النهائي (مع خسائر
              المخزون) في التقرير الشهري.
            </span>
          </div>
          {axisTop > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-muted-foreground">
                المنصرف {bucket === "month" ? "لكل شهر" : "لكل يوم"}
                {period === "today" ? " · آخر 7 أيام" : ""}
              </h3>
              <SalesChart
                points={points}
                gridlines={axis.map((v) => ({ ratio: axisTop > 0 ? v / axisTop : 0, label: compactSdg(v) }))}
                ariaLabel="المنصرف لكل يوم: التشغيل والمشتريات"
                parts={["تشغيل", "مشتريات"]}
                stacked
              />
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

const soFar = (period: DashboardPeriod) => (period.startsWith("last") ? "" : "حتى الآن");

/** قسم بعنوان خفيف وخط ممتد (D-136): الأداء · المال والعمليات · المخزون. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2.5">
      <h2 className="flex items-center gap-3 text-xs font-bold text-muted-foreground after:h-px after:flex-1 after:bg-line">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * بطاقة برأس موحّد (D-136): العنوان، ورابط «←» لصفحتها أو ملاحظة، وخط فاصل. البطاقات في الصف بنفس
 * الارتفاع. flush: المحتوى بلا حشوة (أسطر أو أعمدة تملأ البطاقة).
 */
function Panel({
  title,
  href,
  link,
  note,
  flush = false,
  children,
}: {
  title: string;
  href?: string;
  link?: string;
  note?: string;
  flush?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
        <h2 className="text-base font-bold">{title}</h2>
        {href && link ? (
          <Link
            href={href}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline"
          >
            {link} ←
          </Link>
        ) : note ? (
          <span className="text-xs text-muted-foreground">{note}</span>
        ) : null}
      </div>
      <div className={flush ? "flex flex-1 flex-col" : "flex flex-1 flex-col gap-3 p-5"}>{children}</div>
    </div>
  );
}

/** سطر مؤشر في «مؤشرات الفترة»: العنوان، الرقم وشارة النمو، وسطر صغير. */
function Indicator({
  title,
  value,
  growth,
  sub,
}: {
  title: string;
  value: string;
  growth: string | null;
  sub: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-1 px-5 py-4">
      <span className="text-sm text-muted-foreground">{title}</span>
      <span className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-2xl font-bold tabular-nums">{value}</span>
        <GrowthPill value={growth} small />
      </span>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </div>
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

/** شارة النمو عن فترة المقارنة (على نمط Zoho): ↑ أخضر / ↓ أحمر، ولا شيء إن لم توجد مقارنة. */
function GrowthPill({
  value,
  small = false,
  invert = false,
}: {
  value: string | null;
  small?: boolean;
  /** الزيادة سيئة (المنصرفات): ↑ أحمر و↓ أخضر. */
  invert?: boolean;
}) {
  // «لا مقارنة بعد» تظهر مرة واحدة تحت رقم المبيعات فقط (D-138)
  if (value === null) return null;
  const down = value.startsWith("-");
  const bad = invert ? !down : down;
  return (
    <span
      className={`inline-flex w-fit items-center gap-1 rounded-full border font-semibold ${
        small ? "px-2 py-px text-xs" : "px-2.5 py-0.5 text-sm"
      } ${bad ? "border-danger/30 bg-danger/10 text-danger" : "border-forest/20 bg-sage/15 text-forest"}`}
    >
      {down ? "↓" : "↑"} <bdi dir="ltr">{formatPercent(value)}</bdi>
    </span>
  );
}

/**
 * سعر الصرف الآن في رأس بطاقة «المال» (D-133، D-135، للمالك): الجنيه لكل دولار ولكل ريال قطري، ووقت
 * الإدخال، وتغيّر الجنيه عن قبل أسبوع — ▲ يعني أن الجنيه ضعف (جنيه أكثر لكل دولار).
 */
function RateBand({ rate }: { rate: NonNullable<Awaited<ReturnType<typeof rateTicker>>> }) {
  const weaker = rate.weekChange !== null && dec(rate.weekChange).gt(0);
  return (
    <Link
      href="/admin/exchange-rates"
      className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-forest p-4 text-ivory hover:bg-forest/95"
    >
      <span className="flex flex-col">
        <span className="text-xs opacity-75">الدولار</span>
        <span className="text-xl font-bold tabular-nums">
          {formatRate(rate.sdgPerUsd)} <small className="text-xs font-normal">ج.س</small>
        </span>
      </span>
      {rate.sdgPerQar ? (
        <span className="flex flex-col">
          <span className="text-xs opacity-75">الريال القطري</span>
          <span className="text-xl font-bold tabular-nums">
            {formatAmount(rate.sdgPerQar, 0)} <small className="text-xs font-normal">ج.س</small>
          </span>
        </span>
      ) : null}
      <span className="col-span-2 flex flex-wrap justify-between gap-2 border-t border-ivory/20 pt-2 text-xs opacity-90">
        <span>حُدِّث {formatDateTime(rate.effectiveAt)}</span>
        {rate.weekChange !== null && !dec(rate.weekChange).isZero() ? (
          <span className="font-semibold">
            {weaker ? "▲" : "▼"} <bdi dir="ltr">{formatPercent(rate.weekChange)}</bdi> عن الأسبوع الماضي
          </span>
        ) : null}
      </span>
    </Link>
  );
}

const TABS: { period: DashboardPeriod; label: string }[] = [
  { period: "today", label: "اليوم" },
  { period: "this-week", label: "الأسبوع" },
  { period: "this-month", label: "الشهر" },
  { period: "this-year", label: "السنة" },
];
const PAST: DashboardPeriod[] = ["last-week", "last-month", "last-year"];
const hrefOf = (k: DashboardPeriod) => (k === "today" ? "/admin" : `/admin?p=${k}`);

/**
 * الفترة (D-135، يحدّث D-133): أزرار للفترات الجارية، و«أخرى» تفتح السابقة؛ الفترة السابقة المختارة
 * تظهر اسماً على زر «أخرى». كلها تغيّر ?p= نفسه.
 */
function PeriodTabs({ period, now, weekStartsOn }: { period: DashboardPeriod; now: Date; weekStartsOn: WeekStart }) {
  const past = PAST.includes(period);
  const tab = (active: boolean) =>
    `flex min-h-10 items-center gap-1.5 rounded-lg px-3.5 ${
      active ? "bg-card font-bold shadow-sm" : "text-muted-foreground hover:text-foreground"
    }`;
  return (
    <nav aria-label="فترة الأرقام" className="flex gap-1 rounded-xl bg-muted p-1 text-sm">
      {TABS.map((t) => (
        <Link
          key={t.period}
          href={hrefOf(t.period)}
          aria-current={t.period === period ? "page" : undefined}
          className={tab(t.period === period)}
          title={periodHint(dashboardRange(t.period, now, weekStartsOn), t.period)}
        >
          {t.label}
        </Link>
      ))}
      <details key={period} className="group relative">
        <summary className={`${tab(past)} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
          {past ? PERIOD_LABELS[period] : "أخرى"}
          <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="absolute end-0 top-full z-20 mt-2 flex w-60 flex-col rounded-xl border border-line bg-card p-1.5 shadow-lg">
          {PAST.map((k) => (
            <Link
              key={k}
              href={hrefOf(k)}
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
      </details>
    </nav>
  );
}
