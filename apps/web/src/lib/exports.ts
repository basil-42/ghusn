import { dec, shopDay, shopDayStart, variantLabel, type AdjustmentReason } from "@ghusn/core";
import { prisma } from "@ghusn/db";
import { monthlyReport } from "./reports";
import { REASON_LABELS } from "./stock-adjustments";
import { sheet, type Sheet } from "./xlsx";

/**
 * التصدير إلى Excel (D-117): التقرير الشهري، المبيعات، المصاريف، المخزون وقيمته.
 * كل الأرقام من نفس دوال الشاشات (لا حساب مكرر)، والمبالغ بعملتها وبالدولار.
 */

const MAX_DAYS = 366;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** فترة بأيام المحل [من، إلى] شاملة — الافتراضي الشهر الحالي حتى اليوم. */
export function parseDayRange(params: { from?: string | null; to?: string | null }) {
  const today = shopDay(new Date());
  const toDay = params.to && DAY.test(params.to) ? params.to : today;
  const fromDay = params.from && DAY.test(params.from) ? params.from : `${toDay.slice(0, 7)}-01`;
  const [a, b] = fromDay <= toDay ? [fromDay, toDay] : [toDay, fromDay];
  const start = shopDayStart(a);
  let end = new Date(shopDayStart(b).getTime() + 36 * 3_600_000);
  end = shopDayStart(shopDay(end));
  if ((end.getTime() - start.getTime()) / 86_400_000 > MAX_DAYS) {
    throw new RangeError("الفترة أطول من سنة — اختاري فترة أقصر.");
  }
  return { fromDay: a, toDay: b, start, end };
}

const fmtUsd = (v: string) => dec(v).toFixed(2);

// ---------- التقرير الشهري ----------

