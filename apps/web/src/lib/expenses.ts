import { createHash } from "node:crypto";
import { dec, roundMoney, shopDay, toUsdExact } from "@ghusn/core";
import { prisma } from "@ghusn/db";
import sharp from "sharp";
import { roleCan } from "./auth/permissions";
import { nextDocumentNumber } from "./documents";
import { getRateAt } from "./exchange-rates";
import { MAX_UPLOAD_BYTES } from "./product-images";
import { getPosSettings, posWallets } from "./settings";
import { storage } from "./storage";

export class ExpenseError extends Error {}

/** صور الفواتير في مسار خاص: /media يرفض «private/»، وتُقدَّم فقط لمن يملك الصلاحية. */
export const attachmentKey = (hash: string) => `private/expenses/${hash}.webp`;

export async function listExpenseCategories(options: { staffOnly?: boolean; includeInactive?: boolean } = {}) {
  return prisma.expenseCategory.findMany({
    where: {
      ...(options.includeInactive ? {} : { isActive: true }),
      ...(options.staffOnly ? { staffAllowed: true } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

async function saveAttachment(file: File): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) throw new ExpenseError("الصورة أكبر من 10 ميغابايت.");
  const input = Buffer.from(await file.arrayBuffer());
  let data: Buffer;
  try {
    // تصحيح الاتجاه وحذف البيانات الوصفية (الموقع) — مثل صور المنتجات (D-73)
    data = await sharp(input, { limitInputPixels: 40_000_000, failOn: "error" })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
  } catch {
    throw new ExpenseError("تعذّرت قراءة الصورة. استخدمي صورة JPG أو PNG أو WebP.");
  }
  const key = attachmentKey(createHash("sha256").update(data).digest("hex").slice(0, 24));
  await storage.put(key, data, "image/webp");
  return key;
}

export interface ExpenseInput {
  categoryId: string;
  amount: string;
  walletId: string | null;
  spentAt: Date;
  note: string | null;
  attachment: File | null;
}

/**
 * تسجيل مصروف (D-83) من محفظة بعملتها وسعر يوم الدفع. الموظفة: أقسام محددة فقط، من درج
 * الوردية، وحتى الحد في الضبط. النقد من درج وردية مفتوحة يُربط بها فينقص النقد المتوقع.
 */
export async function createExpense(input: ExpenseInput, user: { id: string; role: string }): Promise<string> {
  const full = roleCan(user.role, { expense: ["void"] });
  const category = await prisma.expenseCategory.findFirst({ where: { id: input.categoryId, isActive: true } });
  if (!category) throw new ExpenseError("اختاري القسم.");
  const wallets = await posWallets();
  const walletId = full ? input.walletId : wallets.cash;
  if (!walletId) throw new ExpenseError("اختاري المحفظة.");
  const wallet = await prisma.wallet.findFirst({ where: { id: walletId, isActive: true } });
  if (!wallet) throw new ExpenseError("اختاري المحفظة.");

  if (!full) {
    if (!category.staffAllowed) throw new ExpenseError("هذا القسم تسجّله المديرة.");
    const { staffExpenseLimitSdg } = await getPosSettings();
    if (dec(input.amount).gt(staffExpenseLimitSdg)) {
      throw new ExpenseError(`المبلغ فوق حدّك (${staffExpenseLimitSdg.toLocaleString("en-US")} ج.س) — تسجّله المديرة.`);
    }
    if (shopDay(input.spentAt) !== shopDay(new Date())) throw new ExpenseError("تسجّلين مصاريف اليوم فقط.");
  }

  const rate = await getRateAt(wallet.currencyCode, input.spentAt);
  if (!rate) throw new ExpenseError(`لا يوجد سعر صرف لـ ${wallet.currencyCode} في ذلك اليوم.`);
  const shift =
    wallet.id === wallets.cash ? await prisma.shift.findFirst({ where: { userId: user.id, closedAt: null } }) : null;
  if (!full && !shift) throw new ExpenseError("افتحي الوردية أولاً — المصروف يخرج من درجها.");

  const key = input.attachment && input.attachment.size > 0 ? await saveAttachment(input.attachment) : null;
  const expense = await prisma.$transaction(async (tx) =>
    tx.expense.create({
      data: {
        number: await nextDocumentNumber(tx, "EXP", input.spentAt, 4),
        categoryId: category.id,
        amount: dec(input.amount).toFixed(2),
        currencyCode: wallet.currencyCode,
        rateUsed: rate,
        amountUsd: roundMoney(toUsdExact(input.amount, rate)).toFixed(2),
        walletId: wallet.id,
        spentAt: input.spentAt,
        note: input.note,
        attachmentKey: key,
        shiftId: shift?.id ?? null,
        createdById: user.id,
      },
    }),
  );
  return expense.id;
}

export async function voidExpense(id: string, reason: string, userId: string): Promise<void> {
  const updated = await prisma.expense.updateMany({
    where: { id, voidedAt: null },
    data: { voidedAt: new Date(), voidedById: userId, voidReason: reason },
  });
  if (updated.count === 0) throw new ExpenseError("المصروف غير موجود أو ملغى.");
}

/** قائمة المصاريف لشهر؛ الموظفة ترى ما سجّلته فقط. */
export async function listExpenses(range: { start: Date; end: Date }, onlyUserId?: string) {
  const rows = await prisma.expense.findMany({
    where: { spentAt: { gte: range.start, lt: range.end }, ...(onlyUserId ? { createdById: onlyUserId } : {}) },
    orderBy: { spentAt: "desc" },
    include: {
      category: { select: { name: true } },
      wallet: { select: { name: true } },
      createdBy: { select: { name: true } },
      voidedBy: { select: { name: true } },
    },
  });
  return rows.map((e) => ({
    id: e.id,
    number: e.number,
    category: e.category.name,
    amount: e.amount.toString(),
    currencyCode: e.currencyCode,
    amountUsd: e.amountUsd.toString(),
    walletName: e.wallet.name,
    spentAt: e.spentAt,
    note: e.note,
    hasAttachment: !!e.attachmentKey,
    createdBy: e.createdBy?.name ?? null,
    fromShift: !!e.shiftId,
    voided: e.voidedAt ? { by: e.voidedBy?.name ?? null, reason: e.voidReason } : null,
  }));
}

export async function getExpenseAttachment(id: string) {
  return prisma.expense.findUnique({ where: { id }, select: { attachmentKey: true, createdById: true } });
}

// ---------- أقسام المصاريف (الضبط) ----------

export async function saveExpenseCategory(input: {
  id: string | null;
  name: string;
  staffAllowed: boolean;
  isActive: boolean;
}): Promise<void> {
  const clash = await prisma.expenseCategory.findFirst({
    where: { name: input.name, NOT: input.id ? { id: input.id } : undefined },
  });
  if (clash) throw new ExpenseError("يوجد قسم بهذا الاسم.");
  if (input.id) {
    await prisma.expenseCategory.update({
      where: { id: input.id },
      data: { name: input.name, staffAllowed: input.staffAllowed, isActive: input.isActive },
    });
  } else {
    const last = await prisma.expenseCategory.aggregate({ _max: { sortOrder: true } });
    await prisma.expenseCategory.create({
      data: { name: input.name, staffAllowed: input.staffAllowed, sortOrder: (last._max.sortOrder ?? 0) + 1 },
    });
  }
}
