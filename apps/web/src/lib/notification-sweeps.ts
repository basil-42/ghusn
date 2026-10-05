import { bankakReminderDue, dec, escalationLevel, shopDay, shopDayStart, BANKAK_REMIND_MS } from "@ghusn/core";
import { prisma } from "@ghusn/db";
import { expiringBatches, lowStock, salesKpis } from "./dashboard";
import { formatAmount, formatTime } from "./format";
import { notify } from "./notifications";
import { countPriceReview } from "./pricing";

/**
 * الإشعارات المجدولة (D-109) — تعمل من lib/jobs: التصعيد وتذكير بنكك كل دقيقة، المخزون كل ساعة،
 * الملخص اليومي 10 م بتوقيت الخرطوم، والتنظيف يومياً. كلها آمنة للتكرار (dedupeKey أو حالة محفوظة).
 */

const sdg = (v: { toString(): string }) => `${formatAmount(v, 0)} ج.س`;
/** نطاق البحث عن طلبات تحتاج تصعيداً — أقدم من ذلك فات أوانه. */
const ESCALATION_WINDOW_MS = 3 * 3_600_000;

/** طلب جديد لم يُفتح: بعد 15 دقيقة للمديرة، وبعد 30 للمالك. */
export async function runEscalations(now = new Date()): Promise<number> {
  const rows = await prisma.notification.findMany({
    where: {
      type: "ORDER_NEW",
      createdAt: { gte: new Date(now.getTime() - ESCALATION_WINDOW_MS) },
      order: { status: "NEW" },
    },
    select: {
      createdAt: true,
      body: true,
      order: { select: { id: true, number: true, lastOpenedAt: true } },
    },
  });
  let created = 0;
  for (const n of rows) {
    if (!n.order) continue;
    const level = escalationLevel(n.createdAt, n.order.lastOpenedAt, now);
    if (level >= 1) {
      const id = await notify(prisma, {
        type: "ORDER_ESCALATED",
        priority: "IMPORTANT",
        title: `طلب لم يُفتح منذ 15 دقيقة · ${n.order.number}`,
        body: n.body,
        href: `/admin/orders/${n.order.id}`,
        orderId: n.order.id,
        dedupeKey: `ESCALATE_1:${n.order.id}`,
        // المديرة — المالك يصله المستوى الثاني
        audience: { order: ["cancel"] },
        exclude: { capital: ["update"] },
      });
      if (id) created++;
    }
    if (level >= 2) {
      const id = await notify(prisma, {
        type: "ORDER_ESCALATED",
        priority: "IMPORTANT",
        title: `طلب ينتظر منذ 30 دقيقة بلا متابعة · ${n.order.number}`,
        body: n.body,
        href: `/admin/orders/${n.order.id}`,
        orderId: n.order.id,
        dedupeKey: `ESCALATE_2:${n.order.id}`,
        audience: { capital: ["update"] },
      });
      if (id) created++;
    }
  }
  return created;
}

/** حجز بنكك ينتهي خلال ساعتين بلا دفع — لتذكير العميل قبل الإلغاء التلقائي. */
export async function runBankakReminders(now = new Date()): Promise<number> {
  const orders = await prisma.order.findMany({
    where: {
      status: "AWAITING_PAYMENT",
      paymentDueAt: { gt: now, lte: new Date(now.getTime() + BANKAK_REMIND_MS) },
    },
    select: { id: true, number: true, customerName: true, totalSdg: true, paymentDueAt: true },
  });
  let created = 0;
  for (const o of orders) {
    if (!bankakReminderDue(o.paymentDueAt, now) || !o.paymentDueAt) continue;
    const id = await notify(prisma, {
      type: "BANKAK_EXPIRING",
      priority: "IMPORTANT",
      title: `حجز بنكك ينتهي قريباً · ${o.number}`,
      body: `${o.customerName} · ${sdg(o.totalSdg)} · لم يصل الدفع · يُلغى تلقائياً ${formatTime(o.paymentDueAt)} — ذكّري العميل على واتساب`,
      href: `/admin/orders/${o.id}`,
      orderId: o.id,
      dedupeKey: `BANKAK_EXPIRING:${o.id}`,
      audience: { order: ["payment"] },
    });
    if (id) created++;
  }
  return created;
}

/** «فلان، فلان، فلان و2 أخرى» */
function namesList(labels: string[]): string {
  const shown = labels.slice(0, 3).join("، ");
  const rest = labels.length - 3;
  return rest > 0 ? `${shown} و${rest} أخرى` : shown;
}

/**
 * قارب على النفاد: تنبيه مرة واحدة لكل صنف حتى يعود رصيده فوق الحد (فتُحذف حالته ويُنبَّه من جديد
 * لاحقاً). الأصناف الجديدة في نفس الجولة تُجمع في إشعار واحد.
 */
