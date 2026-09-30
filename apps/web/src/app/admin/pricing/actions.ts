"use server";

import { dec, toLatinDigits } from "@ghusn/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { PricingError, approvePrices, setProductMargins } from "@/lib/pricing";

export type FormState = { error?: string; success?: string };

const clean = (v: string) => toLatinDigits(v).replace(/[,\s٬]/g, "");

function fail(error: unknown): FormState {
  if (error instanceof PricingError) return { error: error.message };
  throw error;
}

const priceItem = z.object({
  variantId: z.string().min(1),
  priceSdg: z
    .string()
    .transform(clean)
    .refine((v) => /^[1-9]\d{0,11}$/.test(v), "السعر بالجنيه رقم صحيح أكبر من صفر"),
  note: z
    .string()
    .trim()
    .max(200)
    .nullish()
    .transform((v) => v || null),
});

export async function approvePricesAction(_prev: FormState, items: unknown): Promise<FormState> {
  const session = await requirePermission({ price: ["approve"] });
  const parsed = z.array(priceItem).min(1, "اختاري صنفاً واحداً على الأقل").max(500).safeParse(items);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  let changed: number;
  try {
    changed = await approvePrices(parsed.data, session.user.id);
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/admin/pricing");
  revalidatePath("/admin/products", "layout");
  revalidatePath("/admin/stock");
  revalidatePath("/admin");
  return { success: changed ? `تم اعتماد ${changed} سعر.` : "لا تغيير — الأسعار كما هي." };
}

// «40» أو «40%» ← 0.4؛ فارغ ← هامش القسم
const marginField = z
  .string()
  .optional()
  .transform((v, ctx) => {
    const s = toLatinDigits(v ?? "").replace(/[%٪\s]/g, "");
    if (!s) return null;
    if (!/^\d{1,2}(\.\d{1,2})?$/.test(s)) {
      ctx.addIssue({ code: "custom", message: "الهامش نسبة بين 0 و99" });
      return null;
    }
    return dec(s).div(100).toFixed(4);
  });

export async function setMarginsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission({ margin: ["update"] });
  const parsed = z
    .object({ productId: z.string().min(1), targetMargin: marginField, minMargin: marginField })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { productId, ...margins } = parsed.data;
  try {
    await setProductMargins(productId, margins);
  } catch (error) {
    return fail(error);
  }
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/pricing");
  return { success: "تم حفظ الهامش." };
}
