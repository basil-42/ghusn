import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";
import { roleCan } from "./permissions";

/**
 * طبقة الوصول (DAL): الفحص الحقيقي للجلسة من قاعدة البيانات.
 * proxy.ts يفحص الكوكي فقط (فحص متفائل)؛ كل صفحة وعملية محمية تستدعي هذه الدوال.
 */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requirePermission(permissions: Parameters<typeof roleCan>[1]) {
  const session = await requireSession();
  // بلا صلاحية ← لوحة الإدارة الرئيسية (لا نكشف وجود الصفحة)
  if (!roleCan(session.user.role, permissions)) redirect("/admin");
  return session;
}
