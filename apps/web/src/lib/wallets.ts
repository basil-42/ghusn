import { dec, planTransfer, roundMoney, shopDay, toUsdExact, type Decimal } from "@ghusn/core";
import { Prisma, prisma } from "@ghusn/db";
import { nextDocumentNumber } from "./documents";
import { getRateInfoAt } from "./exchange-rates";
import { posWallets } from "./settings";

/**
 * المحافظ: الأرصدة والتحويلات والتسويات (D-86). الرصيد لا يُخزَّن — يُحسب من الحركات في
 * جداولها (المبيعات، المرتجعات، المصاريف، تكاليف الشحنات، دفعات الموردين، التمويل، التحويلات،
 * التسويات، فروقات عدّ الورديات) بعد آخر رصيد افتتاحي (جرد) للمحفظة.
 */

export class WalletError extends Error {}

export type MovementKind =
  | "OPENING"
  | "MANUAL"
  | "SALE"
  | "REFUND"
  | "EXPENSE"
  | "SHIPMENT_COST"
  | "SUPPLIER_PAYMENT"
  | "CAPITAL"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "SHIFT_DIFF"
  | "ORDER"
  | "ORDER_REFUND";

export const MOVEMENT_LABELS: Record<MovementKind, string> = {
  OPENING: "رصيد افتتاحي",
  MANUAL: "تسوية",
  SALE: "بيع",
  REFUND: "مرتجع",
  EXPENSE: "مصروف",
  SHIPMENT_COST: "تكلفة شحنة",
  SUPPLIER_PAYMENT: "دفعة مورد",
  CAPITAL: "تمويل",
  TRANSFER_OUT: "تحويل صادر",
  TRANSFER_IN: "تحويل وارد",
  SHIFT_DIFF: "فرق عدّ وردية",
  ORDER: "طلب متجر",
  ORDER_REFUND: "رد مبلغ طلب",
};

/** كل حركات المحافظ بمبلغ بإشارة وبعملة المحفظة. الملغى لا يُحسب. */
const MOVEMENTS = Prisma.sql`
  SELECT sp."walletId" AS "walletId", s."createdAt" AS "at", sp."amountSdg" AS "amount",
         'SALE' AS "kind", s."number" AS "ref", s."id" AS "refId", NULL::text AS "note", sp."id" AS "rowId"
    FROM "SalePayment" sp JOIN "Sale" s ON s."id" = sp."saleId"
   WHERE sp."walletId" IS NOT NULL
  UNION ALL
  SELECT rr."walletId", rr."createdAt", -rr."amountSdg", 'REFUND', r."number", r."id", NULL, rr."id"
    FROM "ReturnRefund" rr JOIN "SaleReturn" r ON r."id" = rr."returnId"
  UNION ALL
  SELECT e."walletId", e."spentAt", -e."amount", 'EXPENSE', e."number", e."id", c."name", e."id"
    FROM "Expense" e JOIN "ExpenseCategory" c ON c."id" = e."categoryId"
   WHERE e."voidedAt" IS NULL
  UNION ALL
  SELECT sc."walletId", sc."paidAt", -sc."amount", 'SHIPMENT_COST', sh."number", sh."id", sc."note", sc."id"
    FROM "ShipmentCost" sc JOIN "Shipment" sh ON sh."id" = sc."shipmentId"
   WHERE sc."voidedAt" IS NULL
  UNION ALL
  SELECT le."walletId", le."occurredAt", -le."paidAmount", 'SUPPLIER_PAYMENT', sup."name", sup."id", le."reference", le."id"
    FROM "SupplierLedgerEntry" le JOIN "Supplier" sup ON sup."id" = le."supplierId"
   WHERE le."kind" = 'PAYMENT' AND le."voidedAt" IS NULL AND le."walletId" IS NOT NULL AND le."paidAmount" IS NOT NULL
  UNION ALL
  SELECT cc."walletId", cc."contributedAt", cc."amount", 'CAPITAL', cc."partnerName", cc."id", cc."note", cc."id"
    FROM "CapitalContribution" cc
   WHERE cc."walletId" IS NOT NULL AND cc."voidedAt" IS NULL
  UNION ALL
  SELECT t."fromWalletId", t."occurredAt", -t."fromAmount", 'TRANSFER_OUT', t."number", t."id", w."name", t."id" || ':out'
    FROM "WalletTransfer" t JOIN "Wallet" w ON w."id" = t."toWalletId"
   WHERE t."voidedAt" IS NULL
  UNION ALL
  SELECT t."toWalletId", t."occurredAt", t."toAmount", 'TRANSFER_IN', t."number", t."id", w."name", t."id" || ':in'
    FROM "WalletTransfer" t JOIN "Wallet" w ON w."id" = t."fromWalletId"
   WHERE t."voidedAt" IS NULL
  UNION ALL
  SELECT a."walletId", a."occurredAt", a."amount", a."kind"::text, NULL, a."id", a."reason", a."id"
    FROM "WalletAdjustment" a
   WHERE a."voidedAt" IS NULL
  UNION ALL
  SELECT op."walletId", op."receivedAt", op."amountSdg",
         CASE WHEN op."amountSdg" < 0 THEN 'ORDER_REFUND' ELSE 'ORDER' END, o."number", o."id", op."reference", op."id"
    FROM "OrderPayment" op JOIN "Order" o ON o."id" = op."orderId"
  UNION ALL
  SELECT sh."cashWalletId", sh."closedAt", sh."countedCashSdg" - sh."expectedCashSdg", 'SHIFT_DIFF', u."name", sh."id", sh."closeNote", sh."id"
    FROM "Shift" sh JOIN "User" u ON u."id" = sh."userId"
   WHERE sh."cashWalletId" IS NOT NULL AND sh."closedAt" IS NOT NULL
     AND sh."countedCashSdg" IS DISTINCT FROM sh."expectedCashSdg"`;

