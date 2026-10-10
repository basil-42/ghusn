import { DASHBOARD_PERIODS, type DashboardPeriod, SHOP_TIME_ZONE, dec, shopDay } from "@ghusn/core";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { SalesChart } from "@/components/admin/sales-chart";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleCan } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/auth/session";
import { dailySales, expiringBatches, lowStock, openShifts, periodKpis, topProducts } from "@/lib/dashboard";
import { SELLING_CURRENCY, getRateBoard } from "@/lib/exchange-rates";
import { formatAmount, formatDateTime, formatDay, formatPercent, formatRate, formatTime } from "@/lib/format";
import { countNewOrders, orderTabCounts } from "@/lib/orders";
import { countPriceReview } from "@/lib/pricing";
import { countSalesToReview } from "@/lib/sales";
import { getOpenShift, listLargeShortages, shiftSummary } from "@/lib/shifts";
import { listDueSoon } from "@/lib/shipments";
import { countPendingFor } from "@/lib/stock-adjustments";
import { activeCount } from "@/lib/stock-counts";
import { listWallets } from "@/lib/wallets";

const sdg = (v: string) => `${formatAmount(v, 0)} ج.س`;
const dayLabel = new Intl.DateTimeFormat("ar-u-nu-latn", { day: "numeric", month: "short", timeZone: "UTC" });
const hourFormat = new Intl.DateTimeFormat("en-u-nu-latn", {
  hour: "numeric",
  hourCycle: "h23",
  timeZone: SHOP_TIME_ZONE,
});

const PERIOD_LABELS: Record<DashboardPeriod, string> = { today: "اليوم", week: "7 أيام", month: "هذا الشهر" };
const COMPARED_TO: Record<DashboardPeriod, string> = {
  today: "عن نفس الوقت أمس",
  week: "عن الأيام السبعة السابقة",
  month: "عن نفس الفترة من الشهر الماضي",
};

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
  const period = (DASHBOARD_PERIODS as readonly string[]).includes(p ?? "") ? (p as DashboardPeriod) : "today";
  return <OwnerHome user={user} can={can} period={period} />;
}

