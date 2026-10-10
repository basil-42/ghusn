import { dec } from "@ghusn/core";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { SalesChart } from "@/components/admin/sales-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleCan } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/auth/session";
import { dailySales, expiringBatches, lowStock, myShift, openShifts, salesKpis, topProducts } from "@/lib/dashboard";
import { SELLING_CURRENCY, SOURCE_LABELS, getRateBoard } from "@/lib/exchange-rates";
import { formatAmount, formatDateTime, formatDay, formatPercent, formatRate } from "@/lib/format";
import { countNewOrders, orderTabCounts } from "@/lib/orders";
import { countPriceReview } from "@/lib/pricing";
import { currentShopMonth, monthlyReport } from "@/lib/reports";
import { countSalesToReview } from "@/lib/sales";
import { listLargeShortages } from "@/lib/shifts";
import { listDueSoon } from "@/lib/shipments";
import { countPendingFor } from "@/lib/stock-adjustments";
import { listWallets } from "@/lib/wallets";

const sdg = (v: string) => `${formatAmount(v, 0)} ج.س`;
const dayLabel = new Intl.DateTimeFormat("ar-u-nu-latn", { day: "numeric", month: "short", timeZone: "UTC" });

/** لوحة المتابعة (D-94): صورة سريعة عن المحل، وما يحتاج انتباهاً — كل قسم حسب الصلاحية. */
export default async function AdminHome() {
  const { user } = await requireSession();
  const can = (p: Parameters<typeof roleCan>[1]) => roleCan(user.role, p);
  const seeSales = can({ sale: ["read"] });

  const [rates, kpis, series, top, shifts, mine, profit, orders, tabs, stock, expiring, wallets] = await Promise.all([
    can({ exchangeRate: ["read"] }) ? getRateBoard() : null,
    seeSales ? salesKpis() : null,
    seeSales ? dailySales(30) : null,
    seeSales ? topProducts(5) : null,
    seeSales ? openShifts() : null,
    !seeSales && can({ pos: ["sell"] }) ? myShift(user.id) : null,
    can({ report: ["read"] }) ? monthlyReport(currentShopMonth()) : null,
    can({ order: ["read"] }) ? countNewOrders() : null,
    can({ order: ["read"] }) ? orderTabCounts() : null,
    can({ stock: ["read"] }) ? lowStock(8) : null,
    can({ stock: ["read"] }) ? expiringBatches(8) : null,
    can({ wallet: ["update"] }) ? listWallets() : null,
  ]);
  const [due, priceReview, salesReview, shortages, adjustments] = await Promise.all([
    can({ supplier: ["read"] }) ? listDueSoon(7) : [],
    can({ price: ["approve"] }) ? countPriceReview() : 0,
    seeSales ? countSalesToReview() : 0,
    can({ report: ["read"] }) ? listLargeShortages() : [],
    can({ stock: ["approve"] }) ? countPendingFor({ id: user.id, role: user.role }) : 0,
  ]);
  const sdgRate = rates?.find((c) => c.currency.code === SELLING_CURRENCY);
  const paymentReview = can({ order: ["payment"] }) ? (orders?.paymentReview ?? 0) : 0;

  // ما يحتاج انتباهاً — بطاقة واحدة، و«لا شيء معلّق» إن خلت
  const attention = [
    paymentReview && { href: "/admin/orders", text: `${paymentReview} إشعار بنكك بانتظار المراجعة`, tone: "gold" },
    orders?.new && { href: "/admin/orders", text: `${orders.new} طلب جديد من المتجر`, tone: "gold" },
    salesReview && { href: "/admin/sales", text: `${salesReview} فاتورة دون اتصال تحتاج مراجعة`, tone: "danger" },
    shortages.length && {
      href: "/admin/sales",
      text: `عجز كبير في ${shortages.length} وردية خلال 7 أيام`,
      tone: "danger",
    },
    priceReview && { href: "/admin/pricing", text: `${priceReview} صنف يحتاج مراجعة سعر`, tone: "gold" },
    adjustments && {
      href: "/admin/stock/adjustments",
      text: `${adjustments} تسوية مخزون بانتظار اعتمادك`,
      tone: "gold",
    },
    due.length && {
      href: "/admin/suppliers",
      text: `${due.length} دفعة لمورد خلال 7 أيام`,
      tone: due.some((d) => d.overdue) ? "danger" : "gold",
    },
    sdgRate?.isStale && { href: "/admin/exchange-rates", text: "سعر الجنيه لم يُحدَّث اليوم", tone: "gold" },
  ].filter(Boolean) as { href: string; text: string; tone: "gold" | "danger" }[];

  const max = series ? series.reduce((a, p) => (dec(p.totalSdg).gt(a) ? dec(p.totalSdg) : a), dec(0)) : dec(0);
  const points = (series ?? []).map((p) => ({
    day: p.day,
    label: dayLabel.format(new Date(`${p.day}T00:00:00Z`)),
    shop: formatAmount(p.shopSdg, 0),
    store: formatAmount(p.storeSdg, 0),
    total: formatAmount(p.totalSdg, 0),
    ratio: max.gt(0) ? dec(p.totalSdg).div(max).toNumber() : 0,
  }));
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
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground">{formatDay(new Date())}</p>
          <h1 className="font-display text-3xl font-bold">أهلاً {user.name}</h1>
        </div>
        {can({ pos: ["sell"] }) ? (
          <Link
            href="/pos"
            className="flex min-h-12 items-center gap-3 rounded-2xl bg-primary px-5 text-lg font-bold text-primary-foreground"
          >
            نقطة البيع
            <ArrowLeft aria-hidden className="size-5" />
          </Link>
        ) : null}
      </header>

      {/* ما يحتاج انتباهك أولاً (D-119): بطاقات تفتح الإجراء مباشرة */}
      <section aria-label="ما يحتاج انتباهك" className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">ما يحتاج انتباهك</h2>
        {attention.length ? (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {attention.map((a) => (
              <li key={a.text}>
                <Link
                  href={a.href}
                  className={`flex h-full min-h-16 items-center justify-between gap-3 rounded-2xl border bg-card p-4 font-semibold hover:bg-muted ${
                    a.tone === "danger" ? "border-danger/50" : "border-sand"
                  }`}
                >
                  <span className="flex flex-col gap-0.5">
                    <span className={`text-xs font-bold ${a.tone === "danger" ? "text-danger" : "text-warning"}`}>
                      {a.tone === "danger" ? "عاجل" : "يحتاج إجراء"}
                    </span>
                    {a.text}
                  </span>
                  <ArrowLeft aria-hidden className="size-4 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 rounded-2xl border border-border bg-card p-4 text-muted-foreground">
            <CheckCircle2 aria-hidden className="size-5 text-sage" /> لا شيء معلّق — كل شيء على ما يرام.
          </p>
        )}
      </section>

      {/* أرقام اليوم والشهر */}
      {kpis ? (
        <section aria-label="أرقام المبيعات" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat title="مبيعات اليوم" value={sdg(kpis.today.netSdg)} sub={`${kpis.today.count} فاتورة وطلب`} />
          <Stat
            title="مبيعات الشهر"
            value={sdg(kpis.month.netSdg)}
            sub={
              kpis.month.change !== null
                ? `${formatPercent(kpis.month.change)} عن نفس الفترة من الشهر الماضي`
                : "لا مقارنة بعد"
            }
            tone={kpis.month.change === null ? undefined : kpis.month.change.startsWith("-") ? "down" : "up"}
          />
          {profit ? (
            <Stat
              title="صافي ربح الشهر"
              value={<bdi dir="ltr">${formatAmount(profit.netProfitUsd)}</bdi>}
              sub={
                <Link href="/admin/reports" className="hover:underline">
                  التقرير الشهري ←
                </Link>
              }
            />
          ) : null}
          <Stat
            title="متوسط الفاتورة"
            value={kpis.month.avgTicketSdg ? sdg(kpis.month.avgTicketSdg) : "—"}
            sub="هذا الشهر"
          />
        </section>
      ) : null}

      {!seeSales && can({ pos: ["sell"] }) ? (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>ورديتك</CardTitle>
            <CardDescription>
              {mine ? `مفتوحة منذ ${formatDateTime(mine.openedAt)}` : "لا وردية مفتوحة — افتحيها من نقطة البيع."}
            </CardDescription>
          </CardHeader>
          {mine ? (
            <p className="text-3xl font-bold tabular-nums">
              {sdg(mine.totalSdg)}{" "}
              <span className="text-base font-normal text-muted-foreground">· {mine.count} فاتورة</span>
            </p>
          ) : null}
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {series ? (
            <Card>
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
          ) : null}

          {tabs ? (
            <Card>
              <CardHeader>
                <CardTitle>طلبات المتجر الآن</CardTitle>
              </CardHeader>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {pipeline.map((p) => (
                  <li key={p.key}>
                    <Link
                      href={p.key === "new" ? "/admin/orders" : `/admin/orders?tab=${p.key}`}
                      className="flex min-h-16 flex-col justify-center rounded-xl border border-line p-3 hover:bg-muted"
                    >
                      <span className="text-2xl font-bold tabular-nums">{p.count}</span>
                      <span className="text-sm text-muted-foreground">{p.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {top ? (
            <Card>
              <CardHeader>
                <CardTitle>الأكثر مبيعاً هذا الشهر</CardTitle>
              </CardHeader>
              {top.length ? (
                <ol className="flex flex-col divide-y divide-line">
                  {top.map((t, i) => (
                    <li key={t.productId} className="flex items-center justify-between gap-3 py-2">
                      <Link href={`/admin/products/${t.productId}`} className="min-w-0 font-semibold hover:underline">
                        <span className="text-muted-foreground tabular-nums">{i + 1}. </span>
                        {t.name}
                      </Link>
                      <span className="shrink-0 text-sm tabular-nums">
                        {formatAmount(t.qty, 0)} قطعة · {sdg(t.sdg)}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-muted-foreground">لا مبيعات هذا الشهر بعد.</p>
              )}
            </Card>
          ) : null}
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          {sdgRate ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>سعر الجنيه</CardTitle>
                  {sdgRate.isStale ? (
                    <Badge variant="warning">لم يُحدَّث اليوم</Badge>
                  ) : (
                    <Badge variant="success">محدَّث</Badge>
                  )}
                </div>
                {sdgRate.current ? (
                  <CardDescription>
                    {SOURCE_LABELS[sdgRate.current.source]} · {formatDateTime(sdgRate.current.effectiveAt)}
                  </CardDescription>
                ) : null}
              </CardHeader>
              <p dir="ltr" className="text-end text-3xl font-bold tabular-nums">
                {sdgRate.current ? `${formatRate(sdgRate.current.unitsPerUsd)} ${sdgRate.currency.symbol}` : "—"}
              </p>
              <Link href="/admin/exchange-rates" className="text-sm font-semibold hover:underline">
                لكل 1 دولار · السجل ←
              </Link>
            </Card>
          ) : null}

          {wallets ? (
            <Card>
              <CardHeader>
                <CardTitle>المحافظ</CardTitle>
              </CardHeader>
              <ul className="flex flex-col divide-y divide-line">
                {wallets
                  .filter((w) => w.isActive)
                  .map((w) => (
                    <li key={w.id} className="flex items-center justify-between gap-2 py-2">
                      <Link href={`/admin/wallets/${w.id}`} className="hover:underline">
                        {w.name}
                      </Link>
                      <bdi dir="ltr" className="font-semibold tabular-nums">
                        {formatAmount(w.balance, w.currencyCode === "SDG" ? 0 : 2)} {w.symbol}
                      </bdi>
                    </li>
                  ))}
              </ul>
            </Card>
          ) : null}

          {shifts ? (
            <Card>
              <CardHeader>
                <CardTitle>الورديات المفتوحة</CardTitle>
              </CardHeader>
              {shifts.length ? (
                <ul className="flex flex-col gap-2 text-sm">
                  {shifts.map((sh) => (
                    <li key={sh.id} className="flex justify-between gap-2">
                      <span className="font-semibold">{sh.userName}</span>
                      <span className="text-muted-foreground">
                        منذ {formatDateTime(sh.openedAt)} · {sh.sales} فاتورة
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">لا ورديات مفتوحة الآن.</p>
              )}
            </Card>
          ) : null}

          {stock ? (
            <Card>
              <CardHeader>
                <CardTitle>قارب على النفاد</CardTitle>
                <CardDescription>{stock.total ? `${stock.total} صنف` : "المخزون فوق الحد."}</CardDescription>
              </CardHeader>
              {stock.items.length ? (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {stock.items.map((s) => (
                    <li key={s.variantId} className="flex justify-between gap-2">
                      <Link href={`/admin/products/${s.productId}`} className="min-w-0 hover:underline">
                        {s.label}
                      </Link>
                      <span className={`shrink-0 font-semibold tabular-nums ${dec(s.qty).lte(0) ? "text-danger" : ""}`}>
                        {dec(s.qty).lte(0) ? "نفد" : formatAmount(s.qty, 0)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {stock.total > stock.items.length ? (
                <Link href="/admin/stock" className="text-sm font-semibold hover:underline">
                  كل المخزون ←
                </Link>
              ) : null}
            </Card>
          ) : null}

          {expiring && expiring.total ? (
            <Card>
              <CardHeader>
                <CardTitle>صلاحية قريبة</CardTitle>
                <CardDescription>خلال {expiring.days} يوماً أو انتهت</CardDescription>
              </CardHeader>
              <ul className="flex flex-col gap-1.5 text-sm">
                {expiring.items.map((b) => (
                  <li key={b.id} className="flex justify-between gap-2">
                    <Link href={`/admin/products/${b.productId}`} className="min-w-0 hover:underline">
                      {b.label} <span className="text-muted-foreground">({formatAmount(b.qty, 0)})</span>
                    </Link>
                    <span className={`shrink-0 tabular-nums ${b.expired ? "font-semibold text-danger" : ""}`}>
                      {b.expired ? "منتهية" : b.expiresOn}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Stat({
  title,
  value,
  sub,
  tone,
}: {
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "up" | "down";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-card p-4">
      <span className="text-sm text-muted-foreground">{title}</span>
      <span className="truncate text-2xl font-bold tabular-nums">{value}</span>
      {sub ? (
        <span
          className={`text-xs ${tone === "down" ? "text-danger" : tone === "up" ? "text-forest" : "text-muted-foreground"}`}
        >
          {tone === "up" ? "▲ " : tone === "down" ? "▼ " : ""}
          {sub}
        </span>
      ) : null}
    </div>
  );
}
