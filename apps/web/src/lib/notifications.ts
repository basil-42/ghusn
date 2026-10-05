import { inQuietHours, isRinging, type NotificationPriority, type NotificationTypeName } from "@ghusn/core";
import { prisma, type NotificationType, type Prisma } from "@ghusn/db";
import { ROLE_NAMES, roleCan } from "./auth/permissions";
import { formatAmount } from "./format";

/**
 * الإشعارات (D-109). كل حدث يُكتب بـ notify() داخل نفس المعاملة التي أنشأته (طلب، إشعار دفع) —
 * فلا إشعار لطلب لم يُحفظ، ولا طلب بلا إشعار. يصل لكل مستخدمة نشطة تملك صلاحية الحدث.
 * النص بالعربي ولا يحوي تكلفة ولا ربحاً (يصل للموظفات).
 */

type Db = Prisma.TransactionClient | typeof prisma;
type Permissions = Parameters<typeof roleCan>[1];

interface NotifyInput {
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  href: string;
  orderId?: string | null;
  dedupeKey?: string | null;
  /** من يستلمه: كل من يملك هذه الصلاحية. */
  audience: Permissions;
  /** واستثناء من يملك هذه (مثل: المديرة دون المالك في أول تصعيد). */
  exclude?: Permissions;
}

/** المستخدمات النشطات اللاتي تملك أدوارهن الصلاحية. */
async function audienceIds(db: Db, permissions: Permissions, exclude?: Permissions): Promise<string[]> {
  const roles = ROLE_NAMES.filter((r) => roleCan(r, permissions) && !(exclude && roleCan(r, exclude)));
  if (!roles.length) return [];
  const users = await db.user.findMany({ where: { role: { in: roles }, banned: false }, select: { id: true } });
  return users.map((u) => u.id);
}

/** يكتب الإشعار ومستلميه. نفس dedupeKey مرتين = لا شيء (إعادة المحاولة آمنة). */
export async function notify(db: Db, input: NotifyInput): Promise<string | null> {
  // فحص قبل الإنشاء بدل التقاط خطأ التكرار: الخطأ داخل معاملة Postgres يُفسدها كلها
  if (input.dedupeKey) {
    const existing = await db.notification.findUnique({ where: { dedupeKey: input.dedupeKey }, select: { id: true } });
    if (existing) return null;
  }
  const userIds = await audienceIds(db, input.audience, input.exclude);
  if (!userIds.length) return null;
  const n = await db.notification.create({
    data: {
      type: input.type,
      priority: input.priority,
      title: input.title,
      body: input.body,
      href: input.href,
      orderId: input.orderId ?? null,
      dedupeKey: input.dedupeKey ?? null,
      recipients: { createMany: { data: userIds.map((userId) => ({ userId })) } },
    },
    select: { id: true },
  });
  return n.id;
}

const sdg = (v: { toString(): string }) => `${formatAmount(v, 0)} ج.س`;

/** الأحداث كما تظهر في التفضيلات: الاسم، الشرح، الأولوية، ومن يستلمها (D-109). */
export const NOTIFICATION_EVENTS: {
  type: NotificationTypeName;
  label: string;
  hint: string;
  priority: NotificationPriority | "DAILY";
  audience: Permissions;
}[] = [
  {
    type: "ORDER_NEW",
    label: "طلب جديد من المتجر",
    hint: "الرقم، الاسم، المبلغ، المدينة",
    priority: "URGENT",
    audience: { order: ["read"] },
  },
  {
    type: "PAYMENT_PROOF",
    label: "إشعار دفع بنكك يحتاج مراجعة",
    hint: "لمن تراجع الدفع فقط",
    priority: "URGENT",
    audience: { order: ["payment"] },
  },
  {
    type: "BANKAK_EXPIRING",
    label: "حجز بنكك ينتهي خلال ساعتين بلا دفع",
    hint: "لتذكير العميل قبل الإلغاء التلقائي",
    priority: "IMPORTANT",
    audience: { order: ["payment"] },
  },
  {
    type: "ORDER_ESCALATED",
    label: "تصعيد: طلب لم يُفتح",
    hint: "للمديرة بعد 15 دقيقة، وللمالك بعد 30 دقيقة",
    priority: "IMPORTANT",
    audience: { order: ["cancel"] },
  },
  {
    type: "LOW_STOCK",
    label: "قارب على النفاد",
    hint: "مرة واحدة لكل صنف حتى يُعاد تعبئته",
    priority: "NORMAL",
    audience: { margin: ["update"] },
  },
  {
    type: "BATCH_EXPIRING",
    label: "دفعة تقترب صلاحيتها من الانتهاء",
    hint: "حسب مهلة التنبيه في الضبط",
    priority: "NORMAL",
    audience: { margin: ["update"] },
  },
  {
    type: "PRICE_SUGGESTIONS",
    label: "سعر الصرف واقتراحات الأسعار",
    hint: "للمالك والمديرة",
    priority: "NORMAL",
    audience: { price: ["approve"] },
  },
  {
    type: "DAILY_SUMMARY",
    label: "الملخص اليومي",
    hint: "للمالك · الساعة 10:00 م بتوقيت الخرطوم",
    priority: "DAILY",
    audience: { capital: ["update"] },
  },
];

