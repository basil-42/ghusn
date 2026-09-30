import { dec, expectedCash, sum } from "@ghusn/core";
import { Prisma, prisma } from "@ghusn/db";

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
  const cashIn = sum(payments.filter((p) => p.method === "CASH").map((p) => p.amountSdg.toString()));
  const bankak = sum(payments.filter((p) => p.method === "BANKAK").map((p) => p.amountSdg.toString()));
  const discounts = sum(
    shift.sales.map((s) => dec(s.lineDiscountSdg.toString()).plus(s.invoiceDiscountSdg.toString())),
  );
  const total = sum(shift.sales.map((s) => s.totalSdg.toString()));
  const expected = expectedCash(shift.openingCashSdg.toString(), cashIn);
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
    bankakSdg: bankak.toString(),
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
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Shift" WHERE "id" = ${shiftId} FOR UPDATE`;
    const shift = await tx.shift.findUnique({ where: { id: shiftId } });
    if (!shift || shift.userId !== userId) throw new ShiftError("الوردية غير موجودة.");
    if (shift.closedAt) throw new ShiftError("الوردية مغلقة بالفعل.");
    const cash = await tx.salePayment.aggregate({
      where: { method: "CASH", sale: { shiftId } },
      _sum: { amountSdg: true },
    });
    const expected = expectedCash(shift.openingCashSdg.toString(), cash._sum.amountSdg?.toString() ?? "0");
    if (!expected.eq(countedCashSdg) && !note) {
      throw new ShiftError(
        `النقد المعدود يختلف عن المتوقع (${expected.toFixed(0)}) — اكتبي ملاحظة توضح الفرق، أو أعيدي العدّ.`,
      );
    }
    await tx.shift.update({
      where: { id: shiftId },
      data: {
        closedAt: new Date(),
        expectedCashSdg: expected.toFixed(2),
        countedCashSdg,
        closeNote: note,
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
