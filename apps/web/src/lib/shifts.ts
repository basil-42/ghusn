import { CoreError, dec, expectedCash, shiftDifference, shiftOpening, shopDay, sum } from "@ghusn/core";
import { Prisma, prisma } from "@ghusn/db";
import { getRateAt } from "./exchange-rates";
import { getPosSettings, posWallets } from "./settings";
import { roleCan } from "./auth/permissions";
import { formatTime } from "./format";
import { walletBalance } from "./wallets";

export class ShiftError extends Error {}

/** الوردية المفتوحة للخزنة (D-143): واحدة فقط في كل وقت، أياً كانت صاحبتها. */
export async function getOpenShift() {
  return prisma.shift.findFirst({
    where: { closedAt: null },
    orderBy: { openedAt: "asc" },
    include: { user: { select: { name: true } } },
  });
}

const OPEN_LOCK = "shift:open";

/** رصيد الخزنة في النظام الآن — ما تبدأ منه الوردية التالية (D-146). null إن لم تُضبط الخزنة. */
export async function safeBalanceNow(): Promise<string | null> {
  const cash = await cashWalletId();
  if (!cash) return null;
  return (await walletBalance(prisma, cash)).toFixed(0);
}

/**
 * فتح وردية (D-80، D-143، D-146): وردية واحدة للخزنة، والعهدة **رصيد الخزنة في النظام** — لا رقم يُكتب.
 * إن عدّت الموظفة الدرج ووجدت غير ذلك تكتب المعدود وسبباً: العهدة المعدود، والفرق يُسوّى في رصيد الخزنة
 * ويدخل فروقات الصندوق بسعر لحظة الفتح (D-87). القفل يمنع فتح ورديتين في نفس اللحظة من جهازين.
 */
export async function openShift(
  userId: string,
  count: { countedSdg: string; note: string | null } | null = null,
): Promise<string> {
  const cash = await cashWalletId();
  if (!cash) throw new ShiftError("لم تُضبط محفظة الخزنة بعد — اطلبي من المالك ضبطها من الإعدادات.");
  const openedAt = new Date();
  const sdgPerUsd = count ? await getRateAt("SDG", openedAt) : null;
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${OPEN_LOCK}))`;
      const open = await tx.shift.findFirst({
        where: { closedAt: null },
        include: { user: { select: { name: true } } },
      });
      if (open) {
        throw new ShiftError(
          open.userId === userId
            ? "لديكِ وردية مفتوحة بالفعل."
            : `الخزنة مع ${open.user.name} منذ ${formatTime(open.openedAt)}. اطلبي منها إغلاق ورديتها بعدّ النقد، ثم افتحي ورديتك.`,
        );
      }
      // يُقفل على الخزنة: لا تمر حركة عليها بين قراءة الرصيد وفتح الوردية
      const systemSdg = await walletBalance(tx, cash, true);
      let opening;
      try {
        opening = shiftOpening({ systemSdg, countedSdg: count?.countedSdg ?? null });
      } catch (e) {
        if (e instanceof CoreError && e.code === "COUNT_REQUIRED") {
          throw new ShiftError(
            `رصيد الخزنة في النظام سالب (${systemSdg.toFixed(0)}) — عدّي الدرج واكتبي المعدود وسبب الفرق.`,
          );
        }
        throw e;
      }
      const differs = !opening.differenceSdg.isZero();
      if (differs && !count?.note) {
        throw new ShiftError(
          `المعدود يختلف عن رصيد الخزنة في النظام (${systemSdg.toFixed(0)}) — اكتبي السبب، أو أعيدي العدّ.`,
        );
      }
      const shift = await tx.shift.create({
        data: {
          userId,
          openedAt,
          openingCashSdg: opening.openingSdg.toFixed(2),
          openingSystemSdg: systemSdg.toFixed(2),
          openingNote: differs ? count?.note : null,
          openingDiffUsd:
            differs && sdgPerUsd
              ? shiftDifference({
                  expectedSdg: systemSdg,
                  countedSdg: opening.openingSdg,
                  sdgPerUsd,
                }).differenceUsd.toFixed(2)
              : null,
          cashWalletId: cash,
        },
      });
      return shift.id;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ShiftError("توجد وردية مفتوحة بالفعل — حدّثي الصفحة.");
    }
    throw e;
  }
}

/** محفظة الخزنة من الضبط (D-143)؛ null إن لم تُضبط محافظ نقطة البيع بعد. */
async function cashWalletId(): Promise<string | null> {
  try {
    return (await posWallets()).cash;
  } catch {
    return null;
  }
}

export const NO_OPEN_SHIFT = "لا توجد وردية مفتوحة — افتحي الوردية من نقطة البيع أولاً.";

/** الوردية المفتوحة مقفلة داخل المعاملة: لا تُغلق أثناء تسجيل حركة عليها. */
export async function lockOpenShift(tx: Prisma.TransactionClient): Promise<string | null> {
  const [row] = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Shift" WHERE "closedAt" IS NULL ORDER BY "openedAt" ASC LIMIT 1 FOR UPDATE`;
  return row?.id ?? null;
}