/** الأحداث التي تخص دور المستخدمة — التفضيلات لا تعرض غيرها. */
export const eventsForRole = (role: unknown) => NOTIFICATION_EVENTS.filter((e) => roleCan(role, e.audience));

/** طلب جديد من المتجر — عاجل لكل من يرى الطلبات. */
export function notifyNewOrder(
  db: Db,
  o: {
    id: string;
    number: string;
    customerName: string;
    itemCount: number;
    totalSdg: { toString(): string };
    cityLabel: string | null;
    gift: boolean;
    bankak: boolean;
  },
) {
  const parts = [
    o.customerName,
    o.itemCount === 1 ? "صنف واحد" : o.itemCount === 2 ? "صنفان" : `${o.itemCount} أصناف`,
    sdg(o.totalSdg),
    o.cityLabel ? `توصيل ${o.cityLabel}` : "استلام من المحل",
    ...(o.gift ? ["هدية"] : []),
    ...(o.bankak ? ["بانتظار دفع بنكك"] : []),
  ];
  return notify(db, {
    type: "ORDER_NEW",
    priority: "URGENT",
    title: `طلب جديد · ${o.number}`,
    body: parts.join(" · "),
    href: `/admin/orders/${o.id}`,
    orderId: o.id,
    dedupeKey: `ORDER_NEW:${o.id}`,
    audience: { order: ["read"] },
  });
}

/** العميل رفع إشعار بنكك — عاجل لمن تراجع الدفع. */
export function notifyPaymentProof(
  db: Db,
  o: { id: string; number: string; totalSdg: { toString(): string } },
  proofId: string,
) {
  return notify(db, {
    type: "PAYMENT_PROOF",
    priority: "URGENT",
    title: `إشعار دفع بنكك · ${o.number}`,
    body: `رفع العميل صورة الإشعار ورقم العملية · ${sdg(o.totalSdg)}`,
    href: `/admin/orders/${o.id}`,
    orderId: o.id,
    dedupeKey: `PAYMENT_PROOF:${proofId}`,
    audience: { order: ["payment"] },
  });
}

// ---------- القراءة ----------

export const NOTIFICATION_FILTERS = [
  "all",
  "unread",
  "urgent",
  "orders",
  "payment",
  "stock",
  "prices",
  "summary",
] as const;
export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number];

const FILTER_TYPES: Partial<Record<NotificationFilter, NotificationType[]>> = {
  orders: ["ORDER_NEW", "ORDER_ESCALATED"],
  payment: ["PAYMENT_PROOF", "BANKAK_EXPIRING"],
  stock: ["LOW_STOCK", "BATCH_EXPIRING"],
  prices: ["PRICE_SUGGESTIONS"],
  summary: ["DAILY_SUMMARY"],
};

export interface NotificationItem {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  read: boolean;
  /** العاجل الذي ما زال يرنّ (لم يُقرأ ولم يُفتح طلبه). */
  ringing: boolean;
  /** «فتحته هبة» — آخر من فتح الطلب بعد وصول الإشعار. */
  openedBy: { name: string; at: string } | null;
}

