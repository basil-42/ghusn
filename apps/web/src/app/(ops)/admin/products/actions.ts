"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { changesLine, diffFields, recordAudit } from "@/lib/audit";
import {
  CatalogError,
  PRODUCT_FIELD_LABELS,
  archiveProduct,
  createProduct,
  productAuditSnapshot,
  productInput,
  updateProduct,
} from "@/lib/catalog";
import { requirePermission } from "@/lib/auth/session";

export type ProductFormState = { error?: string; success?: string };

function firstIssue(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? "تحقّقي من البيانات.";
}

export async function saveProduct(
  productId: string | null,
  _prev: ProductFormState,
  payload: unknown,
): Promise<ProductFormState> {
  const session = await requirePermission({ product: [productId ? "update" : "create"] });
  const parsed = productInput.safeParse(payload);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  let id = productId;
  try {
    if (id) {
      const before = await productAuditSnapshot(id);
      await updateProduct(id, parsed.data);
      const after = await productAuditSnapshot(id);
      const changes = before && after ? diffFields(before, after, PRODUCT_FIELD_LABELS) : [];
      if (changes.length) {
        await recordAudit({
          type: "PRODUCT_UPDATED",
          actorId: session.user.id,
          title: `تعديل منتج · ${String(after?.nameAr ?? "")}`,
          detail: changesLine(changes),
          href: `/admin/products/${id}`,
          changes,
          // تغيير الباركود قد يربك المبيعات والجرد
          sensitive: changes.some((c) => c.field === PRODUCT_FIELD_LABELS.variants),
        });
      }
    } else id = await createProduct(parsed.data, session.user.id);
  } catch (error) {
    if (error instanceof CatalogError) return { error: error.message };
    throw error;
  }

  revalidatePath("/admin/products");
  if (!productId) redirect(`/admin/products/${id}?created=1`);
  revalidatePath(`/admin/products/${id}`);
  return { success: "تم حفظ التعديلات." };
}

export async function archiveProductAction(formData: FormData): Promise<void> {
  const session = await requirePermission({ product: ["delete"] });
  const id = String(formData.get("productId") ?? "");
  if (id) {
    const snap = await productAuditSnapshot(id);
    await archiveProduct(id);
    if (snap) {
      await recordAudit({
        type: "PRODUCT_ARCHIVED",
        actorId: session.user.id,
        title: `أرشفة منتج · ${String(snap.nameAr)}`,
        detail: String(snap.category ?? ""),
        href: `/admin/products/${id}`,
      });
    }
  }
  revalidatePath("/admin/products");
  redirect("/admin/products?archived=1");
}