/**
 * حركة على محفظة (D-143): إن كانت الخزنة فهي على الوردية المفتوحة، وبتاريخ اليوم (المال يخرج من الدرج
 * الآن؛ ما خرج في يوم سابق حُسب في عدّ ورديته). **بلا وردية مفتوحة تُسجَّل** (D-146): تغيّر رصيد الخزنة،
 * والوردية التالية تبدأ منه — إلا إن طُلبت الوردية (`requireShift`: مصروف الموظفة من درجها).
 * غير الخزنة ← null. `fail` يبني خطأ المستدعي.
 */
export async function safeShiftFor(
  tx: Prisma.TransactionClient,
  walletId: string | null,
  at: Date,
  fail: (message: string) => Error,
  requireShift = false,
): Promise<string | null> {
  if (!walletId || walletId !== (await cashWalletId())) return null;
  if (shopDay(at) !== shopDay(new Date())) {
    throw fail("ما يخرج من الخزنة أو يدخلها يُسجَّل بتاريخ اليوم — لحركة سابقة اختاري محفظة أخرى.");
  }
  const shiftId = await lockOpenShift(tx);
  if (!shiftId && requireShift) throw fail(NO_OPEN_SHIFT);
  return shiftId;
}

/** هل تُغيَّر الخزنة بتسوية أو رصيد افتتاحي؟ لا أثناء وردية مفتوحة — تُعدّ عند إغلاقها (D-146). */
export async function safeCountBlocked(tx: Prisma.TransactionClient, walletId: string): Promise<string | null> {
  if (walletId !== (await cashWalletId())) return null;
  return (await lockOpenShift(tx))
    ? "الخزنة تُعدّ عند إغلاق الوردية — لا تسوية عليها والوردية مفتوحة. أغلقي الوردية بالعدّ، أو سجّلي الحركة."
    : null;
}

/**
 * إلغاء حركة خزنة (D-143، قرار باسل أ): إن كانت ورديتها مفتوحة يكفي الإلغاء (لا تُحسب)، وإن أُغلقت
 * فالمبلغ يعود للوردية المفتوحة الآن ويظهر فيها. بلا وردية مفتوحة يغيّر رصيد الخزنة، والوردية التالية
 * تبدأ منه (D-146).
 */
export async function voidShiftFor(tx: Prisma.TransactionClient, shiftId: string | null): Promise<string | null> {
  if (!shiftId) return null;
  const shift = await tx.shift.findUnique({ where: { id: shiftId }, select: { closedAt: true } });
  if (!shift?.closedAt) return null;
  return lockOpenShift(tx);
}

type Db = Prisma.TransactionClient | typeof prisma;
const n = (v: Prisma.Decimal | null | undefined) => dec(v?.toString() ?? "0");

/**
 * حركة الخزنة في الوردية (D-143) — حساب واحد للملخص والإغلاق: العهدة + ما دخل − ما خرج.
 * يدخل: البيع نقداً، الاستلام من المحل نقداً، مال دخل المحل إلى الخزنة، التحويل إليها، وما أُلغي من
 * حركات خارجة بعد إغلاق ورديتها. يخرج: المردود نقداً، المصروف، دفعة المورد، تكلفة الشحنة، التحويل منها
 * (الإيداع)، وما أُلغي من حركات داخلة بعد إغلاق ورديتها.
 */