export async function runLowStockAlerts(): Promise<number> {
  const { items } = await lowStock(1000);
  const lowKeys = new Map(items.map((i) => [`low:${i.variantId}`, i.label]));
  const states = await prisma.notificationAlertState.findMany({ where: { key: { startsWith: "low:" } } });
  const known = new Set(states.map((s) => s.key));
  const recovered = states.filter((s) => !lowKeys.has(s.key)).map((s) => s.key);
  if (recovered.length) await prisma.notificationAlertState.deleteMany({ where: { key: { in: recovered } } });
  const fresh = [...lowKeys].filter(([k]) => !known.has(k));
  if (!fresh.length) return 0;
  await prisma.$transaction(async (tx) => {
    await tx.notificationAlertState.createMany({ data: fresh.map(([key]) => ({ key })), skipDuplicates: true });
    await notify(tx, {
      type: "LOW_STOCK",
      priority: "NORMAL",
      title: fresh.length === 1 ? `قارب على النفاد · ${fresh[0]![1]}` : `${fresh.length} أصناف قاربت على النفاد`,
      body:
        fresh.length === 1
          ? "وصل حد التنبيه — أضيفيه لطلبية الشحنة القادمة"
          : `${namesList(fresh.map(([, l]) => l))} — وصلت حد التنبيه`,
      href: "/admin/stock",
      audience: { margin: ["update"] },
    });
  });
  return fresh.length;
}

/** دفعات تقترب صلاحيتها من الانتهاء (حسب مهلة الضبط): مرة واحدة لكل دفعة، مجمّعة في إشعار. */
export async function runExpiringBatchAlerts(now = new Date()): Promise<number> {
  const { items, days } = await expiringBatches(500, now);
  const states = await prisma.notificationAlertState.findMany({
    where: { key: { in: items.map((b) => `batch:${b.id}`) } },
    select: { key: true },
  });
  const known = new Set(states.map((s) => s.key));
  const fresh = items.filter((b) => !known.has(`batch:${b.id}`));
  if (!fresh.length) return 0;
  await prisma.$transaction(async (tx) => {
    await tx.notificationAlertState.createMany({
      data: fresh.map((b) => ({ key: `batch:${b.id}` })),
      skipDuplicates: true,
    });
    const first = fresh[0]!;
    await notify(tx, {
      type: "BATCH_EXPIRING",
      priority: "NORMAL",
      title:
        fresh.length === 1
          ? `${first.expired ? "انتهت صلاحية" : "تقترب صلاحية"} · ${first.label}`
          : `${fresh.length} دفعات تقترب صلاحيتها من الانتهاء`,
      body:
        fresh.length === 1
          ? `الكمية ${formatAmount(first.qty, 0)} · تنتهي ${first.expiresOn}`
          : `${namesList(fresh.map((b) => b.label))} — خلال ${days} يوماً أو أقل`,
      href: "/admin/stock",
      audience: { margin: ["update"] },
    });
  });
  return fresh.length;
}

/** بعد حفظ سعر الجنيه: كم صنفاً يحتاج مراجعة سعره (D-24) — للمالك والمديرة. */
export async function notifyPriceSuggestions(rateId: string, unitsPerUsd: string): Promise<void> {
  const count = await countPriceReview();
  if (!count) return;
  await notify(prisma, {
    type: "PRICE_SUGGESTIONS",
    priority: "NORMAL",
    title: "تغيّر سعر الصرف",
    body: `${formatAmount(unitsPerUsd, 0)} ج.س للدولار · ${count} ${count === 1 ? "صنف يحتاج" : count === 2 ? "صنفان يحتاجان" : "أصناف تحتاج"} مراجعة السعر`,
    href: "/admin/pricing",
    dedupeKey: `PRICE_SUGGESTIONS:${rateId}`,
    audience: { price: ["approve"] },
  });
}

const OPEN_STATUSES = ["NEW", "PAYMENT_REVIEW", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"] as const;

/** الملخص اليومي 10 م بتوقيت الخرطوم — للمالك: المبيعات، طلبات المتجر، المصاريف، المفتوح. */
export async function sendDailySummary(now = new Date()): Promise<void> {
  const day = shopDay(now);
  const start = shopDayStart(day);
  const [kpis, webOrders, open, expenses] = await Promise.all([
    salesKpis(now),
    prisma.order.count({ where: { channel: "WEB", createdAt: { gte: start, lte: now } } }),
    prisma.order.count({ where: { status: { in: [...OPEN_STATUSES] } } }),
    prisma.expense.aggregate({
      where: { voidedAt: null, spentAt: { gte: start, lte: now } },
      _count: true,
      _sum: { amountUsd: true },
    }),
  ]);
  const expUsd = dec(expenses._sum.amountUsd?.toString() ?? "0");
  const parts = [
    `المبيعات ${sdg(kpis.today.netSdg)} (${kpis.today.count} فاتورة وطلب)`,
    `طلبات المتجر اليوم ${webOrders}`,
    `المصاريف ${expenses._count ? `${formatAmount(expUsd, 2)}$ (${expenses._count})` : "لا شيء"}`,
    `طلبات مفتوحة ${open}`,
  ];
  await notify(prisma, {
    type: "DAILY_SUMMARY",
    priority: "NORMAL",
    title: "ملخص اليوم",
    body: parts.join(" · "),
    href: "/admin",
    dedupeKey: `DAILY_SUMMARY:${day}`,
    audience: { capital: ["update"] },
  });
}

const RETENTION_MS = 90 * 86_400_000;

/** حذف المقروء الأقدم من 90 يوماً، والإشعار الذي لم يبقَ له مستلم، وحالات الدفعات القديمة. */
export async function cleanupNotifications(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_MS);
  const read = await prisma.notificationRecipient.deleteMany({ where: { readAt: { lt: cutoff } } });
  await prisma.notification.deleteMany({ where: { createdAt: { lt: cutoff }, recipients: { none: {} } } });
  await prisma.notificationAlertState.deleteMany({
    where: { key: { startsWith: "batch:" }, createdAt: { lt: new Date(now.getTime() - 2 * RETENTION_MS) } },
  });
  return read.count;
}