export async function monthlyReportSheets(month: string): Promise<Sheet<never>[]> {
  const r = await monthlyReport(month);
  type Line = { label: string; usd: string | null; sdg?: string | null; strong?: boolean };
  const neg = (v: string) => dec(v).neg().toFixed(2);
  const lines: Line[] = [
    {
      label: `المبيعات (${r.salesCount} فاتورة + ${r.ordersCount} طلب متجر)`,
      usd: r.revenueUsd,
      sdg: dec(r.salesSdg).plus(r.ordersSdg).toFixed(0),
    },
    { label: `المرتجعات (${r.returnsCount})`, usd: neg(r.refundUsd), sdg: dec(r.refundSdg).neg().toFixed(0) },
    { label: "صافي المبيعات", usd: r.netRevenueUsd, sdg: r.netSalesSdg, strong: true },
    { label: "تكلفة البضاعة المباعة", usd: neg(r.netCogsUsd) },
    { label: "مجمل الربح", usd: r.grossProfitUsd, strong: true },
    { label: "المصاريف", usd: neg(r.expensesUsd) },
    { label: "خسائر المخزون (سالب = مكسب)", usd: neg(r.stockLossUsd) },
    { label: "فروقات الصندوق", usd: fmtUsd(r.cashDifferenceUsd), sdg: r.cashDifferenceSdg },
    { label: "صافي الربح", usd: r.netProfitUsd, strong: true },
  ];
  const capital: Line[] = [
    { label: "التمويل الكلي", usd: r.capital.totalUsd },
    { label: "الربح التراكمي قبل الشهر", usd: r.capital.profitBeforeUsd },
    { label: "لاسترداد رأس المال هذا الشهر", usd: r.capital.toCapitalThisMonthUsd },
    { label: "المسترد حتى الآن", usd: r.capital.recoveredUsd },
    { label: "المتبقي للاسترداد", usd: r.capital.remainingUsd },
    { label: "قابل للتوزيع هذا الشهر", usd: r.capital.distributableUsd },
    { label: "لكل شريك (25%)", usd: r.capital.perPartnerUsd },
  ];
  return [
    sheet<Line>({
      name: "الربح والخسارة",
      title: `التقرير الشهري — ${month}`,
      columns: [
        { header: "البند", value: (l) => l.label, width: 40 },
        { header: "بالدولار", kind: "usd", value: (l) => l.usd },
        { header: "بالجنيه (للمعلومة)", kind: "sdg", value: (l) => l.sdg ?? null },
      ],
      rows: lines,
      note: r.grossMargin ? `هامش مجمل الربح: ${dec(r.grossMargin).mul(100).toFixed(1)}%` : undefined,
    }),
    sheet<{ name: string; usd: string; original: string }>({
      name: "المصاريف حسب القسم",
      title: `المصاريف — ${month}`,
      columns: [
        { header: "القسم", value: (c) => c.name, width: 28 },
        { header: "بالدولار", kind: "usd", value: (c) => c.usd },
        { header: "المبالغ الأصلية", value: (c) => c.original, width: 36 },
      ],
      rows: r.expensesByCategory.map((c) => ({
        name: c.name,
        usd: c.usd,
        original: c.original.map((o) => `${o.amount} ${o.currencyCode}`).join(" + "),
      })),
      totals: true,
    }),
    sheet<{ label: string; count: number | null; usd: string }>({
      name: "خسائر المخزون",
      title: `خسائر المخزون — ${month} (موجب = خسارة)`,
      columns: [
        { header: "السبب", value: (a) => a.label, width: 32 },
        { header: "العدد", kind: "int", value: (a) => a.count },
        { header: "بالدولار", kind: "usd", value: (a) => a.usd },
      ],
      rows: [
        ...r.adjustmentsByReason.map((a) => ({
          label: REASON_LABELS[a.reason as AdjustmentReason] ?? a.reason,
          count: a.count,
          usd: a.usd,
        })),
        ...(dec(r.stockLossUsd).minus(r.adjustmentsUsd).isZero()
          ? []
          : [
              {
                label: "الشحنات والتكاليف المتأخرة",
                count: null,
                usd: dec(r.stockLossUsd).minus(r.adjustmentsUsd).toFixed(2),
              },
            ]),
      ],
      totals: true,
    }),
    sheet<(typeof r.cashDifferenceByCashier)[number]>({
      name: "فروقات الصندوق",
      title: `فروقات عدّ الورديات — ${month}`,
      columns: [
        { header: "الموظفة", value: (c) => c.name, width: 24 },
        { header: "الورديات", kind: "int", value: (c) => c.shifts },
        { header: "عجز ج.س", kind: "sdg", value: (c) => c.shortSdg },
        { header: "زيادة ج.س", kind: "sdg", value: (c) => c.overSdg },
        { header: "الصافي $", kind: "usd", value: (c) => c.usd },
      ],
      rows: r.cashDifferenceByCashier,
      totals: true,
    }),
    sheet<Line>({
      name: "رأس المال والتوزيع",
      title: `رأس المال والتوزيع — ${month}`,
      columns: [
        { header: "البند", value: (l) => l.label, width: 36 },
        { header: "بالدولار", kind: "usd", value: (l) => l.usd },
      ],
      rows: capital,
    }),
  ];
}

// ---------- المبيعات ----------

const FULFILLMENT = { DELIVERY: "توصيل", PICKUP: "استلام من المحل" } as const;
const ORDER_PAYMENT = { COD: "عند الاستلام", IN_SHOP: "في المحل", BANKAK: "بنكك مسبقاً" } as const;
const SALE_PAYMENT = { CASH: "نقداً", BANKAK: "بنكك", CREDIT: "رصيد استبدال" } as const;

