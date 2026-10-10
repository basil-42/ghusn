import { ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { bulkTarget } from "@ghusn/core";
import { EmptyState } from "@/components/admin/empty-state";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import {
  CITY_LABELS,
  ORDER_STATUS_LABELS,
  expireUnpaidOrders,
  ORDER_TABS,
  listOrders,
  orderTabCounts,
  statusVariant,
  type OrderTab,
} from "@/lib/orders";
import { BulkOrderList, type BulkAction, type OrderRow } from "./bulk-list";
import { PageHeader } from "@/components/admin/page-header";

export const metadata: Metadata = { title: "طلبات المتجر | غصن" };

/** لماذا لا يدخل طلب في إجراء تبويبه — يُنفَّذ من صفحته. */
const INELIGIBLE: Partial<Record<OrderTab, string>> = {
  new: "بنكك أو بانتظار الدفع — يُتابَع من صفحته (مراجعة الإشعار).",
  ready: "استلام من المحل — يُسلَّم من صفحته (نقداً أو بنكك بالوردية).",
};

const EMPTY: Record<OrderTab, string> = {
  new: "لا طلبات جديدة — كل طلب من ghusn.store يظهر هنا فوراً مع تنبيه.",
  confirmed: "لا طلبات مؤكدة بانتظار التجهيز.",
  preparing: "لا طلبات قيد التجهيز.",
  ready: "لا طلبات جاهزة بانتظار الاستلام أو التوصيل.",
  delivery: "لا طلبات مع التوصيل الآن.",
  delivered: "لم يُسلَّم أي طلب بعد.",
  cancelled: "لا طلبات ملغاة.",
};

/** الإجراء الجماعي لكل تبويب (D-124) — نفس الخطوة التالية في bulkTarget. */
const BULK: Partial<Record<OrderTab, BulkAction>> = {
  new: { to: "CONFIRMED", label: "تأكيد المحدد", done: "تم التأكيد" },
  confirmed: { to: "PREPARING", label: "بدء التجهيز", done: "بدأ التجهيز" },
  preparing: { to: "READY", label: "جاهز", done: "أصبحت جاهزة" },
  ready: { to: "OUT_FOR_DELIVERY", label: "تسليم لشركة التوصيل", done: "سُلّمت لشركة التوصيل", courierRef: true },
  delivery: { to: "DELIVERED", label: "تم التسليم", done: "تم التسليم", confirm: true },
};

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await requirePermission({ order: ["read"] });
  const { tab: t } = await searchParams;
  const tab = (ORDER_TABS.find((x) => x.key === t)?.key ?? "new") as OrderTab;
  // احتياط إن تأخر العامل الدوري: طلبات بنكك المنتهية مهلتها تُلغى
  await expireUnpaidOrders();
  const [orders, counts] = await Promise.all([listOrders(tab), orderTabCounts()]);
  const action = roleCan(session.user.role, { order: ["update"] }) ? (BULK[tab] ?? null) : null;
  const rows: OrderRow[] = orders.map((o) => {
    const target = bulkTarget({ status: o.status, fulfillment: o.fulfillment, payment: o.paymentMethod });
    const eligible = !!action && target === action.to;
    return {
      id: o.id,
      number: o.number,
      customerName: o.customerName,
      sub: [
        formatDateTime(o.createdAt),
        `${o.lines} صنف`,
        o.fulfillment === "PICKUP" ? "استلام من المحل" : `توصيل${o.city ? ` — ${CITY_LABELS[o.city]}` : ""}`,
        o.paymentMethod === "BANKAK" ? "بنكك" : "",
        o.wrapped ? "تغليف" : "",
      ]
        .filter(Boolean)
        .join(" · "),
      due:
        o.status === "AWAITING_PAYMENT" && o.paymentDueAt ? `مهلة الدفع حتى ${formatDateTime(o.paymentDueAt)}` : null,
      statusLabel: ORDER_STATUS_LABELS[o.status],
      statusVariant: statusVariant(o.status),
      totalSdg: o.totalSdg,
      eligible,
      ineligibleHint: eligible || !action ? undefined : INELIGIBLE[tab],
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="طلبات المتجر"
        description="الأقدم أولاً. التوصيل عبر شركة التوصيل، والدفع عند الاستلام يدخل محفظتها عند التسليم (D-88)."
      />
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
      {/* دائماً في نفس المكان: نتيجة الإجراء الجماعي ورسائله تبقى بعد أن ينتقل كل الطلبات من التبويب */}
      <BulkOrderList rows={rows} action={action} empty={<EmptyState icon={ShoppingBag} title={EMPTY[tab]} />} />
    </div>
  );
}
