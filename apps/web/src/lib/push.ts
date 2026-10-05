import {
  DEFAULT_PUSH_TYPES,
  DEFAULT_QUIET,
  NOTIFICATION_TYPES,
  groupForPush,
  isTimeOfDay,
  shouldPush,
  type NotificationTypeName,
  type PushPrefs,
} from "@ghusn/core";
import { prisma } from "@ghusn/db";
import { after } from "next/server";
import webpush from "web-push";
import { z } from "zod";
import { siteUrl } from "./site";

/**
 * إشعارات الجوال (Web Push بمفاتيح VAPID — D-109). مجاني وبلا طرف ثالث مدفوع؛ المتصفح يوصله عبر
 * خدمة الإشعارات الخاصة به (FCM على أندرويد، Apple على آيفون المضاف للشاشة).
 *
 * الإرسال بنمط Outbox: الإشعار يُكتب داخل معاملة الحدث بـ pushedAt فارغ، ثم يُرسل بعد نجاح المعاملة
 * (kickPushDelivery) — ومهمة كل دقيقة تلتقط ما فات (خادم أُعيد تشغيله مثلاً). المطالبة بالإشعار
 * بتحديث ذرّي، فلا يُرسل مرتين حتى لو عمل أكثر من خادم.
 */

export interface PushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function pushConfig(env: Record<string, string | undefined> = process.env): PushConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  // المعيار يقبل https: أو mailto: فقط — APP_URL محلياً http
  const site = siteUrl();
  const subject =
    env.VAPID_SUBJECT?.trim() || (site.startsWith("https://") ? site : "mailto:notifications@ghusn.store");
  return { publicKey, privateKey, subject };
}

// ---------- التفضيلات ----------

export async function getPushPrefs(userId: string): Promise<PushPrefs> {
  const p = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (!p)
    return {
      pushTypes: DEFAULT_PUSH_TYPES,
      quietStart: DEFAULT_QUIET.start,
      quietEnd: DEFAULT_QUIET.end,
      urgentInQuiet: true,
    };
  return { pushTypes: p.pushTypes, quietStart: p.quietStart, quietEnd: p.quietEnd, urgentInQuiet: p.urgentInQuiet };
}

export const prefsSchema = z
  .object({
    pushTypes: z.array(z.enum(NOTIFICATION_TYPES)).max(NOTIFICATION_TYPES.length),
    quietEnabled: z.boolean(),
    quietStart: z.string().refine(isTimeOfDay, "الوقت غير صحيح"),
    quietEnd: z.string().refine(isTimeOfDay, "الوقت غير صحيح"),
    urgentInQuiet: z.boolean(),
  })
  .refine((v) => !v.quietEnabled || v.quietStart !== v.quietEnd, "بداية الهدوء ونهايته متساويتان");

export async function savePushPrefs(userId: string, input: z.infer<typeof prefsSchema>): Promise<void> {
  const data = {
    pushTypes: [...new Set(input.pushTypes)],
    quietStart: input.quietEnabled ? input.quietStart : null,
    quietEnd: input.quietEnabled ? input.quietEnd : null,
    urgentInQuiet: input.urgentInQuiet,
  };
  await prisma.notificationPreference.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

// ---------- الأجهزة ----------

export const subscriptionSchema = z.object({
  endpoint: z.url().startsWith("https://").max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
  label: z.string().trim().min(1).max(60),
});

/** نفس الجهاز لمستخدمة أخرى (تبديل الحساب) ← ينتقل لها. */
export async function saveSubscription(userId: string, s: z.infer<typeof subscriptionSchema>): Promise<void> {
  const data = { userId, p256dh: s.keys.p256dh, auth: s.keys.auth, label: s.label, lastUsedAt: new Date() };
  await prisma.pushSubscription.upsert({
    where: { endpoint: s.endpoint },
    create: { endpoint: s.endpoint, ...data },
    update: data,
  });
}

export async function removeSubscription(userId: string, by: { id?: string; endpoint?: string }): Promise<void> {
  await prisma.pushSubscription.deleteMany({
    where: { userId, ...(by.id ? { id: by.id } : { endpoint: by.endpoint }) },
  });
}

export const listSubscriptions = (userId: string) =>
  prisma.pushSubscription.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, endpoint: true, label: true, createdAt: true, lastUsedAt: true },
  });

// ---------- الإرسال ----------

interface Payload {
  title: string;
  body: string;
  href: string;
  tag: string;
  urgent: boolean;
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

/** يرسل لجهاز واحد؛ الجهاز الملغى (404/410) يُحذف. يعيد هل وصل. */
async function sendTo(cfg: PushConfig, sub: Sub, payload: Payload): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      {
        vapidDetails: cfg,
        TTL: 60 * 60 * 6,
        urgency: payload.urgent ? "high" : "normal",
        timeout: 10_000,
      },
    );
    await prisma.pushSubscription.update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    return true;
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) await prisma.pushSubscription.deleteMany({ where: { id: sub.id } });
    else console.error("[push]", status ?? (e as Error).message);
    return false;
  }
}

