import {
  ORDER_MESSAGE_KEYS,
  ORDER_MESSAGE_LABELS,
  SHOP_TIME_ZONE,
  renderOrderMessage,
  sum,
  suggestedOrderMessages,
  whatsappMessageUrl,
  type OrderMessageKey,
  type OrderMessageVars,
  type OrderStatus,
} from "@ghusn/core";
import { prisma } from "@ghusn/db";
import { formatAmount, formatDateTime } from "./format";
import { UNPAID_CANCEL_REASON } from "./orders";
import { getMessageSettings, getReceiptSettings } from "./settings";
import { localePath, siteUrl } from "./site";

/**
 * رسائل واتساب الجاهزة لصفحة الطلب (D-113): الرسالة المقترحة لحالته وباقي ما يناسبها، بنص كامل
 * ورابط wa.me برقم العميل، وآخر مرة أُرسلت كل رسالة ومن أرسلها. عند ربط Cloud API تُرسل نفس
 * القوالب تلقائياً من نفس النقاط.
 */

const enDateTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: SHOP_TIME_ZONE,
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export interface OrderMessageOption {
  key: OrderMessageKey;
  label: string;
  text: string;
  href: string;
  /** للصنف غير المتوفر: اسم الصنف. */
  item?: string;
  lastSent: { by: string | null; at: Date } | null;
}

export async function orderMessages(orderId: string) {
  const [o, settings, receipt] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { phone: true } },
        lines: { orderBy: { sortOrder: "asc" }, select: { label: true } },
        history: {
          orderBy: { createdAt: "desc" },
          take: 2,
          select: { fromStatus: true, toStatus: true },
        },
        payments: { select: { amountSdg: true } },
        paymentProofs: { orderBy: { createdAt: "desc" }, take: 1, select: { accepted: true, reviewNote: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          select: { key: true, createdAt: true, sentBy: { select: { name: true } } },
        },
      },
    }),
    getMessageSettings(),
    getReceiptSettings(),
  ]);
  if (!o) return null;
  const en = o.locale === "en";
  const status = o.status as OrderStatus;
  const last = o.history[0];
  const proof = o.paymentProofs[0];
  // مدفوع لم يُرد (الرد يُسجَّل دفعة سالبة)
  const paid = sum(o.payments.map((p) => p.amountSdg.toString())).gt(0);
  const { primary, others } = suggestedOrderMessages({
    status,
    fulfillment: o.fulfillment,
    paymentMethod: o.paymentMethod,
    proofRejected: status === "AWAITING_PAYMENT" && proof?.accepted === false,
    paid,
    previousStatus: last && last.toStatus === status ? ((last.fromStatus as OrderStatus | null) ?? null) : null,
    autoCancelled: status === "CANCELLED" && o.cancelReason === UNPAID_CANCEL_REASON,
  });

  const vars: OrderMessageVars = {
    name: o.customerName,
    number: o.number,
    amount: formatAmount(o.totalSdg, 0),
    link: `${siteUrl()}${localePath(o.locale, `/o/${o.trackingToken}`)}`,
    signature: en ? settings.signatureEn : settings.signatureAr,
    deadline: o.paymentDueAt ? (en ? enDateTime.format(o.paymentDueAt) : formatDateTime(o.paymentDueAt)) : null,
    reason: status === "CANCELLED" ? o.cancelReason : (proof?.reviewNote ?? null),
    recipient: o.recipientName,
    address: receipt.address,
    hours: en ? settings.hoursEn : settings.hoursAr,
  };
  const lastSent = (key: string) => {
    const m = o.messages.find((x) => x.key === key);
    return m ? { by: m.sentBy?.name ?? null, at: m.createdAt } : null;
  };
  const option = (key: OrderMessageKey, extra: Partial<OrderMessageVars> = {}): OrderMessageOption => {
    const text = renderOrderMessage(key, { ...vars, ...extra }, en ? "en" : "ar");
    return {
      key,
      label: ORDER_MESSAGE_LABELS[key],
      text,
      href: whatsappMessageUrl(o.customer.phone, text),
      ...(extra.item ? { item: extra.item } : {}),
      lastSent: lastSent(key),
    };
  };

  return {
    primary: primary ? option(primary) : null,
    others: others.filter((k) => k !== "ITEM_UNAVAILABLE").map((k) => option(k)),
    // صنف غير متوفر: رسالة لكل صنف في الطلب، تكملها الموظفة في واتساب (البديل)
    unavailable: others.includes("ITEM_UNAVAILABLE")
      ? o.lines.map((l) => option("ITEM_UNAVAILABLE", { item: l.label }))
      : [],
    history: o.messages.slice(0, 10).map((m) => ({
      label: ORDER_MESSAGE_LABELS[m.key as OrderMessageKey] ?? m.key,
      by: m.sentBy?.name ?? null,
      at: m.createdAt,
    })),
  };
}

const KEYS = new Set<string>(ORDER_MESSAGE_KEYS);

/** تسجيل فتح الرسالة في واتساب (الإرسال اليدوي) — لتعرف الأخريات أنها أُرسلت. */
export async function logOrderMessage(orderId: string, key: string, userId: string): Promise<void> {
  if (!KEYS.has(key)) return;
  const exists = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
  if (!exists) return;
  await prisma.orderMessageLog.create({ data: { orderId, key, sentById: userId } });
}
