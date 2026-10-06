"use server";

import { internalEmailForPhone, normalizePhone } from "@ghusn/core";
import { prisma } from "@ghusn/db";
import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { auth } from "@/lib/auth/auth";
import { ROLE_LABELS, ROLE_NAMES, isRoleName } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";

export type ActionState = { error?: string; success?: string };

const PASSWORD_MIN = 8;
const password = z.string().min(PASSWORD_MIN, `كلمة السر ${PASSWORD_MIN} أحرف على الأقل`);
const role = z.enum(ROLE_NAMES as [string, ...string[]], { message: "اختاري الدور" });

const createSchema = z.object({
  name: z.string().trim().min(2, "اكتبي الاسم"),
  phone: z.string().trim().min(1, "اكتبي رقم الهاتف"),
  role,
  password,
});

function apiErrorMessage(error: unknown): string {
  if (error instanceof APIError) {
    if (error.status === "FORBIDDEN" || error.status === "UNAUTHORIZED") return "ليست لديك صلاحية لهذه العملية.";
    return "تعذّر تنفيذ العملية. حاولي مرة أخرى.";
  }
  throw error;
}

const roleLabel = (r: unknown) => (isRoleName(r) ? ROLE_LABELS[r] : String(r ?? "—"));
const userName = async (id: string) =>
  (await prisma.user.findUnique({ where: { id }, select: { name: true, role: true } })) ?? { name: "—", role: null };

export async function createUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission({ user: ["create"] });
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const phoneNumber = normalizePhone(parsed.data.phone);
  if (!phoneNumber) return { error: "رقم الهاتف غير صحيح. مثال: 0912345678" };
  if (await prisma.user.findUnique({ where: { phoneNumber } })) {
    return { error: "يوجد مستخدم بهذا الرقم." };
  }

  try {
    await auth.api.createUser({
      body: {
        name: parsed.data.name,
        email: internalEmailForPhone(phoneNumber),
        password: parsed.data.password,
        role: parsed.data.role as "OWNER" | "MANAGER" | "STAFF",
        data: { phoneNumber },
      },
      headers: await headers(),
    });
  } catch (error) {
    return { error: apiErrorMessage(error) };
  }

  await recordAudit({
    type: "USER_CREATED",
    actorId: session.user.id,
    title: `إضافة مستخدم · ${parsed.data.name}`,
    detail: `${roleLabel(parsed.data.role)} · ${phoneNumber}`,
    href: "/admin/users",
  });
  revalidatePath("/admin/users");
  return { success: `تمت إضافة ${parsed.data.name}.` };
}

const userId = z.string().min(1);

/** لا يستطيع المالك إيقاف حسابه أو تغيير دوره — حتى لا يُغلق النظام على نفسه. */
async function requireOtherUser(targetId: string) {
  const session = await requirePermission({ user: ["ban", "set-role"] });
  if (session.user.id === targetId) return { session, error: "لا يمكنك تعديل حسابك من هنا." };
  return { session, error: undefined };
}

export async function setBanned(formData: FormData): Promise<void> {
  const id = userId.parse(formData.get("userId"));
  const banned = formData.get("banned") === "true";
  const { session, error } = await requireOtherUser(id);
  if (error) return;

  const target = await userName(id);
  const h = await headers();
  if (banned) {
    // الإيقاف ينهي جلسات المستخدم فوراً
    await auth.api.banUser({ body: { userId: id, banReason: "أوقفه المالك" }, headers: h });
  } else {
    await auth.api.unbanUser({ body: { userId: id }, headers: h });
  }
  await recordAudit({
    type: banned ? "USER_BANNED" : "USER_UNBANNED",
    actorId: session.user.id,
    title: `${banned ? "إيقاف" : "إعادة تفعيل"} حساب · ${target.name}`,
    detail: roleLabel(target.role),
    href: "/admin/users",
  });
  revalidatePath("/admin/users");
}

export async function setRole(formData: FormData): Promise<void> {
  const id = userId.parse(formData.get("userId"));
  const newRole = role.parse(formData.get("role")) as "OWNER" | "MANAGER" | "STAFF";
  const { session, error } = await requireOtherUser(id);
  if (error) return;

  const target = await userName(id);
  await auth.api.setRole({ body: { userId: id, role: newRole }, headers: await headers() });
  if (target.role !== newRole) {
    await recordAudit({
      type: "USER_ROLE",
      actorId: session.user.id,
      title: `تغيير الدور · ${target.name}`,
      detail: `${roleLabel(target.role)} ← ${roleLabel(newRole)}`,
      href: "/admin/users",
      changes: [{ field: "الدور", before: roleLabel(target.role), after: roleLabel(newRole) }],
    });
  }
  revalidatePath("/admin/users");
}

export async function resetPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission({ user: ["set-password"] });
  const id = userId.safeParse(formData.get("userId"));
  const newPassword = password.safeParse(formData.get("password"));
  if (!id.success) return { error: "مستخدم غير معروف." };
  if (!newPassword.success) return { error: newPassword.error.issues[0]?.message };

  try {
    const h = await headers();
    await auth.api.setUserPassword({ body: { userId: id.data, newPassword: newPassword.data }, headers: h });
    // كلمة سر جديدة ← إنهاء الجلسات القديمة على كل الأجهزة
    await auth.api.revokeUserSessions({ body: { userId: id.data }, headers: h });
  } catch (error) {
    return { error: apiErrorMessage(error) };
  }
  const target = await userName(id.data);
  await recordAudit({
    type: "USER_PASSWORD",
    actorId: session.user.id,
    title: `تغيير كلمة السر · ${target.name}`,
    detail: "أُنهيت جلساته على كل الأجهزة",
    href: "/admin/users",
  });
  return { success: "تم تغيير كلمة السر." };
}