export async function shiftCash(db: Db, shiftId: string, openingCashSdg: string) {
  const { cash } = await posWallets();
  const [sales, orders, refunds, expenses, payments, costs, transfers, funding, vExp, vPay, vCost, vTrf, vFund] =
    await Promise.all([
      db.salePayment.aggregate({ where: { method: "CASH", sale: { shiftId } }, _sum: { amountSdg: true } }),
      db.orderPayment.aggregate({ where: { shiftId, channel: "CASH" }, _sum: { amountSdg: true } }),
      db.returnRefund.aggregate({ where: { shiftId, method: "CASH" }, _sum: { amountSdg: true } }),
      db.expense.aggregate({ where: { shiftId, voidedAt: null }, _sum: { amount: true } }),
      db.supplierLedgerEntry.aggregate({ where: { shiftId, voidedAt: null }, _sum: { paidAmount: true } }),
      db.shipmentCost.aggregate({ where: { shiftId, voidedAt: null }, _sum: { amount: true } }),
      db.walletTransfer.findMany({
        where: { shiftId, voidedAt: null },
        select: { fromWalletId: true, fromAmount: true, toAmount: true },
      }),
      db.capitalContribution.aggregate({ where: { shiftId, voidedAt: null }, _sum: { amount: true } }),
      db.expense.aggregate({ where: { voidShiftId: shiftId }, _sum: { amount: true } }),
      db.supplierLedgerEntry.aggregate({ where: { voidShiftId: shiftId }, _sum: { paidAmount: true } }),
      db.shipmentCost.aggregate({ where: { voidShiftId: shiftId }, _sum: { amount: true } }),
      db.walletTransfer.findMany({
        where: { voidShiftId: shiftId },
        select: { fromWalletId: true, fromAmount: true, toAmount: true },
      }),
      db.capitalContribution.aggregate({ where: { voidShiftId: shiftId }, _sum: { amount: true } }),
    ]);
  const out = (rows: typeof transfers) =>
    sum(rows.filter((t) => t.fromWalletId === cash).map((t) => t.fromAmount.toString()));
  const into = (rows: typeof transfers) =>
    sum(rows.filter((t) => t.fromWalletId !== cash).map((t) => t.toAmount.toString()));
  const f = {
    salesCashSdg: n(sales._sum.amountSdg),
    orderCashSdg: n(orders._sum.amountSdg),
    moneyInSdg: n(funding._sum.amount),
    transfersInSdg: into(transfers),
    refundsSdg: n(refunds._sum.amountSdg),
    expensesSdg: n(expenses._sum.amount),
    supplierPaymentsSdg: n(payments._sum.paidAmount),
    shipmentCostsSdg: n(costs._sum.amount),
    transfersOutSdg: out(transfers),
    // أُلغي بعد إغلاق ورديته: الخارج يعود (+) والداخل يُرد (−)
    voidedBackSdg: n(vExp._sum.amount).plus(n(vPay._sum.paidAmount)).plus(n(vCost._sum.amount)).plus(out(vTrf)),
    voidedOutSdg: n(vFund._sum.amount).plus(into(vTrf)),
  };
  const cashIn = f.salesCashSdg.plus(f.orderCashSdg).plus(f.moneyInSdg).plus(f.transfersInSdg).plus(f.voidedBackSdg);
  const cashOut = f.refundsSdg
    .plus(f.expensesSdg)
    .plus(f.supplierPaymentsSdg)
    .plus(f.shipmentCostsSdg)
    .plus(f.transfersOutSdg)
    .plus(f.voidedOutSdg);
  return { ...f, expected: expectedCash(openingCashSdg, cashIn, cashOut) };
}