const itemInclude = {
  notification: {
    select: {
      id: true,
      type: true,
      priority: true,
      title: true,
      body: true,
      href: true,
      createdAt: true,
      order: { select: { lastOpenedAt: true, lastOpenedBy: { select: { name: true } } } },
    },
  },
} satisfies Prisma.NotificationRecipientInclude;

type Row = Prisma.NotificationRecipientGetPayload<{ include: typeof itemInclude }>;

function toItem(r: Row, now: Date): NotificationItem {
  const n = r.notification;
  const openedAt = n.order?.lastOpenedAt ?? null;
  const openedAfter = openedAt && openedAt >= n.createdAt ? openedAt : null;
  return {
    id: n.id,
    type: n.type,
    priority: n.priority,
    title: n.title,
    body: n.body,
    href: n.href,
    createdAt: n.createdAt.toISOString(),
    read: r.readAt !== null,
    ringing: isRinging(
      { priority: n.priority, createdAt: n.createdAt, readAt: r.readAt, orderOpenedAt: openedAt },
      now,
    ),
    openedBy:
      openedAfter && n.order?.lastOpenedBy ? { name: n.order.lastOpenedBy.name, at: openedAfter.toISOString() } : null,
  };
}

function filterWhere(userId: string, filter: NotificationFilter): Prisma.NotificationRecipientWhereInput {
  return {
    userId,
    ...(filter === "unread" ? { readAt: null } : {}),
    ...(filter === "urgent" ? { notification: { priority: "URGENT" } } : {}),
    ...(FILTER_TYPES[filter] ? { notification: { type: { in: FILTER_TYPES[filter] } } } : {}),
  };
}

export async function listNotifications(
  userId: string,
  { filter = "all", take = 20, now = new Date() }: { filter?: NotificationFilter; take?: number; now?: Date } = {},
): Promise<NotificationItem[]> {
  const rows = await prisma.notificationRecipient.findMany({
    where: filterWhere(userId, filter),
    orderBy: { createdAt: "desc" },
    take,
    include: itemInclude,
  });
  return rows.map((r) => toItem(r, now));
}

export const countUnread = (userId: string) => prisma.notificationRecipient.count({ where: { userId, readAt: null } });

/** ما يحتاجه الجرس كل استطلاع: العدّاد، آخر الإشعارات، وعدّاد «طلبات المتجر» لمن تراها. */
export async function notificationSummary(userId: string, role: unknown) {
  const now = new Date();
  const [unread, items, pendingOrders, prefs] = await Promise.all([
    countUnread(userId),
    listNotifications(userId, { take: 15, now }),
    roleCan(role, { order: ["read"] })
      ? prisma.order.count({ where: { status: { in: ["NEW", "PAYMENT_REVIEW"] } } })
      : Promise.resolve(null),
    prisma.notificationPreference.findUnique({ where: { userId }, select: { quietStart: true, quietEnd: true } }),
  ]);
  // ساعات الهدوء تكتم نغمة «المهم» داخل النظام أيضاً؛ العاجل يرنّ دائماً
  const quiet = prefs ? inQuietHours(now, prefs.quietStart, prefs.quietEnd) : inQuietHours(now, "23:00", "08:00");
  return { unread, items, pendingOrders, quiet, now: now.toISOString() };
}

export async function markNotificationsRead(userId: string, ids: string[] | "all"): Promise<void> {
  await prisma.notificationRecipient.updateMany({
    where: { userId, readAt: null, ...(ids === "all" ? {} : { notificationId: { in: ids } }) },
    data: { readAt: new Date() },
  });
}

/**
 * فتح صفحة الطلب في الإدارة: يسجّل آخر من فتحه ومتى (يوقف تكرار الصوت والتصعيد لكل المستلمات)،
 * ويجعل إشعارات هذا الطلب مقروءة لمن فتحته.
 */
export async function markOrderOpened(orderId: string, userId: string): Promise<void> {
  const now = new Date();
  await prisma.$transaction([
    prisma.order.update({ where: { id: orderId }, data: { lastOpenedAt: now, lastOpenedById: userId } }),
    prisma.notificationRecipient.updateMany({
      where: { userId, readAt: null, notification: { orderId } },
      data: { readAt: now },
    }),
  ]);
}