/** الحركات المحسوبة: الرصيد الافتتاحي نفسه وما بعده فقط (الجرد يلغي ما قبله). */
const COUNTED = Prisma.sql`
  WITH mv AS (${MOVEMENTS}),
  opening AS (
    SELECT "walletId", "occurredAt", "id" FROM "WalletAdjustment"
     WHERE "kind" = 'OPENING' AND "voidedAt" IS NULL
  )
  SELECT mv.* FROM mv LEFT JOIN opening o ON o."walletId" = mv."walletId"
   WHERE o."id" IS NULL OR mv."rowId" = o."id" OR mv."at" > o."occurredAt"`;

export interface WalletCard {
  id: string;
  name: string;
  currencyCode: string;
  symbol: string;
  isActive: boolean;
  balance: string;
  /** القيمة التقريبية بالدولار بسعر اليوم — للمعلومة فقط. */
  balanceUsd: string | null;
  opening: { amount: string; at: Date } | null;
}

export async function listWallets(now = new Date()): Promise<WalletCard[]> {
  const [wallets, balances, openings] = await Promise.all([
    prisma.wallet.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
      include: { currency: { select: { symbol: true } } },
    }),
    prisma.$queryRaw<{ walletId: string; balance: Prisma.Decimal }[]>`
      SELECT c."walletId", SUM(c."amount") AS "balance" FROM (${COUNTED}) c GROUP BY c."walletId"`,
    prisma.walletAdjustment.findMany({ where: { kind: "OPENING", voidedAt: null } }),
  ]);
  const rates = new Map<string, string | null>();
  for (const code of new Set(wallets.map((w) => w.currencyCode))) {
    rates.set(code, (await getRateInfoAt(code, now))?.unitsPerUsd ?? null);
  }
  return wallets.map((w) => {
    const balance = dec(balances.find((b) => b.walletId === w.id)?.balance.toString() ?? "0");
    const rate = rates.get(w.currencyCode);
    const opening = openings.find((o) => o.walletId === w.id);
    return {
      id: w.id,
      name: w.name,
      currencyCode: w.currencyCode,
      symbol: w.currency.symbol,
      isActive: w.isActive,
      balance: balance.toFixed(2),
      balanceUsd: rate ? roundMoney(toUsdExact(balance, rate)).toFixed(2) : null,
      opening: opening ? { amount: opening.amount.toString(), at: opening.occurredAt } : null,
    };
  });
}

