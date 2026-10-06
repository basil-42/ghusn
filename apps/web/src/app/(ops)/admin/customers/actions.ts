"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { CustomerError, addCustomerNote, deleteCustomerNote, renameCustomer } from "@/lib/customers";

export type FormState = { error?: string; success?: string; at?: number };

function refresh(id: string) {
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${id}`);
}

async function guard<T>(fn: () => Promise<T>): Promise<FormState | T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof CustomerError) return { error: e.message };
    throw e;
  }
}

export async function renameCustomerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ customer: ["update"] });
  const parsed = z
    .object({ customerId: z.string().min(1), name: z.string().trim().max(80, "الاسم طويل جداً.") })
    .safeParse({ customerId: formData.get("customerId"), name: formData.get("name") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "تحققي من الاسم." };
  return guard(async () => {
    await renameCustomer(parsed.data.customerId, parsed.data.name, session.user.id);
    refresh(parsed.data.customerId);
    return { success: "حُفظ الاسم.", at: Date.now() };
  });
}

export async function addNoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission({ customer: ["update"] });
  const parsed = z
    .object({
      customerId: z.string().min(1),
      body: z.string().trim().min(2, "اكتبي الملاحظة.").max(500, "الملاحظة طويلة — حتى 500 حرف."),
    })
    .safeParse({ customerId: formData.get("customerId"), body: formData.get("body") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "تحققي من الملاحظة." };
  return guard(async () => {
    await addCustomerNote(parsed.data.customerId, parsed.data.body, session.user.id);
    refresh(parsed.data.customerId);
    return { success: "حُفظت الملاحظة.", at: Date.now() };
  });
}

export async function deleteNoteAction(formData: FormData): Promise<void> {
  const session = await requirePermission({ customer: ["update"] });
  const noteId = String(formData.get("noteId") ?? "");
  if (!noteId) return;
  const customerId = await deleteCustomerNote(noteId, {
    id: session.user.id,
    canModerate: roleCan(session.user.role, { customer: ["value"] }),
  }).catch((e) => {
    if (e instanceof CustomerError) return null;
    throw e;
  });
  if (customerId) refresh(customerId);
}