/** ما دخل الخزنة أو خرج منها غير البيع والمرتجع، ومن سجّله — قائمة الوردية (D-143). */
export async function shiftMoves(shiftId: string) {
  const { cash } = await posWallets();
  const by = { select: { name: true } } as const;
  const [expenses, payments, costs, transfers, funding] = await Promise.all([
    prisma.expense.findMany({
      where: { OR: [{ shiftId, voidedAt: null }, { voidShiftId: shiftId }] },
      include: { category: { select: { name: true } }, createdBy: by },
    }),
    prisma.supplierLedgerEntry.findMany({
      where: { OR: [{ shiftId, voidedAt: null }, { voidShiftId: shiftId }] },
      include: { supplier: { select: { name: true } }, createdBy: by },
    }),
    prisma.shipmentCost.findMany({
      where: { OR: [{ shiftId, voidedAt: null }, { voidShiftId: shiftId }] },
      include: { shipment: { select: { number: true } }, createdBy: by },
    }),
    prisma.walletTransfer.findMany({
      where: { OR: [{ shiftId, voidedAt: null }, { voidShiftId: shiftId }] },
      include: { fromWallet: { select: { name: true } }, toWallet: { select: { name: true } }, createdBy: by },
    }),
    prisma.capitalContribution.findMany({
      where: { OR: [{ shiftId, voidedAt: null }, { voidShiftId: shiftId }] },
      include: { createdBy: by },
    }),
  ]);
  type Move = { id: string; at: Date; label: string; by: string | null; amountSdg: string };
  const moves: Move[] = [];
  // حركة أُلغيت بعد إغلاق ورديتها تظهر هنا بعكس إشارتها
  const sign = (outflow: boolean, voidedBack: boolean) => (outflow !== voidedBack ? -1 : 1);
  for (const e of expenses) {
    const back = e.voidShiftId === shiftId;
    moves.push({
      id: e.id,
      at: back ? (e.voidedAt ?? e.spentAt) : e.spentAt,
      label: back ? `أُلغي مصروف من وردية سابقة · ${e.category.name}` : `مصروف · ${e.category.name}`,
      by: e.createdBy?.name ?? null,
      amountSdg: dec(e.amount.toString()).times(sign(true, back)).toFixed(0),
    });
  }
  for (const p of payments) {
    const back = p.voidShiftId === shiftId;
    moves.push({
      id: p.id,
      at: back ? (p.voidedAt ?? p.occurredAt) : p.createdAt,
      label: back ? `أُلغيت دفعة من وردية سابقة · ${p.supplier.name}` : `دفعة مورد · ${p.supplier.name}`,
      by: p.createdBy?.name ?? null,
      amountSdg: n(p.paidAmount).times(sign(true, back)).toFixed(0),
    });
  }
  for (const c of costs) {
    const back = c.voidShiftId === shiftId;
    moves.push({
      id: c.id,
      at: back ? (c.voidedAt ?? c.paidAt) : c.createdAt,
      label: back ? `أُلغيت تكلفة شحنة من وردية سابقة · ${c.shipment.number}` : `تكلفة شحنة · ${c.shipment.number}`,
      by: c.createdBy?.name ?? null,
      amountSdg: dec(c.amount.toString()).times(sign(true, back)).toFixed(0),
    });
  }
  for (const t of transfers) {
    const back = t.voidShiftId === shiftId;
    const outflow = t.fromWalletId === cash;
    moves.push({
      id: t.id,
      at: back ? (t.voidedAt ?? t.occurredAt) : t.createdAt,
      label: `${back ? "أُلغي " : ""}${outflow ? `إيداع في ${t.toWallet.name}` : `تحويل من ${t.fromWallet.name}`}`,
      by: t.createdBy?.name ?? null,
      amountSdg: dec((outflow ? t.fromAmount : t.toAmount).toString())
        .times(sign(outflow, back))
        .toFixed(0),
    });
  }
  for (const f of funding) {
    const back = f.voidShiftId === shiftId;
    moves.push({
      id: f.id,
      at: back ? (f.voidedAt ?? f.contributedAt) : f.createdAt,
      label: `${back ? "أُلغي " : ""}مال دخل المحل · ${f.partnerName}`,
      by: f.createdBy?.name ?? null,
      amountSdg: dec(f.amount.toString()).times(sign(false, back)).toFixed(0),
    });
  }
  return moves.sort((x, y) => x.at.getTime() - y.at.getTime());
}

