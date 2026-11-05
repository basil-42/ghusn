"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { ReturnError, decideReturnRequest } from "@/lib/returns";

export type DecideState = { error?: string; success?: string };

/** قرار المالك على مرتجع بعد المدة (D-150): اعتماد، أو رفض بسبب اختياري يصل للموظفة. */
export async function decideReturnRequestAction(_prev: DecideState, formData: FormData): Promise<DecideState> {
  const session = await requirePermission({ saleReturn: ["approveLate"] });
  const parsed = z
    .object({
      id: z.string().min(1).max(40),
      decision: z.enum(["approve", "reject"]),
      note: z
        .string()
        .trim()
        .max(200)
        .transform((v) => v || null),
    })
    .safeParse({
      id: formData.get("id"),
      decision: formData.get("decision"),
      note: formData.get("note") ?? "",
    });
  if (!parsed.success) return { error: "بيانات غير صحيحة." };
  try {
    await decideReturnRequest(
      parsed.data.id,
      { approve: parsed.data.decision === "approve", note: parsed.data.note },
      session.user,
    );
  } catch (e) {
    if (e instanceof ReturnError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/return-requests");
  revalidatePath("/admin");
  return { success: parsed.data.decision === "approve" ? "اعتُمد — وصل الإشعار للموظفة." : "رُفض الطلب." };
}
