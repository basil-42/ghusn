import { prisma } from "@ghusn/db";
import { z } from "zod";

/** إعدادات نقطة البيع (D-80): حد خصم الموظفة ومدة المرتجع، والمحافظ التي يدخلها المقبوض. */
export const posSettingsSchema = z.object({
  maxDiscountPercent: z.number().min(0).max(100),
  returnDays: z.number().int().min(0).max(365),
  cashWalletId: z.string().nullable(),
  bankakWalletId: z.string().nullable(),
  /** حد المصروف الواحد الذي تسجّله الموظفة من الدرج (D-83). */
  staffExpenseLimitSdg: z.number().int().min(0).max(100_000_000),
  /** عجز وردية واحدة فوقه يظهر تنبيهاً في اللوحة الرئيسية (D-87). */
  shortageAlertSdg: z.number().int().min(0).max(100_000_000),
});
export type PosSettings = z.infer<typeof posSettingsSchema>;

const POS_DEFAULTS: PosSettings = {
  maxDiscountPercent: 10,
  returnDays: 7,
  cashWalletId: null,
  bankakWalletId: null,
  staffExpenseLimitSdg: 50_000,
  shortageAlertSdg: 10_000,
};

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

/**
 * إعدادات المتجر (D-88): محفظة شركة التوصيل، وحد اختياري للدفع عند الاستلام (0 = بلا حد)،
 * وحساب بنكك الذي يحوّل إليه العميل (D-90) — بلا رقم حساب لا يظهر خيار بنكك في المتجر.
 */
export const storeSettingsSchema = z.object({
  courierWalletId: z.string().nullable(),
  codMaxSdg: z.number().int().min(0).max(1_000_000_000),
  bankakAccountName: z.string().max(80),
  bankakAccountNumber: z.string().max(40),
  bankakNote: z.string().max(200),
});
export type StoreSettings = z.infer<typeof storeSettingsSchema>;
const STORE_DEFAULTS: StoreSettings = {
  courierWalletId: null,
  codMaxSdg: 0,
  bankakAccountName: "",
  bankakAccountNumber: "",
  bankakNote: "",
};

/** حساب بنكك للعرض على العميل، أو null إن لم يُضبط (فيُخفى الخيار). */
export async function bankakAccount(): Promise<{ name: string; number: string; note: string } | null> {
  const s = await getStoreSettings();
  const number = s.bankakAccountNumber.trim();
  return number ? { name: s.bankakAccountName.trim(), number, note: s.bankakNote.trim() } : null;
}
export const getStoreSettings = () => read("store", storeSettingsSchema, STORE_DEFAULTS);

export async function saveStoreSettings(value: StoreSettings): Promise<void> {
  const data = storeSettingsSchema.parse(value);
  await prisma.setting.upsert({
    where: { key: "store" },
    create: { key: "store", value: data },
    update: { value: data },
  });
}

/** محفظة شركة التوصيل: من الضبط، وإلا بالاسم المزروع. */
export async function courierWallet(): Promise<string | null> {
  const { courierWalletId } = await getStoreSettings();
  const wallets = await prisma.wallet.findMany({ where: { isActive: true, currencyCode: "SDG" } });
  return (
    wallets.find((w) => w.id === courierWalletId)?.id ?? wallets.find((w) => w.name === "شركة التوصيل")?.id ?? null
  );
}
/** تنبيهات المخزون في اللوحة (D-94): حد «قارب على النفاد» العام، ومهلة تنبيه الصلاحية بالأيام. */
export const stockSettingsSchema = z.object({
  lowStockQty: z.number().min(0).max(100_000),
  expiryAlertDays: z.number().int().min(1).max(365),
});
export type StockSettings = z.infer<typeof stockSettingsSchema>;
const STOCK_DEFAULTS: StockSettings = { lowStockQty: 3, expiryAlertDays: 30 };
export const getStockSettings = () => read("stock", stockSettingsSchema, STOCK_DEFAULTS);

export async function saveStockSettings(value: StockSettings): Promise<void> {
  const data = stockSettingsSchema.parse(value);
  await prisma.setting.upsert({
    where: { key: "stock" },
    create: { key: "stock", value: data },
    update: { value: data },
  });
}

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