export async function salesSheets(range: { start: Date; end: Date; fromDay: string; toDay: string }) {
  const within = { gte: range.start, lt: range.end };
  const [sales, orders, returns] = await Promise.all([
    prisma.sale.findMany({
      where: { createdAt: within },
      orderBy: { createdAt: "asc" },
      include: {
        cashier: { select: { name: true } },
        approvedBy: { select: { name: true } },
        customer: { select: { phone: true, name: true } },
        payments: { select: { method: true, amountSdg: true } },
        returns: { select: { refundSdg: true } },
        lines: {
          select: {
            variantId: true,
            label: true,
            qty: true,
            netSdg: true,
            costUsd: true,
            variant: { select: { sku: true, product: { select: { category: { select: { nameAr: true } } } } } },
          },
        },
      },
    }),
    prisma.order.findMany({
      where: { status: "DELIVERED", deliveredAt: within },
      orderBy: { deliveredAt: "asc" },
      include: {
        customer: { select: { phone: true } },
        lines: {
          select: {
            variantId: true,
            label: true,
            qty: true,
            lineTotalSdg: true,
            unitCostUsd: true,
            variant: { select: { sku: true, product: { select: { category: { select: { nameAr: true } } } } } },
          },
        },
      },
    }),
    prisma.saleReturnLine.findMany({
      where: { saleReturn: { createdAt: within } },
      select: {
        qty: true,
        refundSdg: true,
        saleLine: { select: { variantId: true, label: true, sale: { select: { sdgPerUsd: true } } } },
      },
    }),
  ]);

  // الأصناف: الكمية والإيراد (بسعر جنيه الفاتورة/الطلب) والتكلفة، ثم المرتجع
  type Item = {
    label: string;
    sku: string;
    category: string;
    qty: ReturnType<typeof dec>;
    sdg: ReturnType<typeof dec>;
    usd: ReturnType<typeof dec>;
    cost: ReturnType<typeof dec>;
    returnedQty: ReturnType<typeof dec>;
    returnedSdg: ReturnType<typeof dec>;
    returnedUsd: ReturnType<typeof dec>;
  };
  const items = new Map<string, Item>();
  const item = (id: string, label: string, sku: string, category: string) => {
    let it = items.get(id);
    if (!it) {
      it = {
        label,
        sku,
        category,
        qty: dec(0),
        sdg: dec(0),
        usd: dec(0),
        cost: dec(0),
        returnedQty: dec(0),
        returnedSdg: dec(0),
        returnedUsd: dec(0),
      };
      items.set(id, it);
    }
    return it;
  };
  for (const s of sales) {
    for (const l of s.lines) {
      const it = item(l.variantId, l.label, l.variant.sku, l.variant.product.category.nameAr);
      it.qty = it.qty.plus(l.qty.toString());
      it.sdg = it.sdg.plus(l.netSdg.toString());
      it.usd = it.usd.plus(dec(l.netSdg.toString()).div(s.sdgPerUsd.toString()));
      it.cost = it.cost.plus(l.costUsd.toString());
    }
  }
  for (const o of orders) {
    const rate = o.sdgPerUsd?.toString();
    for (const l of o.lines) {
      const it = item(l.variantId, l.label, l.variant.sku, l.variant.product.category.nameAr);
      it.qty = it.qty.plus(l.qty.toString());
      it.sdg = it.sdg.plus(l.lineTotalSdg.toString());
      if (rate) it.usd = it.usd.plus(dec(l.lineTotalSdg.toString()).div(rate));
      it.cost = it.cost.plus(dec(l.qty.toString()).mul(l.unitCostUsd?.toString() ?? "0"));
    }
  }
  for (const r of returns) {
    const it = item(r.saleLine.variantId, r.saleLine.label, "", "");
    it.returnedQty = it.returnedQty.plus(r.qty.toString());
    it.returnedSdg = it.returnedSdg.plus(r.refundSdg.toString());
    it.returnedUsd = it.returnedUsd.plus(dec(r.refundSdg.toString()).div(r.saleLine.sale.sdgPerUsd.toString()));
  }

  const title = `${range.fromDay} إلى ${range.toDay}`;
  type SaleRow = (typeof sales)[number];
  type OrderRow = (typeof orders)[number];
  return [
    sheet<SaleRow>({
      name: "فواتير المحل",
      title: `فواتير المحل — ${title}`,
      columns: [
        { header: "الفاتورة", value: (s) => s.number, width: 18 },
        { header: "الوقت", kind: "datetime", value: (s) => s.createdAt, width: 18 },
        { header: "البائعة", value: (s) => s.cashier.name, width: 16 },
        { header: "العميل", value: (s) => s.customerName ?? s.customer?.name ?? null, width: 20 },
        { header: "الهاتف", value: (s) => s.customer?.phone ?? null, width: 16 },
        { header: "قبل الخصم ج.س", kind: "sdg", value: (s) => s.subtotalSdg.toString() },
        {
          header: "الخصم ج.س",
          kind: "sdg",
          value: (s) => dec(s.lineDiscountSdg.toString()).plus(s.invoiceDiscountSdg.toString()).toFixed(2),
        },
        { header: "الإجمالي ج.س", kind: "sdg", value: (s) => s.totalSdg.toString() },
        {
          header: "الدفع",
          value: (s) =>
            s.payments.map((p) => `${SALE_PAYMENT[p.method]} ${dec(p.amountSdg.toString()).toFixed(0)}`).join(" + "),
          width: 26,
        },
        {
          header: "مرتجع ج.س",
          kind: "sdg",
          value: (s) => s.returns.reduce((a, r) => a.plus(r.refundSdg.toString()), dec(0)).toFixed(2),
        },
        { header: "سعر الجنيه", kind: "rate", value: (s) => s.sdgPerUsd.toString() },
        { header: "الإيراد $", kind: "usd", value: (s) => s.revenueUsd.toString() },
        { header: "التكلفة $", kind: "usd", value: (s) => s.cogsUsd.toString() },
        {
          header: "الربح $",
          kind: "usd",
          value: (s) => dec(s.revenueUsd.toString()).minus(s.cogsUsd.toString()).toFixed(2),
        },
        { header: "بموافقة", value: (s) => s.approvedBy?.name ?? null, width: 14 },
      ],
      rows: sales,
      totals: true,
    }),
    sheet<OrderRow>({
      name: "طلبات المتجر",
      title: `طلبات المتجر المسلّمة — ${title}`,
      columns: [
        { header: "الطلب", value: (o) => o.number, width: 18 },
        { header: "تاريخ الطلب", kind: "datetime", value: (o) => o.createdAt, width: 18 },
        { header: "التسليم", kind: "datetime", value: (o) => o.deliveredAt, width: 18 },
        { header: "العميل", value: (o) => o.customerName, width: 20 },
        { header: "الهاتف", value: (o) => o.customer.phone, width: 16 },
        { header: "الاستلام", value: (o) => FULFILLMENT[o.fulfillment] },
        { header: "الدفع", value: (o) => ORDER_PAYMENT[o.paymentMethod] },
        { header: "الإجمالي ج.س", kind: "sdg", value: (o) => o.totalSdg.toString() },
        { header: "سعر الجنيه", kind: "rate", value: (o) => o.sdgPerUsd?.toString() ?? null },
        { header: "الإيراد $", kind: "usd", value: (o) => o.revenueUsd?.toString() ?? null },
        { header: "التكلفة $", kind: "usd", value: (o) => o.cogsUsd?.toString() ?? null },
        {
          header: "الربح $",
          kind: "usd",
          value: (o) =>
            dec(o.revenueUsd?.toString() ?? "0")
              .minus(o.cogsUsd?.toString() ?? "0")
              .toFixed(2),
        },
      ],
      rows: orders,
      totals: true,
    }),
    sheet<Item>({
      name: "الأصناف المباعة",
      title: `الأصناف المباعة — ${title}`,
      columns: [
        { header: "الصنف", value: (i) => i.label, width: 34 },
        { header: "SKU", value: (i) => i.sku || null, width: 14 },
        { header: "القسم", value: (i) => i.category || null, width: 16 },
        { header: "الكمية", kind: "qty", value: (i) => i.qty.toFixed() },
        { header: "الإيراد ج.س", kind: "sdg", value: (i) => i.sdg.toFixed(2) },
        { header: "الإيراد $", kind: "usd", value: (i) => i.usd.toFixed(2) },
        { header: "التكلفة $", kind: "usd", value: (i) => i.cost.toFixed(2) },
        { header: "الربح $", kind: "usd", value: (i) => i.usd.minus(i.cost).toFixed(2) },
        { header: "كمية مرتجعة", kind: "qty", value: (i) => i.returnedQty.toFixed() },
        { header: "مرتجع ج.س", kind: "sdg", value: (i) => i.returnedSdg.toFixed(2) },
        { header: "مرتجع $", kind: "usd", value: (i) => i.returnedUsd.toFixed(2) },
      ],
      rows: [...items.values()].sort((a, b) => b.usd.minus(b.cost).cmp(a.usd.minus(a.cost))),
      totals: true,
      note: "الربح قبل المرتجعات؛ المرتجع في أعمدته بتاريخ المرتجع. الطلبات تُحسب عند التسليم.",
    }),
  ];
}

