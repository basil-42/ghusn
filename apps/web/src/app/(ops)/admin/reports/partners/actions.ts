"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/session";
import { PdfUnavailable } from "@/lib/pdf";
import { PartnerError, issueMonth, issueStatement, savePartner, setPartnerActive } from "@/lib/partners";

export type FormState = { error?: string; success?: string };

const MONTH = z.string().regex(/^\d{4}-\d{2}$/, "الشهر غير صحيح");
const PATH = "/admin/reports/partners";

function failure(e: unknown): FormState {
  if (e instanceof PartnerError || e instanceof PdfUnavailable) return { error: e.message };
  throw e;
}

export async function savePartnerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ partner: ["manage"] });
  const parsed = z
    .object({
      id: z
        .string()
        .max(40)
        .optional()
        .transform((v) => v || undefined),
      name: z.string().trim().min(2, "الاسم مطلوب").max(60),
      phone: z.string().trim().min(6, "رقم الهاتف مطلوب").max(25),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    await savePartner(parsed.data);
  } catch (e) {
    return failure(e);
  }
  await recordAudit({
    type: "PARTNER_UPDATED",
    actorId: session.user.id,
    title: parsed.data.id ? `تعديل شريك: ${parsed.data.name}` : `إضافة شريك: ${parsed.data.name}`,
  });
  revalidatePath(PATH);
  return { success: "تم الحفظ." };
}

export async function togglePartnerAction(formData: FormData): Promise<void> {
  const session = await requirePermission({ partner: ["manage"] });
  const id = z.string().max(40).parse(formData.get("id"));
  const active = formData.get("active") === "1";
  try {
    await setPartnerActive(id, active);
  } catch (e) {
    if (e instanceof PartnerError) return;
    throw e;
  }
  await recordAudit({ type: "PARTNER_UPDATED", actorId: session.user.id, title: active ? "تفعيل شريك" : "إيقاف شريك" });
  revalidatePath(PATH);
}

export async function issueStatementAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ partner: ["manage"] });
  const parsed = z
    .object({ partnerId: z.string().max(40).optional(), month: MONTH })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { partnerId, month } = parsed.data;
  try {
    const issued = partnerId
      ? [await issueStatement(partnerId, month, session.user.id)]
      : await issueMonth(month, session.user.id);
    await recordAudit({
      type: "STATEMENT_ISSUED",
      actorId: session.user.id,
      title: `إصدار ${issued.length === 1 ? "كشف شريك" : `${issued.length} كشوف شركاء`}`,
      detail: month,
    });
  } catch (e) {
    return failure(e);
  }
  revalidatePath(PATH);
  return { success: "صدر الكشف." };
}
