import { dec, toLatinDigits } from "@ghusn/core";
import { z } from "zod";

/** تحقق مدخلات البيع — مشترك بين عملية الخادم (متصل) ومسار المزامنة (دون اتصال). */
const clean = (v: string) =>
  toLatinDigits(v)
    .replace(/[,\s٬]/g, "")
    .replace("٫", ".");
const whole = (label: string) =>
  z
    .string()
    .transform(clean)
    .refine((v) => /^\d{1,12}$/.test(v), `${label}: رقم صحيح بالجنيه`);

export const saleSchema = z.object({
  id: z.string().regex(/^[a-z0-9]{20,32}$/),
  lines: z
    .array(
      z.object({
        variantId: z.string().min(1),
        qty: z
          .string()
          .transform(clean)
          .refine((v) => /^\d{1,6}(\.\d{1,3})?$/.test(v) && dec(v).gt(0), "الكمية غير صحيحة"),
        lineDiscountSdg: whole("خصم الصنف"),
      }),
    )
    .min(1, "الفاتورة فارغة")
    .max(100),
  invoiceDiscountSdg: whole("خصم الفاتورة"),
  payments: z
    .array(
      z.object({
        method: z.enum(["CASH", "BANKAK"]),
        amountSdg: whole("المبلغ"),
        reference: z
          .string()
          .trim()
          .max(60)
          .nullish()
          .transform((v) => v || null),
      }),
    )
    .max(4),
  cashTenderedSdg: z
    .string()
    .transform(clean)
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || /^\d{1,12}$/.test(v), "المبلغ المستلم رقم صحيح"),
  customerPhone: z
    .string()
    .trim()
    .max(20)
    .nullish()
    .transform((v) => v || null),
  customerName: z
    .string()
    .trim()
    .max(80)
    .nullish()
    .transform((v) => v || null),
  // تأكيد استبدال الاسم المسجّل بالمكتوب (D-116)
  renameCustomer: z.boolean().optional(),
  approval: z.object({ phone: z.string().max(20), password: z.string().max(200) }).nullish(),
  creditReturnId: z
    .string()
    .regex(/^[a-z0-9]{20,32}$/)
    .nullish(),
});

/** فاتورة دون اتصال: نفس البيع + وقته ورقمه على الجهاز وأسعاره (D-82). */
export const offlineSaleSchema = saleSchema.extend({
  createdAt: z.string().datetime(),
  localNumber: z.string().regex(/^OFF-[A-Z0-9]{4}-\d{1,6}$/),
  unitPrices: z.record(z.string(), z.string().regex(/^\d{1,12}$/)),
});
