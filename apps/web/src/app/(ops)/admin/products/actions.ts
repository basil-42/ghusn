"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CatalogError, archiveProduct, createProduct, productInput, updateProduct } from "@/lib/catalog";
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
    if (id) await updateProduct(id, parsed.data);
    else id = await createProduct(parsed.data, session.user.id);
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
  await requirePermission({ product: ["delete"] });
  const id = String(formData.get("productId") ?? "");
  if (id) await archiveProduct(id);
  revalidatePath("/admin/products");
  redirect("/admin/products?archived=1");
}