export interface StatementRow {
  at: Date;
  kind: MovementKind;
  ref: string | null;
  /** المستند الذي يُفتح من الكشف (الفاتورة، الشحنة، المورد…). */
  refId: string;
  /** معرّف الحركة نفسها — فريد لكل سطر (قد تتكرر refId: دفعتان لنفس المورد). */
  rowId: string;
  note: string | null;
  amount: string;
  balance: string;
}

/** كشف حساب المحفظة: أحدث الحركات مع الرصيد بعد كل حركة. */
export interface StatementFilter {
  kind?: MovementKind;
  range?: { start: Date; end: Date };
}

/** الفلتر يُطبَّق بعد حساب الرصيد التراكمي، فيبقى «الرصيد بعد الحركة» صحيحاً (D-127). */
export async function walletStatement(
  walletId: string,
  take = 200,
  filter: StatementFilter = {},
): Promise<StatementRow[]> {
  const kind = filter.kind ? Prisma.sql`AND x."kind" = ${filter.kind}::text` : Prisma.empty;
  const range = filter.range
    ? Prisma.sql`AND x."at" >= ${filter.range.start} AND x."at" < ${filter.range.end}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<
    {
      at: Date;
      kind: MovementKind;
      ref: string | null;
      refId: string;
      rowId: string;
      note: string | null;
      amount: Prisma.Decimal;
      balance: Prisma.Decimal;
    }[]
  >`
    SELECT * FROM (
      SELECT c.*, SUM(c."amount") OVER (ORDER BY c."at", c."kind" = 'OPENING' DESC, c."rowId") AS "balance"
        FROM (${COUNTED}) c WHERE c."walletId" = ${walletId}
    ) x WHERE TRUE ${kind} ${range}
     ORDER BY x."at" DESC, x."kind" = 'OPENING', x."rowId" DESC LIMIT ${take}`;
  return rows.map((r) => ({ ...r, amount: r.amount.toFixed(2), balance: r.balance.toFixed(2) }));
}

/** السعر الساري لعملة، وهل هو ثابت (الدولار أو المربوطة) فلا يُشتق من التحويل. */
async function rateSide(currencyCode: string, at: Date) {
  const info = await getRateInfoAt(currencyCode, at);
  if (!info) throw new WalletError(`لا يوجد سعر صرف لـ ${currencyCode} في ذلك اليوم.`);
  return { currentRate: info.unitsPerUsd, anchored: info.source === "FIXED_PEG" };
}

export interface TransferInput {
  fromWalletId: string;
  toWalletId: string;
  fromAmount: string;
  toAmount: string;
  feeAmount: string | null;
  at: Date;
  reference: string | null;
  note: string | null;
  /** تأكيد سعر فعلي يبتعد أكثر من 20% عن الساري (D-68): نفس الرقم المشتق. */
  confirmRate: string | null;
}

/** أسعار العملات السارية الآن للمعاينة في النموذج (المالك فقط). */
export async function currentRateSides(now = new Date()) {
  const currencies = await prisma.currency.findMany({ where: { isActive: true }, select: { code: true } });
  const out: Record<string, { currentRate: string; anchored: boolean }> = {};
  for (const c of currencies) {
    const info = await getRateInfoAt(c.code, now);
    if (info) out[c.code] = { currentRate: info.unitsPerUsd, anchored: info.source === "FIXED_PEG" };
  }
  return out;
}

/**
 * تسجيل تحويل. العمولة ضمن المبلغ الخارج وتدخل في السعر الفعلي. إن نتج سعر جديد لعملة غير
 * ثابتة وكان التحويل اليوم يُسجَّل «تحويل فعلي» ساري من الآن (لا أسعار بأثر رجعي — D-67).
 */
export async function createTransfer(input: TransferInput, userId: string, now = new Date()): Promise<string> {
  if (input.fromWalletId === input.toWalletId) throw new WalletError("اختر محفظتين مختلفتين.");
  const [from, to] = await Promise.all([
    prisma.wallet.findFirst({ where: { id: input.fromWalletId, isActive: true } }),
    prisma.wallet.findFirst({ where: { id: input.toWalletId, isActive: true } }),
  ]);
  if (!from || !to) throw new WalletError("اختر المحفظتين.");
  if (input.feeAmount && dec(input.feeAmount).gte(input.fromAmount)) {
    throw new WalletError("العمولة جزء من المبلغ الخارج — يجب أن تكون أقل منه.");
  }
  if (from.currencyCode === to.currencyCode && !dec(input.fromAmount).eq(input.toAmount)) {
    throw new WalletError("نفس العملة: الخارج = الواصل. سجّل عمولة التحويل مصروفاً.");
  }
  const [fromSide, toSide] = await Promise.all([
    rateSide(from.currencyCode, input.at),
    rateSide(to.currencyCode, input.at),
  ]);
  const plan = planTransfer({
    from: { currencyCode: from.currencyCode, amount: input.fromAmount, ...fromSide },
    to: { currencyCode: to.currencyCode, amount: input.toAmount, ...toSide },
  });
  const derived = plan.derived;
  if (derived?.suspicious && (!input.confirmRate || !dec(input.confirmRate).eq(derived.unitsPerUsd))) {
    throw new WalletError(
      `السعر الفعلي ${derived.unitsPerUsd.toFixed()} يبتعد كثيراً عن الساري ${derived.previous.toFixed()} — راجع المبلغين، أو اكتب السعر نفسه للتأكيد.`,
    );
  }
  const isToday = shopDay(input.at) === shopDay(now);

  return prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, "TRF", input.at, 4);
    const rate =
      derived && isToday
        ? await tx.exchangeRate.create({
            data: {
              currencyCode: derived.currencyCode,
              unitsPerUsd: derived.unitsPerUsd.toFixed(6),
              source: "ACTUAL_TRANSFER",
              effectiveAt: now,
              note: `${number}: ${from.name} ← ${to.name}`,
              enteredById: userId,
            },
          })
        : null;
    const t = await tx.walletTransfer.create({
      data: {
        number,
        fromWalletId: from.id,
        fromAmount: dec(input.fromAmount).toFixed(2),
        fromCurrencyCode: from.currencyCode,
        fromRate: plan.fromRate.toFixed(6),
        fromAmountUsd: plan.fromAmountUsd.toFixed(2),
        toWalletId: to.id,
        toAmount: dec(input.toAmount).toFixed(2),
        toCurrencyCode: to.currencyCode,
        toRate: plan.toRate.toFixed(6),
        toAmountUsd: plan.toAmountUsd.toFixed(2),
        feeAmount: input.feeAmount ? dec(input.feeAmount).toFixed(2) : null,
        rateId: rate?.id ?? null,
        occurredAt: input.at,
        reference: input.reference,
        note: input.note,
        createdById: userId,
      },
    });
    return t.number;
  });
}

export async function listTransfers(take = 50) {
  const rows = await prisma.walletTransfer.findMany({
    orderBy: { occurredAt: "desc" },
    take,
    include: {
      fromWallet: { select: { name: true } },
      toWallet: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });
  return rows.map((t) => ({
    id: t.id,
    number: t.number,
    from: t.fromWallet.name,
    fromAmount: t.fromAmount.toString(),
    fromCurrencyCode: t.fromCurrencyCode,
    fromRate: t.fromRate.toString(),
    to: t.toWallet.name,
    toAmount: t.toAmount.toString(),
    toCurrencyCode: t.toCurrencyCode,
    toRate: t.toRate.toString(),
    amountUsd: t.fromAmountUsd.toString(),
    feeAmount: t.feeAmount?.toString() ?? null,
    createdRate: !!t.rateId,
    occurredAt: t.occurredAt,
    reference: t.reference,
    note: t.note,
    createdBy: t.createdBy?.name ?? null,
    voided: t.voidedAt ? { reason: t.voidReason } : null,
  }));
}

/** إلغاء تحويل بسبب. السعر الناتج عنه يبقى في سجل الأسعار (D-67) — يُصحَّح بإدخال سعر جديد. */
export async function voidTransfer(id: string, reason: string, userId: string): Promise<void> {
  const r = await prisma.walletTransfer.updateMany({
    where: { id, voidedAt: null },
    data: { voidedAt: new Date(), voidedById: userId, voidReason: reason },
  });
  if (r.count === 0) throw new WalletError("التحويل غير موجود أو ملغى.");
}

async function adjustmentMoney(currencyCode: string, amount: Decimal, at: Date) {
  const info = await getRateInfoAt(currencyCode, at);
  if (!info) throw new WalletError(`لا يوجد سعر صرف لـ ${currencyCode} في ذلك اليوم.`);
  return {
    amount: amount.toFixed(2),
    currencyCode,
    rateUsed: info.unitsPerUsd,
    amountUsd: roundMoney(toUsdExact(amount, info.unitsPerUsd)).toFixed(2),
  };
}

/**
 * الرصيد الافتتاحي (جرد): المبلغ الفعلي في المحفظة في لحظة ما. ما قبلها من حركات لا يُحسب،
 * وما بعدها يُضاف. واحد ساري لكل محفظة — لتغييره يُلغى ويُدخل جديد.
 */
export async function setOpeningBalance(
  input: { walletId: string; amount: string; at: Date; reason: string | null },
  userId: string,
): Promise<void> {
  const wallet = await prisma.wallet.findFirst({ where: { id: input.walletId, isActive: true } });
  if (!wallet) throw new WalletError("المحفظة غير موجودة.");
  const amount = dec(input.amount);
  if (amount.lt(0)) throw new WalletError("الرصيد الافتتاحي لا يكون سالباً.");
  const money = await adjustmentMoney(wallet.currencyCode, amount, input.at);
  try {
    await prisma.walletAdjustment.create({
      data: {
        walletId: wallet.id,
        kind: "OPENING",
        ...money,
        occurredAt: input.at,
        reason: input.reason ?? "رصيد افتتاحي",
        createdById: userId,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new WalletError("للمحفظة رصيد افتتاحي — ألغه أولاً ثم أدخل الجديد.");
    }
    throw e;
  }
}

/** تسوية يدوية بإشارة (زيادة أو نقص) بسبب مكتوب — للمالك. */
export async function addAdjustment(
  input: { walletId: string; amount: string; at: Date; reason: string },
  userId: string,
): Promise<void> {
  const wallet = await prisma.wallet.findFirst({ where: { id: input.walletId, isActive: true } });
  if (!wallet) throw new WalletError("المحفظة غير موجودة.");
  const amount = dec(input.amount);
  if (amount.isZero()) throw new WalletError("مبلغ التسوية لا يكون صفراً.");
  const money = await adjustmentMoney(wallet.currencyCode, amount, input.at);
  await prisma.walletAdjustment.create({
    data: {
      walletId: wallet.id,
      kind: "MANUAL",
      ...money,
      occurredAt: input.at,
      reason: input.reason,
      createdById: userId,
    },
  });
}

export async function voidAdjustment(id: string, reason: string, userId: string): Promise<void> {
  const r = await prisma.walletAdjustment.updateMany({
    where: { id, voidedAt: null },
    data: { voidedAt: new Date(), voidedById: userId, voidReason: reason },
  });
  if (r.count === 0) throw new WalletError("التسوية غير موجودة أو ملغاة.");
}

export async function createWallet(input: { name: string; currencyCode: string }): Promise<void> {
  const currency = await prisma.currency.findFirst({ where: { code: input.currencyCode, isActive: true } });
  if (!currency) throw new WalletError("العملة غير متاحة.");
  if (await prisma.wallet.findFirst({ where: { name: input.name } })) {
    throw new WalletError("يوجد محفظة بهذا الاسم.");
  }
  await prisma.wallet.create({ data: { name: input.name, currencyCode: currency.code } });
}

export async function setWalletActive(id: string, isActive: boolean): Promise<void> {
  if (!isActive) {
    const pos = await posWallets().catch(() => null);
    if (pos && (pos.cash === id || pos.bankak === id)) {
      throw new WalletError("محفظة نقطة البيع — غيّرها في الضبط أولاً.");
    }
  }
  await prisma.wallet.update({ where: { id }, data: { isActive } });
}

/** تصنيف حركات المحافظ في التدفق النقدي (D-127). التحويلات داخلية؛ الرصيد الافتتاحي ليس دخلاً. */
export const INTERNAL_KINDS: MovementKind[] = ["TRANSFER_IN", "TRANSFER_OUT"];

export interface WalletFlow {
  id: string;
  name: string;
  currencyCode: string;
  symbol: string;
  decimals: number;
  isActive: boolean;
  opening: string;
  closing: string;
  /** صافي كل نوع حركة في الفترة (بإشارة) */
  lines: { kind: MovementKind; label: string; amount: string }[];
  inflow: string;
  outflow: string;
  /** تقريبي بسعر اليوم */
  inflowUsd: string | null;
  outflowUsd: string | null;
}

/**
 * التدفق النقدي لفترة (D-127): لكل محفظة رصيدها قبل الفترة وآخرها وصافي كل نوع حركة بعملتها — بنفس
 * حركات كشف المحفظة (COUNTED). الدخل والخرج بلا تحويلات بين المحافظ ولا رصيد افتتاحي.
 */
export async function walletFlows(range: { start: Date; end: Date }, now = new Date()): Promise<WalletFlow[]> {
  const [wallets, before, during] = await Promise.all([
    prisma.wallet.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
      include: { currency: { select: { symbol: true, decimals: true } } },
    }),
    prisma.$queryRaw<{ walletId: string; balance: Prisma.Decimal }[]>`
      SELECT c."walletId", SUM(c."amount") AS "balance" FROM (${COUNTED}) c
       WHERE c."at" < ${range.start} GROUP BY c."walletId"`,
    prisma.$queryRaw<{ walletId: string; kind: MovementKind; amount: Prisma.Decimal }[]>`
      SELECT c."walletId", c."kind", SUM(c."amount") AS "amount" FROM (${COUNTED}) c
       WHERE c."at" >= ${range.start} AND c."at" < ${range.end} GROUP BY c."walletId", c."kind"`,
  ]);
  const rates = new Map<string, string | null>();
  for (const code of new Set(wallets.map((w) => w.currencyCode))) {
    rates.set(code, (await getRateInfoAt(code, now))?.unitsPerUsd ?? null);
  }
  return wallets
    .map((w) => {
      const opening = dec(before.find((b) => b.walletId === w.id)?.balance.toString() ?? "0");
      const rows = during.filter((d) => d.walletId === w.id && !dec(d.amount.toString()).isZero());
      const lines = rows
        .map((r) => ({
          kind: r.kind,
          label: MOVEMENT_LABELS[r.kind] ?? r.kind,
          amount: dec(r.amount.toString()).toFixed(2),
        }))
        .sort((a, b) => Number(dec(b.amount).gt(a.amount)) - Number(dec(a.amount).gt(b.amount)));
      const flow = rows.filter((r) => !INTERNAL_KINDS.includes(r.kind) && r.kind !== "OPENING");
      const inflow = flow.reduce((a, r) => (dec(r.amount.toString()).gt(0) ? a.plus(r.amount.toString()) : a), dec(0));
      const outflow = flow.reduce(
        (a, r) => (dec(r.amount.toString()).lt(0) ? a.minus(r.amount.toString()) : a),
        dec(0),
      );
      const closing = lines.reduce((a, l) => a.plus(l.amount), opening);
      const rate = rates.get(w.currencyCode);
      return {
        id: w.id,
        name: w.name,
        currencyCode: w.currencyCode,
        symbol: w.currency.symbol,
        decimals: w.currency.decimals,
        isActive: w.isActive,
        opening: opening.toFixed(2),
        closing: closing.toFixed(2),
        lines,
        inflow: inflow.toFixed(2),
        outflow: outflow.toFixed(2),
        inflowUsd: rate ? roundMoney(toUsdExact(inflow, rate)).toFixed(2) : null,
        outflowUsd: rate ? roundMoney(toUsdExact(outflow, rate)).toFixed(2) : null,
      };
    })
    .filter((w) => w.isActive || w.lines.length > 0 || !dec(w.opening).isZero());
}