/** أقدم من هذا لا يُرسل للجوال — فات أوانه (يبقى في الجرس). */
const PUSH_MAX_AGE_MS = 15 * 60_000;

/** يرسل الإشعارات المنتظرة لأجهزة مستلميها حسب تفضيلاتهم وساعات الهدوء. يعيد عدد الأجهزة التي وصلها. */
export async function deliverPendingPushes(now = new Date()): Promise<number> {
  const cfg = pushConfig();
  // بلا مفاتيح: تُعلَّم مُرسلة حتى لا تتراكم
  const claimed = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "Notification" SET "pushedAt" = ${now}
     WHERE "id" IN (
       SELECT "id" FROM "Notification"
        WHERE "pushedAt" IS NULL
        ORDER BY "createdAt"
        LIMIT 50
        FOR UPDATE SKIP LOCKED)
    RETURNING "id"`;
  if (!cfg || claimed.length === 0) return 0;
  const notifications = await prisma.notification.findMany({
    where: { id: { in: claimed.map((c) => c.id) }, createdAt: { gte: new Date(now.getTime() - PUSH_MAX_AGE_MS) } },
    include: {
      recipients: {
        where: { readAt: null },
        select: {
          user: {
            select: {
              id: true,
              banned: true,
              notificationPrefs: true,
              pushSubscriptions: { select: { id: true, endpoint: true, p256dh: true, auth: true } },
            },
          },
        },
      },
    },
  });
  // لكل مستخدمة: ما يحق لها على الجوال الآن، ثم تجميع دفعة الطلبات (3 أو أكثر = إشعار واحد)
  type Sendable = { type: NotificationTypeName; payload: Payload };
  const perUser = new Map<string, { subs: Sub[]; items: Sendable[] }>();
  for (const n of notifications) {
    const payload: Payload = { title: n.title, body: n.body, href: n.href, tag: n.id, urgent: n.priority === "URGENT" };
    for (const { user } of n.recipients) {
      if (user.banned || user.pushSubscriptions.length === 0) continue;
      const p = user.notificationPrefs;
      const prefs: PushPrefs = p
        ? { pushTypes: p.pushTypes, quietStart: p.quietStart, quietEnd: p.quietEnd, urgentInQuiet: p.urgentInQuiet }
        : {
            pushTypes: DEFAULT_PUSH_TYPES,
            quietStart: DEFAULT_QUIET.start,
            quietEnd: DEFAULT_QUIET.end,
            urgentInQuiet: true,
          };
      const type = n.type as NotificationTypeName;
      if (!shouldPush({ type, priority: n.priority }, prefs, now)) continue;
      const entry = perUser.get(user.id) ?? { subs: user.pushSubscriptions, items: [] };
      entry.items.push({ type, payload });
      perUser.set(user.id, entry);
    }
  }
  let sent = 0;
  for (const { subs, items } of perUser.values()) {
    const { single, burst } = groupForPush(items);
    const payloads = single.map((i) => i.payload);
    if (burst.length) {
      payloads.push({
        title: `${burst.length} طلبات جديدة`,
        body: burst.map((b) => b.payload.title.replace(/^طلب جديد · /, "")).join("، "),
        href: "/admin/orders",
        tag: `orders-${now.getTime()}`,
        urgent: true,
      });
    }
    for (const payload of payloads) {
      const results = await Promise.all(subs.map((sub) => sendTo(cfg, sub, payload)));
      sent += results.filter(Boolean).length;
    }
  }
  return sent;
}

/** بعد نجاح معاملة أنشأت إشعاراً: الإرسال بعد الرد على الطلب (لا يؤخّر العميل). */
export function kickPushDelivery(): void {
  const run = () => deliverPendingPushes().catch((e) => console.error("[push] delivery failed", e));
  try {
    after(run);
  } catch {
    // خارج طلب (سكربت، اختبار): مباشرة
    void run();
  }
}

/** «إرسال إشعار تجريبي» من التفضيلات — لأجهزة المستخدمة الحالية فقط. */
export async function sendTestPush(userId: string): Promise<{ devices: number; sent: number }> {
  const cfg = pushConfig();
  const subs = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (!cfg) return { devices: subs.length, sent: 0 };
  const payload: Payload = {
    title: "إشعار تجريبي من غصن",
    body: "وصلت الإشعارات لهذا الجهاز بنجاح.",
    href: "/admin/notifications/settings",
    tag: `test-${Date.now()}`,
    urgent: false,
  };
  const results = await Promise.all(subs.map((s) => sendTo(cfg, s, payload)));
  return { devices: subs.length, sent: results.filter(Boolean).length };
}
