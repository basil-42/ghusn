import { deviceLabel, maskPhone } from "@ghusn/core";
import { prisma, type Prisma } from "@ghusn/db";
import { headers } from "next/headers";
import { notify } from "./notifications";
import { kickPushDelivery } from "./push";
import { clientIp } from "./rate-limit";

export { changesLine, diffFields } from "@ghusn/core";

/**
 * تسجيل ما لا تسجّله جداوله أصلاً في سجل التدقيق (D-114): الإعدادات، المستخدمون، هوامش الأقسام،
 * تعديل المنتجات وأرشفتها، وتسجيل الدخول. لا يُعدَّل ولا يُحذف. فشل التسجيل لا يُفشل العملية نفسها.
 */

export type AuditType =
  | "SETTINGS_UPDATED"
  | "USER_CREATED"
  | "USER_ROLE"
  | "USER_BANNED"
  | "USER_UNBANNED"
  | "USER_PASSWORD"
  | "CATEGORY_UPDATED"
  | "PRODUCT_UPDATED"
  | "PRODUCT_ARCHIVED"
  | "CUSTOMER_UPDATED"
  | "LOGIN"
  | "LOGIN_FAILED";

/** الأنواع الحساسة دائماً (تظهر في «تستحق انتباهك»). */
const SENSITIVE: ReadonlySet<AuditType> = new Set([
  "SETTINGS_UPDATED",
  "USER_CREATED",
  "USER_ROLE",
  "USER_BANNED",
  "USER_UNBANNED",
  "USER_PASSWORD",
  "LOGIN_FAILED",
]);

export interface AuditInput {
  type: AuditType;
  actorId: string | null;
  title: string;
  detail?: string | null;
  href?: string | null;
  changes?: { field: string; before: unknown; after: unknown }[] | null;
  sensitive?: boolean;
}

async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    return { ip: clientIp(h), userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
  } catch {
    // خارج طلب (مهمة مجدولة، سكربت)
    return { ip: null, userAgent: null };
  }
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const meta = await requestMeta();
    await prisma.auditEvent.create({
      data: {
        type: input.type,
        actorId: input.actorId,
        title: input.title.slice(0, 200),
        detail: input.detail?.slice(0, 500) ?? null,
        href: input.href ?? null,
        changes: input.changes?.length ? (input.changes as Prisma.InputJsonValue) : undefined,
        sensitive: input.sensitive ?? SENSITIVE.has(input.type),
        ...meta,
      },
    });
  } catch (e) {
    console.error("[audit] failed to record", input.type, e);
  }
}

// ---------- تسجيل الدخول ----------

/** 3 محاولات فاشلة لنفس الرقم خلال 15 دقيقة ← إشعار فوري للمالك (مرة في الساعة لكل رقم). */
const FAILED_ALERT = { count: 3, windowMs: 15 * 60_000 };

export async function recordLogin(phoneNumber: string, ok: boolean, reason?: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { phoneNumber }, select: { id: true, name: true } });
  const meta = await requestMeta();
  const device = deviceLabel(meta.userAgent);
  if (ok) {
    await recordAudit({ type: "LOGIN", actorId: user?.id ?? null, title: "تسجيل دخول", detail: device });
    return;
  }
  await recordAudit({
    type: "LOGIN_FAILED",
    actorId: user?.id ?? null,
    title: user ? `محاولة دخول فاشلة · ${user.name}` : "محاولة دخول فاشلة برقم غير مسجّل",
    detail: [reason, user ? null : maskPhone(phoneNumber), device, meta.ip].filter(Boolean).join(" · "),
  });
  const since = new Date(Date.now() - FAILED_ALERT.windowMs);
  const recent = await prisma.auditEvent.count({
    where: {
      type: "LOGIN_FAILED",
      createdAt: { gte: since },
      ...(user ? { actorId: user.id } : { actorId: null, detail: { contains: maskPhone(phoneNumber) } }),
    },
  });
  if (recent < FAILED_ALERT.count) return;
  const hour = new Date().toISOString().slice(0, 13);
  const id = await notify(prisma, {
    type: "SECURITY_ALERT",
    priority: "IMPORTANT",
    title: "محاولات دخول فاشلة متكررة",
    body: `${user ? user.name : `رقم غير مسجّل ${maskPhone(phoneNumber)}`} · ${recent} محاولات خلال 15 دقيقة${meta.ip ? ` · ${meta.ip}` : ""}`,
    href: "/admin/audit?f=attention",
    dedupeKey: `LOGIN_FAILED:${phoneNumber}:${hour}`,
    audience: { audit: ["read"] },
  });
  if (id) kickPushDelivery();
}
