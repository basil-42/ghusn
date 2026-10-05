"use server";

import { dec, effectiveRate, isSuspiciousRateChange, toLatinDigits } from "@ghusn/core";
import { prisma } from "@ghusn/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MANUAL_SOURCES } from "@/lib/exchange-rates";
import { requirePermission } from "@/lib/auth/session";
import { notifyPriceSuggestions } from "@/lib/notification-sweeps";
import { kickPushDelivery } from "@/lib/push";

export type RateFormState = {
  error?: string;
  success?: string;
  /** تغيّر كبير عن السعر الحالي — يحتاج تأكيداً صريحاً. */
  needsConfirm?: boolean;
  values?: { currencyCode: string; unitsPerUsd: string; source: string; note: string };
};

// NUMERIC(18,6): حتى 12 رقماً قبل الفاصلة و6 بعدها
const RATE_PATTERN = /^\d{1,12}(\.\d{1,6})?$/;

const schema = z.object({
  currencyCode: z.string().min(3).max(3),
  unitsPerUsd: z
    .string()
    .transform((v) =>
      toLatinDigits(v)
        .replace(/[,\s٬]/g, "")
        .replace("٫", "."),
    )
    .refine((v) => RATE_PATTERN.test(v), "اكتبي السعر أرقاماً فقط (حتى 6 خانات عشرية)")
    // Zod يكمل الفحوص بعد فشل الأول — لذلك نتحقق من الصيغة قبل تمرير القيمة إلى Decimal
    .refine((v) => !RATE_PATTERN.test(v) || dec(v).gt(0), "السعر يجب أن يكون أكبر من صفر"),
  source: z.enum(MANUAL_SOURCES, { message: "اختاري مصدر السعر" }),
  note: z.string().trim().max(200, "الملاحظة أطول من 200 حرف").optional().default(""),
  /** الرقم الذي أكّدته المستخدمة — التأكيد يخص هذا الرقم فقط، لا أي رقم يُكتب بعده. */
  confirmedValue: z.string().optional(),
});

export async function createExchangeRate(_prev: RateFormState, formData: FormData): Promise<RateFormState> {
  const session = await requirePermission({ exchangeRate: ["update"] });
  const raw = Object.fromEntries(formData);
  const values = {
    currencyCode: String(raw.currencyCode ?? ""),
    unitsPerUsd: String(raw.unitsPerUsd ?? ""),
    source: String(raw.source ?? ""),
    note: String(raw.note ?? ""),
  };

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, values };
  const { currencyCode, unitsPerUsd, source, note, confirmedValue } = parsed.data;

  const currency = await prisma.currency.findUnique({ where: { code: currencyCode } });
  if (!currency || !currency.isActive || currency.isBase) return { error: "عملة غير متاحة.", values };

  const now = new Date();
  const recent = await prisma.exchangeRate.findMany({
    where: { currencyCode, effectiveAt: { lte: now } },
    orderBy: { effectiveAt: "desc" },
    take: 20,
  });
  const current = effectiveRate(
    recent.map((r) => ({ ...r, unitsPerUsd: r.unitsPerUsd.toString() })),
    currencyCode,
    now,
  );
  if (current?.source === "FIXED_PEG") {
    return { error: `${currency.nameAr} بسعر ثابت ولا يُدخل يومياً.`, values };
  }
  if (current && confirmedValue !== unitsPerUsd && isSuspiciousRateChange(current.unitsPerUsd, unitsPerUsd)) {
    return {
      needsConfirm: true,
      error: `السعر يختلف كثيراً عن الحالي (${current.unitsPerUsd}). تأكدي من الرقم ثم أكّدي الحفظ.`,
      values: { ...values, unitsPerUsd },
    };
  }

  // سجل جديد دائماً — لا تعديل ولا حذف: السعر القديم مستخدم في عمليات مسجّلة (D-21)
  const rate = await prisma.exchangeRate.create({
    data: {
      currencyCode,
      unitsPerUsd,
      source,
      effectiveAt: now,
      note: note || null,
      enteredById: session.user.id,
    },
  });

  // سعر الجنيه يغيّر الأسعار المقترحة ← إشعار بعدد الأصناف التي تحتاج مراجعة (D-109)
  if (currencyCode === "SDG") {
    await notifyPriceSuggestions(rate.id, unitsPerUsd).catch((e) => console.error("[notify] price suggestions", e));
    kickPushDelivery();
  }

  revalidatePath("/admin", "layout");
  return { success: `تم حفظ سعر ${currency.nameAr}: ${unitsPerUsd} للدولار.` };
}
