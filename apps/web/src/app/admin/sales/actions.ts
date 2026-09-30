"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { markSaleReviewed } from "@/lib/sales";

export async function markReviewedAction(formData: FormData): Promise<void> {
  const session = await requirePermission({ pos: ["approve"] });
  await markSaleReviewed(String(formData.get("saleId") ?? ""), session.user.id);
  revalidatePath("/admin/sales");
  revalidatePath("/admin");
}
