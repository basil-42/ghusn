import { prisma } from "@ghusn/db";
import { z } from "zod";

/** إعدادات نقطة البيع (D-80): حد خصم الموظفة ومدة المرتجع، والمحافظ التي يدخلها المقبوض. */
export const posSettingsSchema = z.object({
  maxDiscountPercent: z.number().min(0).max(100),
  returnDays: z.number().int().min(0).max(365),
  cashWalletId: z.string().nullable(),
  bankakWalletId: z.string().nullable(),
});
export type PosSettings = z.infer<typeof posSettingsSchema>;

const POS_DEFAULTS: PosSettings = { maxDiscountPercent: 10, returnDays: 7, cashWalletId: null, bankakWalletId: null };

/** نصوص الإيصال — قابلة للتخصيص من «الضبط» (D-80). */
export const receiptSettingsSchema = z.object({
  showLogo: z.boolean(),
  tagline: z.string().max(80),
  address: z.string().max(160),
  phone: z.string().max(40),
  whatsapp: z.string().max(40),
  instagram: z.string().max(60),
  footer: z.string().max(300),
  showCashier: z.boolean(),
  showCustomerPhone: z.boolean(),
});
export type ReceiptSettings = z.infer<typeof receiptSettingsSchema>;

export const RECEIPT_DEFAULTS: ReceiptSettings = {
  showLogo: true,
  tagline: "هدايا تُصنع لتُذكر",
  address: "",
  phone: "",
  whatsapp: "",
  instagram: "",
  footer: "شكراً لاختياركم غصن",
  showCashier: true,
  showCustomerPhone: false,
};

async function read<T>(key: string, schema: z.ZodType<T>, defaults: T): Promise<T> {
  const row = await prisma.setting.findUnique({ where: { key } });
  // قيمة محفوظة ناقصة (بعد إضافة حقل جديد) تُكمَّل بالافتراضي
  const parsed = schema.safeParse({ ...defaults, ...(row?.value as object | null) });
  return parsed.success ? parsed.data : defaults;
}

export const getPosSettings = () => read("pos", posSettingsSchema, POS_DEFAULTS);
export const getReceiptSettings = () => read("receipt", receiptSettingsSchema, RECEIPT_DEFAULTS);

export async function savePosSettings(value: PosSettings): Promise<void> {
  const data = posSettingsSchema.parse(value);
  await prisma.setting.upsert({ where: { key: "pos" }, create: { key: "pos", value: data }, update: { value: data } });
}

export async function saveReceiptSettings(value: ReceiptSettings): Promise<void> {
  const data = receiptSettingsSchema.parse(value);
  await prisma.setting.upsert({
    where: { key: "receipt" },
    create: { key: "receipt", value: data },
    update: { value: data },
  });
}

/** محفظتا النقد وبنكك: من الضبط، وإلا بالأسماء المزروعة (صندوق المحل، بنكك). */
export async function posWallets(): Promise<{ cash: string; bankak: string }> {
  const settings = await getPosSettings();
  const wallets = await prisma.wallet.findMany({ where: { isActive: true, currencyCode: "SDG" } });
  const pick = (id: string | null, name: string) =>
    wallets.find((w) => w.id === id)?.id ?? wallets.find((w) => w.name === name)?.id;
  const cash = pick(settings.cashWalletId, "صندوق المحل");
  const bankak = pick(settings.bankakWalletId, "بنكك");
  if (!cash || !bankak) throw new Error("POS wallets are not configured");
  return { cash, bankak };
}