// ---------- المصاريف ----------

export async function expenseSheets(range: { start: Date; end: Date; fromDay: string; toDay: string }) {
  const rows = await prisma.expense.findMany({
    where: { spentAt: { gte: range.start, lt: range.end } },
    orderBy: { spentAt: "asc" },
    include: {
      category: { select: { name: true } },
      wallet: { select: { name: true } },
      createdBy: { select: { name: true } },
      voidedBy: { select: { name: true } },
    },
  });
  type Row = (typeof rows)[number];
  return [
    sheet<Row>({
      name: "المصاريف",
      title: `المصاريف — ${range.fromDay} إلى ${range.toDay} (الإجمالي بلا الملغى)`,
      columns: [
        { header: "الرقم", value: (e) => e.number, width: 16 },
        { header: "التاريخ", kind: "datetime", value: (e) => e.spentAt, width: 18 },
        { header: "القسم", value: (e) => e.category.name, width: 20 },
        { header: "المبلغ", kind: "amount", value: (e) => e.amount.toString() },
        { header: "العملة", value: (e) => e.currencyCode, width: 8 },
        { header: "السعر (وحدة/دولار)", kind: "rate", value: (e) => e.rateUsed.toString() },
        { header: "بالدولار", kind: "usd", value: (e) => (e.voidedAt ? "0" : e.amountUsd.toString()) },
        { header: "المحفظة", value: (e) => e.wallet.name, width: 16 },
        { header: "من سجّل", value: (e) => e.createdBy?.name ?? null, width: 14 },
        { header: "من الوردية", value: (e) => (e.shiftId ? "نعم" : null), width: 10 },
        { header: "ملاحظة", value: (e) => e.note, width: 30 },
        {
          header: "ملغى",
          value: (e) => (e.voidedAt ? `ملغى — ${e.voidedBy?.name ?? ""}: ${e.voidReason ?? ""}` : null),
          width: 30,
        },
      ],
      rows,
      totals: true,
      note: "عمود «المبلغ» بعملات مختلفة — اجمعي «بالدولار» فقط. الملغى بقيمة 0 في عمود الدولار.",
    }),
  ];
}

