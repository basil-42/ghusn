"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { ImageError, addProductImage, deleteProductImage, makeMainImage } from "@/lib/product-images";

export async function uploadProductImage(productId: string, formData: FormData): Promise<{ error?: string }> {
  await requirePermission({ product: ["update"] });
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "لم تُرفع صورة." };
  try {
    await addProductImage(productId, file);
  } catch (error) {
    if (error instanceof ImageError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/products");
  return {};
}

export async function deleteProductImageAction(formData: FormData): Promise<void> {
  await requirePermission({ product: ["update"] });
  const productId = String(formData.get("productId") ?? "");
  await deleteProductImage(productId, String(formData.get("imageId") ?? ""));
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/products");
}

export async function makeMainImageAction(formData: FormData): Promise<void> {
  await requirePermission({ product: ["update"] });
  const productId = String(formData.get("productId") ?? "");
  await makeMainImage(productId, String(formData.get("imageId") ?? ""));
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/products");
}