/** ملخص الوردية: المبيعات، المقبوض بكل طريقة، الخصومات، وكل ما دخل الخزنة أو خرج منها، والنقد المتوقع. */
export async function shiftSummary(shiftId: string) {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: {
      user: { select: { name: true } },
      sales: {
        orderBy: { createdAt: "desc" },
        include: { payments: true, customer: { select: { phone: true } } },
      },
    },
  });
  if (!shift) return null;
  const payments = shift.sales.flatMap((s) => s.payments);
  const bankak = sum(payments.filter((p) => p.method === "BANKAK").map((p) => p.amountSdg.toString()));
  const discounts = sum(
    shift.sales.map((s) => dec(s.lineDiscountSdg.toString()).plus(s.invoiceDiscountSdg.toString())),
  );
  const total = sum(shift.sales.map((s) => s.totalSdg.toString()));
  const refunds = await prisma.returnRefund.findMany({ where: { shiftId, method: "BANKAK" } });
  const bankakOut = sum(refunds.map((r) => r.amountSdg.toString()));
  const returnsCount = await prisma.saleReturn.count({ where: { shiftId } });
  const [c, moves] = await Promise.all([
    shiftCash(prisma, shiftId, shift.openingCashSdg.toString()),
    shiftMoves(shiftId),
  ]);
  const expected = shift.expectedCashSdg?.toString() ?? c.expected.toString();
  return {
    id: shift.id,
    userId: shift.userId,
    userName: shift.user.name,
    openedAt: shift.openedAt,
    closedAt: shift.closedAt,
    openingCashSdg: shift.openingCashSdg.toString(),
    // عدّ الفتح (D-146): الفرق بين المعدود ورصيد الخزنة في النظام
    openingDiffSdg:
      shift.openingSystemSdg && !shift.openingSystemSdg.equals(shift.openingCashSdg)
        ? dec(shift.openingCashSdg.toString()).minus(shift.openingSystemSdg.toString()).toString()
        : null,
    openingNote: shift.openingNote,
    salesCount: shift.sales.length,
    totalSdg: total.toString(),
    cashSdg: c.salesCashSdg.plus(c.orderCashSdg).toString(),
    orderCashSdg: c.orderCashSdg.toString(),
    bankakSdg: bankak.toString(),
    returnsCount,
    cashRefundsSdg: c.refundsSdg.toString(),
    expensesSdg: c.expensesSdg.toString(),
    supplierPaymentsSdg: c.supplierPaymentsSdg.toString(),
    shipmentCostsSdg: c.shipmentCostsSdg.toString(),
    transfersOutSdg: c.transfersOutSdg.toString(),
    moneyInSdg: c.moneyInSdg.plus(c.transfersInSdg).toString(),
    voidedNetSdg: c.voidedBackSdg.minus(c.voidedOutSdg).toString(),
    bankakRefundsSdg: bankakOut.toString(),
    discountsSdg: discounts.toString(),
    expectedCashSdg: expected,
    countedCashSdg: shift.countedCashSdg?.toString() ?? null,
    differenceSdg: shift.countedCashSdg ? dec(shift.countedCashSdg.toString()).minus(expected).toString() : null,
    closeNote: shift.closeNote,
    moves: moves.map((m) => ({ ...m, at: m.at })),
    sales: shift.sales.map((s) => ({
      id: s.id,
      number: s.number,
      totalSdg: s.totalSdg.toString(),
      discountSdg: dec(s.lineDiscountSdg.toString()).plus(s.invoiceDiscountSdg.toString()).toString(),
      approved: !!s.approvedById,
      customerPhone: s.customer?.phone ?? null,
      createdAt: s.createdAt,
    })),
  };
}

/**
 * إغلاق الوردية: النقد المعدود مقابل المتوقع (الافتتاحي + المقبوض نقداً). الفرق يُحفظ
 * ويظهر في التقرير؛ الفرق غير الصفري يحتاج ملاحظة.
 */