async function OwnerHome({ user, can, period }: { user: User; can: Can; period: DashboardPeriod }) {
  const now = new Date();
  const [kpis, series, top, shifts, orders, tabs, stock, expiring, wallets, rates] = await Promise.all([
    periodKpis(period, now),
    dailySales(30, now),
    topProducts(3, now),
    openShifts(),
    can({ order: ["read"] }) ? countNewOrders() : null,
    can({ order: ["read"] }) ? orderTabCounts() : null,
    can({ stock: ["read"] }) ? lowStock(4) : null,
    can({ stock: ["read"] }) ? expiringBatches(3, now) : null,
    can({ wallet: ["update"] }) ? listWallets() : null,
    can({ exchangeRate: ["read"] }) ? getRateBoard() : null,
  ]);
  const [due, priceReview, salesReview, shortages, adjustments] = await Promise.all([
    can({ supplier: ["read"] }) ? listDueSoon(7) : [],
    can({ price: ["approve"] }) ? countPriceReview() : 0,
    countSalesToReview(),
    can({ report: ["read"] }) ? listLargeShortages() : [],
    can({ stock: ["approve"] }) ? countPendingFor({ id: user.id, role: user.role }) : 0,
  ]);
  const sdgRate = rates?.find((c) => c.currency.code === SELLING_CURRENCY)?.current;
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

  const max = series.reduce((a, pt) => (dec(pt.totalSdg).gt(a) ? dec(pt.totalSdg) : a), dec(0));
  const points = series.map((pt) => ({
    day: pt.day,
    label: dayLabel.format(new Date(`${pt.day}T00:00:00Z`)),
    shop: formatAmount(pt.shopSdg, 0),
    store: formatAmount(pt.storeSdg, 0),
    total: formatAmount(pt.totalSdg, 0),
    ratio: max.gt(0) ? dec(pt.totalSdg).div(max).toNumber() : 0,
  }));
  // خط صغير لآخر 7 أيام تحت رقم المبيعات
  const week = series.slice(-7);
  const weekMax = week.reduce((a, pt) => (dec(pt.totalSdg).gt(a) ? dec(pt.totalSdg) : a), dec(0));
  const spark = week.map((pt) => (weekMax.gt(0) ? dec(pt.totalSdg).div(weekMax).toNumber() : 0));
  const today = shopDay(now);

  const pipeline = tabs
    ? [
        { key: "new", label: "جديدة وبانتظار الدفع", count: tabs.new },
        { key: "confirmed", label: "مؤكدة", count: tabs.confirmed },
        { key: "preparing", label: "قيد التجهيز", count: tabs.preparing },
        { key: "ready", label: "جاهزة", count: tabs.ready },
        { key: "delivery", label: "مع التوصيل", count: tabs.delivery },
      ]
    : [];
  const change = kpis.change;

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
        <nav aria-label="فترة الأرقام" className="flex gap-1 rounded-xl bg-muted p-1 text-sm">
          {DASHBOARD_PERIODS.map((k) => (
            <Link
              key={k}
              href={k === "today" ? "/admin" : `/admin?p=${k}`}
              aria-current={k === period ? "page" : undefined}
              className={`flex min-h-10 items-center rounded-lg px-4 ${
                k === period ? "bg-card font-bold shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {PERIOD_LABELS[k]}
            </Link>
          ))}
        </nav>
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
              {change !== null ? (
                <span className={change.startsWith("-") ? "text-danger" : "text-forest"}>
                  {change.startsWith("-") ? "▼" : "▲"} {formatPercent(change)} {COMPARED_TO[period]}
                </span>
              ) : (
                "لا مقارنة بعد"
              )}
              {` · ${kpis.count} فاتورة وطلب`}
            </>
          }
        >
          <span aria-hidden className="mt-1 flex h-7 items-end gap-1">
            {spark.map((r, i) => (
              <span
                key={week[i]?.day ?? i}
                className={`flex-1 rounded-t-sm ${week[i]?.day === today ? "bg-sage" : "bg-sage/35"}`}
                style={{ height: `${Math.max(r * 100, 6)}%` }}
              />
            ))}
          </span>
        </Stat>
        {seeProfit ? (
          <Stat
            title="مجمل الربح"
            value={<bdi dir="ltr">${formatAmount(kpis.profitUsd)}</bdi>}
            sub={
              <>
                {kpis.margin !== null ? `هامش ${formatPercent(kpis.margin)} · ` : null}
                <Link href="/admin/reports" className="hover:underline">
                  الصافي في التقرير الشهري ←
                </Link>
              </>
            }
          />
        ) : null}
        <Stat
          title="متوسط الفاتورة"
          value={kpis.avgTicketSdg ? sdg(kpis.avgTicketSdg) : "—"}
          sub={PERIOD_LABELS[period]}
        />
        <Stat
          title="العملاء"
          value={<span className="tabular-nums">{kpis.customers}</span>}
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
      </section>

      <div className={`grid gap-4 ${tabs ? "lg:grid-cols-[2fr_1fr]" : ""}`}>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>المبيعات اليومية</CardTitle>
            <CardDescription>آخر 30 يوماً — المحل والمتجر معاً (مرّر على العمود للتفاصيل).</CardDescription>
          </CardHeader>
          {max.gt(0) ? (
            <SalesChart points={points} maxLabel={formatAmount(max.toFixed(0), 0)} />
          ) : (
            <p className="text-muted-foreground">لا مبيعات في آخر 30 يوماً بعد.</p>
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
                {sdgRate ? (
                  <Link href="/admin/exchange-rates" className="text-xs text-muted-foreground hover:underline">
                    الجنيه <bdi dir="ltr">{formatRate(sdgRate.unitsPerUsd)}</bdi> لكل $
                  </Link>
                ) : null}
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
      <span className="truncate text-2xl font-bold tabular-nums">{value}</span>
      {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
      {children}
    </div>
  );
}