// ---------- المخزون ----------

export async function stockSheets() {
  const variants = await prisma.productVariant.findMany({
    where: { deletedAt: null, product: { deletedAt: null } },
    orderBy: [{ product: { nameAr: "asc" } }, { sortOrder: "asc" }],
    include: {
      product: { select: { nameAr: true, type: true, category: { select: { nameAr: true } } } },
      stockLevel: true,
    },
  });
  const rows = variants.map((v) => {
    const qty = dec(v.stockLevel?.qty.toString() ?? "0");
    const avg = dec(v.stockLevel?.avgCostUsd.toString() ?? "0");
    const price = v.priceSdg ? dec(v.priceSdg.toString()) : null;
    return {
      label: [v.product.nameAr, variantLabel(v)].filter(Boolean).join(" · "),
      sku: v.sku,
      barcode: v.barcode,
      category: v.product.category.nameAr,
      type: v.product.type === "MATERIAL" ? "مادة تغليف" : "بضاعة",
      qty,
      avg,
      valueUsd: qty.gt(0) ? qty.mul(avg).toDecimalPlaces(2) : dec(0),
      priceSdg: price,
      saleValueSdg: price && qty.gt(0) ? qty.mul(price) : null,
    };
  });
  type Row = (typeof rows)[number];
  return [
    sheet<Row>({
      name: "المخزون",
      title: `المخزون وقيمته — ${shopDay(new Date())}`,
      columns: [
        { header: "الصنف", value: (r) => r.label, width: 36 },
        { header: "SKU", value: (r) => r.sku, width: 14 },
        { header: "الباركود", value: (r) => r.barcode, width: 16 },
        { header: "القسم", value: (r) => r.category, width: 16 },
        { header: "النوع", value: (r) => r.type, width: 12 },
        { header: "الرصيد", kind: "qty", value: (r) => r.qty.toFixed() },
        { header: "متوسط التكلفة $", kind: "unitUsd", value: (r) => r.avg.toFixed() },
        { header: "القيمة $", kind: "usd", value: (r) => r.valueUsd.toFixed(2) },
        { header: "سعر البيع ج.س", kind: "sdg", value: (r) => r.priceSdg?.toFixed() ?? null },
        { header: "قيمة البيع المتوقعة ج.س", kind: "sdg", value: (r) => r.saleValueSdg?.toFixed() ?? null },
      ],
      rows,
      totals: true,
      note: "القيمة بالمتوسط المرجّح للتكلفة؛ الرصيد السالب لا يُحسب في القيمة.",
    }),
  ];
}
