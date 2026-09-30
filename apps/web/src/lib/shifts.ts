import { dec, expectedCash, shiftDifference, sum } from "@ghusn/core";
import { Prisma, prisma } from "@ghusn/db";
import { getRateAt } from "./exchange-rates";
import { getPosSettings, posWallets } from "./settings";

export class ShiftError extends Error {}

export async function getOpenShift(userId: string) {
  return prisma.shift.findFirst({ where: { userId, closedAt: null } });
}

/** فتح وردية بعهدة نقدية (D-80). وردية مفتوحة واحدة لكل موظفة (فهرس جزئي في القاعدة). */
export async function openShift(userId: string, openingCashSdg: string): Promise<string> {
  try {
    const shift = await prisma.shift.create({ data: { userId, openingCashSdg } });
    return shift.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ShiftError("لديكِ وردية مفتوحة بالفعل.");
    }
    throw e;
  }
}

/** ملخص الوردية: المبيعات، المقبوض بكل طريقة، الخصومات، والنقد المتوقع في الدرج. */
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
  // طلبات المتجر المستلمة من المحل نقداً في هذه الوردية تدخل الدرج (D-88)
  const orderCash = await prisma.orderPayment.aggregate({
    where: { shiftId, channel: "CASH" },
    _sum: { amountSdg: true },
  });
  const orderCashSdg = dec(orderCash._sum.amountSdg?.toString() ?? "0");
  const cashIn = sum(payments.filter((p) => p.method === "CASH").map((p) => p.amountSdg.toString())).plus(orderCashSdg);
  const bankak = sum(payments.filter((p) => p.method === "BANKAK").map((p) => p.amountSdg.toString()));
  const discounts = sum(
    shift.sales.map((s) => dec(s.lineDiscountSdg.toString()).plus(s.invoiceDiscountSdg.toString())),
  );
  const total = sum(shift.sales.map((s) => s.totalSdg.toString()));
  // المرتجعات: ما رُدّ من هذه الوردية (نقداً يخرج من الدرج)
  const refunds = await prisma.returnRefund.findMany({ where: { shiftId } });
  const cashOut = sum(refunds.filter((r) => r.method === "CASH").map((r) => r.amountSdg.toString()));
  const bankakOut = sum(refunds.filter((r) => r.method === "BANKAK").map((r) => r.amountSdg.toString()));
  const returnsCount = await prisma.saleReturn.count({ where: { shiftId } });
  // مصاريف دفعتها الموظفة من الدرج (D-83)
  const drawerExpenses = await prisma.expense.aggregate({ where: { shiftId, voidedAt: null }, _sum: { amount: true } });
  const expensesOut = dec(drawerExpenses._sum.amount?.toString() ?? "0");
  const expected = expectedCash(shift.openingCashSdg.toString(), cashIn, cashOut.plus(expensesOut));
  return {
    id: shift.id,
    userId: shift.userId,
    userName: shift.user.name,
    openedAt: shift.openedAt,
    closedAt: shift.closedAt,
    openingCashSdg: shift.openingCashSdg.toString(),
    salesCount: shift.sales.length,
    totalSdg: total.toString(),
    cashSdg: cashIn.toString(),
    orderCashSdg: orderCashSdg.toString(),
    bankakSdg: bankak.toString(),
    returnsCount,
    cashRefundsSdg: cashOut.toString(),
    expensesSdg: expensesOut.toString(),
    bankakRefundsSdg: bankakOut.toString(),
    discountsSdg: discounts.toString(),
    expectedCashSdg: shift.expectedCashSdg?.toString() ?? expected.toString(),
    countedCashSdg: shift.countedCashSdg?.toString() ?? null,
    differenceSdg: shift.countedCashSdg
      ? dec(shift.countedCashSdg.toString())
          .minus(shift.expectedCashSdg?.toString() ?? expected)
          .toString()
      : null,
    closeNote: shift.closeNote,
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
export async function closeShift(shiftId: string, userId: string, countedCashSdg: string, note: string | null) {
  // فرق العدّ يُسوّى في رصيد محفظة النقد (D-86)
  const { cash: cashWalletId } = await posWallets();
  // والفرق بالدولار بسعر الجنيه لحظة الإغلاق يدخل ربح الشهر (D-87)
  const closedAt = new Date();
  const sdgPerUsd = await getRateAt("SDG", closedAt);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Shift" WHERE "id" = ${shiftId} FOR UPDATE`;
    const shift = await tx.shift.findUnique({ where: { id: shiftId } });
    if (!shift || shift.userId !== userId) throw new ShiftError("الوردية غير موجودة.");
    if (shift.closedAt) throw new ShiftError("الوردية مغلقة بالفعل.");
    const cash = await tx.salePayment.aggregate({
      where: { method: "CASH", sale: { shiftId } },
      _sum: { amountSdg: true },
    });
    const orderCash = await tx.orderPayment.aggregate({
      where: { shiftId, channel: "CASH" },
      _sum: { amountSdg: true },
    });
    const refunds = await tx.returnRefund.aggregate({ where: { method: "CASH", shiftId }, _sum: { amountSdg: true } });
    const expenses = await tx.expense.aggregate({ where: { shiftId, voidedAt: null }, _sum: { amount: true } });
    const expected = expectedCash(
      shift.openingCashSdg.toString(),
      dec(cash._sum.amountSdg?.toString() ?? "0").plus(orderCash._sum.amountSdg?.toString() ?? "0"),
      dec(refunds._sum.amountSdg?.toString() ?? "0").plus(expenses._sum.amount?.toString() ?? "0"),
    );
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
  return shifts
    .map((s) => ({
      id: s.id,
      userName: s.user.name,
      closedAt: s.closedAt,
      shortSdg: dec(s.expectedCashSdg?.toString() ?? "0").minus(s.countedCashSdg?.toString() ?? "0"),
      note: s.closeNote,
    }))
    .filter((s) => s.shortSdg.gt(shortageAlertSdg))
    .map((s) => ({ ...s, shortSdg: s.shortSdg.toFixed(0) }));
}