export async function closeShift(
  shiftId: string,
  user: { id: string; role: unknown },
  countedCashSdg: string,
  note: string | null,
) {
  // فرق العدّ يُسوّى في رصيد محفظة النقد (D-86)
  const { cash: cashWalletId } = await posWallets();
  // والفرق بالدولار بسعر الجنيه لحظة الإغلاق يدخل ربح الشهر (D-87)
  const closedAt = new Date();
  const sdgPerUsd = await getRateAt("SDG", closedAt);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Shift" WHERE "id" = ${shiftId} FOR UPDATE`;
    const shift = await tx.shift.findUnique({ where: { id: shiftId } });
    // صاحبة الوردية تغلقها، أو المديرة/المالك عند تبديل المناوبة (D-143)
    if (!shift || (shift.userId !== user.id && !roleCan(user.role, { pos: ["approve"] }))) {
      throw new ShiftError("الوردية غير موجودة.");
    }
    if (shift.closedAt) throw new ShiftError("الوردية مغلقة بالفعل.");
    const { expected } = await shiftCash(tx, shiftId, shift.openingCashSdg.toString());
    if (!expected.eq(countedCashSdg) && !note) {
      throw new ShiftError(
        `النقد المعدود يختلف عن المتوقع (${expected.toFixed(0)}) — اكتبي ملاحظة توضح الفرق، أو أعيدي العدّ.`,
      );
    }
    const difference = sdgPerUsd
      ? shiftDifference({ expectedSdg: expected, countedSdg: countedCashSdg, sdgPerUsd })
      : null;
    await tx.shift.update({
      where: { id: shiftId },
      data: {
        closedAt,
        expectedCashSdg: expected.toFixed(2),
        countedCashSdg,
        closeNote: note,
        cashWalletId,
        closeSdgPerUsd: sdgPerUsd,
        differenceUsd: difference?.differenceUsd.toFixed(2) ?? null,
      },
    });
  });
}

export async function listShifts(take = 50) {
  const shifts = await prisma.shift.findMany({
    orderBy: { openedAt: "desc" },
    take,
    include: { user: { select: { name: true } }, _count: { select: { sales: true } } },
  });
  return shifts.map((s) => ({
    id: s.id,
    userName: s.user.name,
    openedAt: s.openedAt,
    closedAt: s.closedAt,
    salesCount: s._count.sales,
    differenceSdg:
      s.countedCashSdg && s.expectedCashSdg
        ? dec(s.countedCashSdg.toString()).minus(s.expectedCashSdg.toString()).toString()
        : null,
  }));
}

/** ورديات آخر أيام بعجز أكبر من حد التنبيه في الضبط (D-87) — للوحة الرئيسية. */
export async function listLargeShortages(days = 7) {
  const { shortageAlertSdg } = await getPosSettings();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const shifts = await prisma.shift.findMany({
    where: { closedAt: { gte: since }, countedCashSdg: { not: null }, expectedCashSdg: { not: null } },
    orderBy: { closedAt: "desc" },
    include: { user: { select: { name: true } } },
  });
  // عجز عدّ الفتح (D-146): الدرج أقل من رصيد الخزنة في النظام عند الاستلام
  const openings = await prisma.shift.findMany({
    where: { openedAt: { gte: since }, openingSystemSdg: { not: null } },
    include: { user: { select: { name: true } } },
  });
  return [
    ...shifts.map((s) => ({
      id: s.id,
      userName: s.user.name,
      closedAt: s.closedAt,
      shortSdg: dec(s.expectedCashSdg?.toString() ?? "0").minus(s.countedCashSdg?.toString() ?? "0"),
      note: s.closeNote,
    })),
    ...openings.map((s) => ({
      id: s.id,
      userName: `${s.user.name} (عند الفتح)`,
      closedAt: s.openedAt,
      shortSdg: dec(s.openingSystemSdg?.toString() ?? "0").minus(s.openingCashSdg.toString()),
      note: s.openingNote,
    })),
  ]
    .filter((s) => s.shortSdg.gt(shortageAlertSdg))
    .map((s) => ({ ...s, shortSdg: s.shortSdg.toFixed(0) }));
}

/** حالة الخزنة لنماذج الصرف (D-143): أي محفظة هي الخزنة، ومع من الوردية والنقد المتوقع الآن. */
export interface SafeStatus {
  cashWalletId: string | null;
  shift: { holder: string; openedAt: string; expectedSdg: string } | null;
}

export async function safeStatus(): Promise<SafeStatus> {
  const cash = await cashWalletId();
  const open = await getOpenShift();
  if (!open) return { cashWalletId: cash, shift: null };
  const { expected } = await shiftCash(prisma, open.id, open.openingCashSdg.toString());
  return {
    cashWalletId: cash,
    shift: { holder: open.user.name, openedAt: open.openedAt.toISOString(), expectedSdg: expected.toFixed(0) },
  };
}
