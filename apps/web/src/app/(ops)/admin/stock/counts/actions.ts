"use server";

import { toLatinDigits } from "@ghusn/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import {
  CountError,
  approveCount,
  cancelCount,
  findCountLine,
  markMissing,
  requestRecount,
  saveCountLine,
  searchCountLines,
  startCount,
  submitCount,
  type CounterLine,
} from "@/lib/stock-counts";

export type FormState = { error?: string; success?: string };
export type LineResult = { line?: CounterLine; lines?: CounterLine[]; error?: string };

const actor = (s: { user: { id: string; role?: string | null; name: string } }) => ({
  id: s.user.id,
  role: s.user.role,
  name: s.user.name,
});
const clean = (v: string) =>
  toLatinDigits(v)
    .replace(/[,\s٬]/g, "")
    .replace("٫", ".");

function refresh(countId?: string) {
  revalidatePath("/admin/stock");
  revalidatePath("/admin/stock/counts");
  if (countId) revalidatePath(`/admin/stock/counts/${countId}`);
}

export async function startCountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ stock: ["approve"] });
  const parsed = z
    .object({ scope: z.enum(["FULL", "CATEGORY", "QUICK"]), categoryId: z.string().optional() })
    .safeParse({ scope: formData.get("scope"), categoryId: formData.get("categoryId") || undefined });
  if (!parsed.success) return { error: "اختاري نوع الجرد." };
  let id: string;
  try {
    id = await startCount({ scope: parsed.data.scope, categoryId: parsed.data.categoryId ?? null }, actor(session));
  } catch (e) {
    if (e instanceof CountError) return { error: e.message };
    throw e;
  }
  refresh();
  redirect(`/admin/stock/counts/${id}/count`);
}

/** مسح باركود/SKU أو بحث بالاسم داخل الجرد. */
export async function lookupLineAction(countId: string, query: string): Promise<LineResult> {
  await requirePermission({ stock: ["adjust"] });
  const q = query.trim().slice(0, 80);
  if (!q) return {};
  const exact = await findCountLine(countId, q);
  if (exact) return { line: exact };
  const lines = q.length >= 2 ? await searchCountLines(countId, q) : [];
  if (lines.length === 1) return { line: lines[0] };
  if (lines.length) return { lines };
  return { error: "الصنف ليس ضمن هذا الجرد." };
}

export async function saveLineAction(countId: string, lineId: string, qty: string): Promise<LineResult> {
  const session = await requirePermission({ stock: ["adjust"] });
  const v = clean(qty);
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(v)) return { error: "اكتبي العدد رقماً." };
  try {
    const line = await saveCountLine(lineId, v, actor(session));
    refresh(countId);
    return { line };
  } catch (e) {
    if (e instanceof CountError) return { error: e.message };
    throw e;
  }
}

export async function markMissingAction(countId: string, lineIds: string[] | "all"): Promise<FormState> {
  const session = await requirePermission({ stock: ["adjust"] });
  try {
    const n = await markMissing(countId, lineIds, actor(session));
    refresh(countId);
    return { success: n === 1 ? "سُجّل صنف «غير موجود»." : `سُجّلت ${n} أصناف «غير موجود».` };
  } catch (e) {
    if (e instanceof CountError) return { error: e.message };
    throw e;
  }
}

export async function submitCountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ stock: ["adjust"] });
  const id = String(formData.get("id") ?? "");
  try {
    await submitCount(id, actor(session));
  } catch (e) {
    if (e instanceof CountError) return { error: e.message };
    throw e;
  }
  refresh(id);
  return { success: "أُرسل الجرد للمراجعة. شكراً!" };
}

export async function recountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ stock: ["approve"] });
  try {
    await requestRecount(String(formData.get("lineId") ?? ""), actor(session));
  } catch (e) {
    if (e instanceof CountError) return { error: e.message };
    throw e;
  }
  refresh(String(formData.get("countId") ?? ""));
  return { success: "طُلبت إعادة العد." };
}

export async function approveCountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ stock: ["approve"] });
  const id = String(formData.get("id") ?? "");
  const costs: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("cost:") || typeof v !== "string" || !v.trim()) continue;
    const c = clean(v);
    if (!/^\d{1,7}(\.\d{1,6})?$/.test(c)) return { error: "تكلفة الوحدة بالدولار رقم (حتى 6 خانات عشرية)." };
    costs[k.slice(5)] = c;
  }
  try {
    await approveCount(id, actor(session), costs);
  } catch (e) {
    if (e instanceof CountError) return { error: e.message };
    throw e;
  }
  refresh(id);
  revalidatePath("/admin/stock/adjustments");
  revalidatePath("/admin/reports");
  return { success: "اعتُمد الجرد وتعدّلت الأرصدة." };
}

export async function cancelCountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ stock: ["approve"] });
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) return { error: "اكتبي سبب الإلغاء." };
  try {
    await cancelCount(id, reason.slice(0, 200), actor(session));
  } catch (e) {
    if (e instanceof CountError) return { error: e.message };
    throw e;
  }
  refresh(id);
  return { success: "أُلغي الجرد." };
}
