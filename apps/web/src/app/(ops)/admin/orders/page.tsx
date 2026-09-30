import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount, formatDateTime } from "@/lib/format";
import {
  CITY_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_TABS,
  listOrders,
  orderTabCounts,
  statusVariant,
  type OrderTab,
} from "@/lib/orders";

export const metadata: Metadata = { title: "طلبات المتجر | غصن" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePermission({ order: ["read"] });
  const { tab: t } = await searchParams;
  const tab = (ORDER_TABS.find((x) => x.key === t)?.key ?? "new") as OrderTab;
  const [orders, counts] = await Promise.all([listOrders(tab), orderTabCounts()]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl font-bold">طلبات المتجر</h1>
        <p className="text-muted-foreground">
          الأقدم أولاً. التوصيل عبر شركة التوصيل، والدفع عند الاستلام يدخل محفظتها عند التسليم (D-88).
        </p>
      </header>
      <nav aria-label="حالات الطلبات" className="flex gap-1 overflow-x-auto">
        {ORDER_TABS.map((x) => (
          <Link
            key={x.key}
            href={x.key === "new" ? "/admin/orders" : `/admin/orders?tab=${x.key}`}
            aria-current={x.key === tab ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold ${
              x.key === tab ? "border-forest bg-forest text-ivory" : "border-line bg-card hover:bg-muted"
            }`}
          >
            {x.label}
            {counts[x.key] ? <span className="tabular-nums">({counts[x.key]})</span> : null}
          </Link>
        ))}
      </nav>
      {orders.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-muted-foreground">لا طلبات هنا.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/admin/orders/${o.id}`}
                className="flex min-h-16 flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 hover:border-primary"
              >
                <span className="flex flex-col">
                  <span className="font-semibold">
                    <bdi dir="ltr">{o.number}</bdi> · {o.customerName}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatDateTime(o.createdAt)} · {o.lines} صنف ·{" "}
                    {o.fulfillment === "PICKUP"
                      ? "استلام من المحل"
                      : `توصيل${o.city ? ` — ${CITY_LABELS[o.city]}` : ""}`}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge variant={statusVariant(o.status)}>{ORDER_STATUS_LABELS[o.status]}</Badge>
                  <bdi dir="ltr" className="font-bold tabular-nums">
                    {formatAmount(o.totalSdg, 0)} ج.س
                  </bdi>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
