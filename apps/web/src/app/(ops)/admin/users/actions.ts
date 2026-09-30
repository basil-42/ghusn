"use server";

import { internalEmailForPhone, normalizePhone } from "@ghusn/core";
import { prisma } from "@ghusn/db";
import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { ROLE_NAMES } from "@/lib/auth/permissions";
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

export async function createUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission({ user: ["create"] });
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
  const { error } = await requireOtherUser(id);
  if (error) return;

  const h = await headers();
  if (banned) {
    // الإيقاف ينهي جلسات المستخدم فوراً
    await auth.api.banUser({ body: { userId: id, banReason: "أوقفه المالك" }, headers: h });
  } else {
    await auth.api.unbanUser({ body: { userId: id }, headers: h });
  }
  revalidatePath("/admin/users");
}

export async function setRole(formData: FormData): Promise<void> {
  const id = userId.parse(formData.get("userId"));
  const newRole = role.parse(formData.get("role")) as "OWNER" | "MANAGER" | "STAFF";
  const { error } = await requireOtherUser(id);
  if (error) return;

  await auth.api.setRole({ body: { userId: id, role: newRole }, headers: await headers() });
  revalidatePath("/admin/users");
}

export async function resetPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission({ user: ["set-password"] });
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
  return { success: "تم تغيير كلمة السر." };
}
