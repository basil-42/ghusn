import {
  dec,
  discountNotes,
  returnNotes,
  variantLabel,
  type Decimal,
  type DiscountNote,
  type ReturnNote,
} from "@ghusn/core";
import { prisma } from "@ghusn/db";

/**
 * الخصومات والمرتجعات وإلغاءات المتجر لفترة (D-129). المبالغ بالجنيه كما سُجّلت، وما يعادلها بالدولار بسعر
 * يوم كل فاتورة. كل القيم تخرج نصوصاً.
 */

const DAY_MS = 86_400_000;
const usdOf = (sdg: Decimal, rate: { toString(): string }) =>
  dec(rate.toString()).gt(0) ? sdg.div(rate.toString()) : dec(0);

export interface StaffDiscountRow {
  id: string;
  name: string;
  invoices: number;
  discountedInvoices: number;
  /** فواتير بخصم وافقت عليها مديرة (فوق الحد) */
  approvedInvoices: number;
  grossSdg: string;
  discountSdg: string;
  rate: string | null;
}

export interface ProductDiscountRow {
  variantId: string;
  label: string;
  qty: string;
  grossSdg: string;
  discountSdg: string;
  rate: string | null;
}

export interface InvoiceDiscountRow {
  id: string;
  number: string;
  createdAt: Date;
  cashier: string;
  approvedBy: string | null;
  grossSdg: string;
  discountSdg: string;
  rate: string;
}

export interface DiscountReport {
  invoices: number;
  discountedInvoices: number;
  grossSdg: string;
  lineDiscountSdg: string;
  invoiceDiscountSdg: string;
  discountSdg: string;
  discountUsd: string;
  rate: string | null;
  staff: StaffDiscountRow[];
  products: ProductDiscountRow[];
  largest: InvoiceDiscountRow[];
  notes: DiscountNote[];
}

export async function discountReport(range: { start: Date; end: Date }): Promise<DiscountReport> {
  const within = { gte: range.start, lt: range.end };
  const [sales, lines] = await Promise.all([
    prisma.sale.findMany({
      where: { createdAt: within },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        number: true,
        createdAt: true,
        subtotalSdg: true,
        lineDiscountSdg: true,
        invoiceDiscountSdg: true,
        sdgPerUsd: true,
        approvedById: true,
        cashier: { select: { id: true, name: true } },
        approvedBy: { select: { name: true } },
      },
    }),
    prisma.saleLine.findMany({
      where: { sale: { createdAt: within }, OR: [{ lineDiscountSdg: { gt: 0 } }, { invoiceDiscountSdg: { gt: 0 } }] },
      select: {
        variantId: true,
        label: true,
        qty: true,
        unitPriceSdg: true,
        lineDiscountSdg: true,
        invoiceDiscountSdg: true,
      },
    }),
  ]);

  let gross = dec(0);
  let lineDisc = dec(0);
  let invDisc = dec(0);
  let usd = dec(0);
  const staff = new Map<
    string,
    { name: string; invoices: number; discounted: number; approved: number; gross: Decimal; discount: Decimal }
  >();
  const invoices: InvoiceDiscountRow[] = [];
  for (const s of sales) {
    const g = dec(s.subtotalSdg.toString());
    const d = dec(s.lineDiscountSdg.toString()).plus(s.invoiceDiscountSdg.toString());
    gross = gross.plus(g);
    lineDisc = lineDisc.plus(s.lineDiscountSdg.toString());
    invDisc = invDisc.plus(s.invoiceDiscountSdg.toString());
    usd = usd.plus(usdOf(d, s.sdgPerUsd));
    const row = staff.get(s.cashier.id) ?? {
      name: s.cashier.name,
      invoices: 0,
      discounted: 0,
      approved: 0,
      gross: dec(0),
      discount: dec(0),
    };
    row.invoices += 1;
    row.gross = row.gross.plus(g);
    if (d.gt(0)) {
      row.discounted += 1;
      row.discount = row.discount.plus(d);
      if (s.approvedById) row.approved += 1;
      invoices.push({
        id: s.id,
        number: s.number,
        createdAt: s.createdAt,
        cashier: s.cashier.name,
        approvedBy: s.approvedBy?.name ?? null,
        grossSdg: g.toFixed(2),
        discountSdg: d.toFixed(2),
        rate: g.gt(0) ? d.div(g).toFixed(4) : "0",
      });
    }
    staff.set(s.cashier.id, row);
  }

  const products = new Map<string, { label: string; qty: Decimal; gross: Decimal; discount: Decimal }>();
  for (const l of lines) {
    const p = products.get(l.variantId) ?? { label: l.label, qty: dec(0), gross: dec(0), discount: dec(0) };
    p.qty = p.qty.plus(l.qty.toString());
    p.gross = p.gross.plus(dec(l.unitPriceSdg.toString()).mul(l.qty.toString()));
    p.discount = p.discount.plus(l.lineDiscountSdg.toString()).plus(l.invoiceDiscountSdg.toString());
    products.set(l.variantId, p);
  }

  const discount = lineDisc.plus(invDisc);
  const staffRows = [...staff.entries()]
    .map(([id, s]) => ({
      id,
      name: s.name,
      invoices: s.invoices,
      discountedInvoices: s.discounted,
      approvedInvoices: s.approved,
      grossSdg: s.gross.toFixed(2),
      discountSdg: s.discount.toFixed(2),
      rate: s.gross.gt(0) ? s.discount.div(s.gross).toFixed(4) : null,
    }))
    .sort((a, b) => dec(b.discountSdg).comparedTo(a.discountSdg));
  return {
    invoices: sales.length,
    discountedInvoices: invoices.length,
    grossSdg: gross.toFixed(2),
    lineDiscountSdg: lineDisc.toFixed(2),
    invoiceDiscountSdg: invDisc.toFixed(2),
    discountSdg: discount.toFixed(2),
    discountUsd: usd.toFixed(2),
    rate: gross.gt(0) ? discount.div(gross).toFixed(4) : null,
    staff: staffRows,
    products: [...products.entries()]
      .map(([variantId, p]) => ({
        variantId,
        label: p.label,
        qty: p.qty.toFixed(),
        grossSdg: p.gross.toFixed(2),
        discountSdg: p.discount.toFixed(2),
        rate: p.gross.gt(0) ? p.discount.div(p.gross).toFixed(4) : null,
      }))
      .sort((a, b) => dec(b.discountSdg).comparedTo(a.discountSdg))
      .slice(0, 10),
    largest: invoices.sort((a, b) => dec(b.discountSdg).comparedTo(a.discountSdg)).slice(0, 10),
    notes: discountNotes(
      staffRows.map((s) => ({ name: s.name, invoices: s.invoices, grossSdg: s.grossSdg, discountSdg: s.discountSdg })),
    ),
  };
}

// ─── المرتجعات ─────────────────────────────────────────────────────────────

export interface ReturnRow {
  id: string;
  number: string;
  saleNumber: string;
  createdAt: Date;
  cashier: string;
  approvedBy: string | null;
  reasonCode: string | null;
  reason: string | null;
  refundSdg: string;
  isExchange: boolean;
  daysAfterSale: number;
}

export interface ReturnReport {
  count: number;
  exchanges: number;
  refundSdg: string;
  refundUsd: string;
  damagedCostUsd: string;
  /** المسترد ÷ مبيعات المحل في الفترة */
  rate: string | null;
  avgDaysAfterSale: number | null;
  reasons: { code: string | null; count: number; refundSdg: string }[];
  products: {
    variantId: string;
    label: string;
    returnedQty: string;
    damagedQty: string;
    soldQty: string;
    refundSdg: string;
  }[];
  staff: { name: string; count: number; refundSdg: string; approved: number }[];
  wallets: { label: string; amountSdg: string }[];
  recent: ReturnRow[];
  notes: ReturnNote[];
}

export async function returnReport(range: { start: Date; end: Date }): Promise<ReturnReport> {
  const within = { gte: range.start, lt: range.end };
  const [returns, salesTotal, sold] = await Promise.all([
    prisma.saleReturn.findMany({
      where: { createdAt: within },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        number: true,
        createdAt: true,
        reasonCode: true,
        reason: true,
        refundSdg: true,
        refundUsd: true,
        damagedCostUsd: true,
        isExchange: true,
        approvedById: true,
        cashier: { select: { name: true } },
        approvedBy: { select: { name: true } },
        sale: { select: { number: true, createdAt: true } },
        refunds: { select: { amountSdg: true, wallet: { select: { name: true } } } },
        lines: {
          select: {
            qty: true,
            damagedQty: true,
            refundSdg: true,
            saleLine: {
              select: {
                variantId: true,
                label: true,
                variant: { select: { size: true, color: true, volume: true, product: { select: { nameAr: true } } } },
              },
            },
          },
        },
      },
    }),
    prisma.sale.aggregate({ where: { createdAt: within }, _sum: { totalSdg: true } }),
    prisma.saleLine.groupBy({ by: ["variantId"], where: { sale: { createdAt: within } }, _sum: { qty: true } }),
  ]);
  const soldBy = new Map(sold.map((s) => [s.variantId, dec(s._sum.qty?.toString() ?? "0")]));

  let refund = dec(0);
  let refundUsd = dec(0);
  let damaged = dec(0);
  let days = 0;
  const reasons = new Map<string | null, { count: number; refund: Decimal }>();
  const products = new Map<string, { label: string; qty: Decimal; damaged: Decimal; refund: Decimal }>();
  const staff = new Map<string, { count: number; refund: Decimal; approved: number }>();
  const wallets = new Map<string, Decimal>();
  for (const r of returns) {
    const amount = dec(r.refundSdg.toString());
    refund = refund.plus(amount);
    refundUsd = refundUsd.plus(r.refundUsd.toString());
    damaged = damaged.plus(r.damagedCostUsd.toString());
    days += Math.max(0, Math.floor((r.createdAt.getTime() - r.sale.createdAt.getTime()) / DAY_MS));
    const reason = reasons.get(r.reasonCode) ?? { count: 0, refund: dec(0) };
    reason.count += 1;
    reason.refund = reason.refund.plus(amount);
    reasons.set(r.reasonCode, reason);
    const st = staff.get(r.cashier.name) ?? { count: 0, refund: dec(0), approved: 0 };
    st.count += 1;
    st.refund = st.refund.plus(amount);
    if (r.approvedById) st.approved += 1;
    staff.set(r.cashier.name, st);
    // الاستبدال: المبلغ رصيد لفاتورة جديدة، وما صُرف منه نقداً لاحقاً يظهر في محفظته
    const cashed = r.refunds.reduce((a, f) => a.plus(f.amountSdg.toString()), dec(0));
    if (r.isExchange && amount.gt(cashed)) {
      wallets.set("رصيد استبدال", (wallets.get("رصيد استبدال") ?? dec(0)).plus(amount.minus(cashed)));
    }
    for (const f of r.refunds) {
      wallets.set(f.wallet.name, (wallets.get(f.wallet.name) ?? dec(0)).plus(f.amountSdg.toString()));
    }
    for (const l of r.lines) {
      const v = l.saleLine.variant;
      const p = products.get(l.saleLine.variantId) ?? {
        label: [v.product.nameAr, variantLabel(v)].filter(Boolean).join(" · ") || l.saleLine.label,
        qty: dec(0),
        damaged: dec(0),
        refund: dec(0),
      };
      p.qty = p.qty.plus(l.qty.toString());
      p.damaged = p.damaged.plus(l.damagedQty.toString());
      p.refund = p.refund.plus(l.refundSdg.toString());
      products.set(l.saleLine.variantId, p);
    }
  }
  const productRows = [...products.entries()]
    .map(([variantId, p]) => ({
      variantId,
      label: p.label,
      returnedQty: p.qty.toFixed(),
      damagedQty: p.damaged.toFixed(),
      soldQty: (soldBy.get(variantId) ?? dec(0)).toFixed(),
      refundSdg: p.refund.toFixed(2),
    }))
    .sort((a, b) => dec(b.returnedQty).comparedTo(a.returnedQty));
  const reasonRows = [...reasons.entries()]
    .map(([code, r]) => ({ code, count: r.count, refundSdg: r.refund.toFixed(2) }))
    .sort((a, b) => b.count - a.count);
  const salesSdg = dec(salesTotal._sum.totalSdg?.toString() ?? "0");

  return {
    count: returns.length,
    exchanges: returns.filter((r) => r.isExchange).length,
    refundSdg: refund.toFixed(2),
    refundUsd: refundUsd.toFixed(2),
    damagedCostUsd: damaged.toFixed(2),
    rate: salesSdg.gt(0) ? refund.div(salesSdg).toFixed(4) : null,
    avgDaysAfterSale: returns.length ? Math.round(days / returns.length) : null,
    reasons: reasonRows,
    products: productRows.slice(0, 10),
    staff: [...staff.entries()]
      .map(([name, s]) => ({ name, count: s.count, refundSdg: s.refund.toFixed(2), approved: s.approved }))
      .sort((a, b) => b.count - a.count),
    wallets: [...wallets.entries()]
      .map(([label, v]) => ({ label, amountSdg: v.toFixed(2) }))
      .sort((a, b) => dec(b.amountSdg).comparedTo(a.amountSdg)),
    recent: returns.slice(0, 15).map((r) => ({
      id: r.id,
      number: r.number,
      saleNumber: r.sale.number,
      createdAt: r.createdAt,
      cashier: r.cashier.name,
      approvedBy: r.approvedBy?.name ?? null,
      reasonCode: r.reasonCode,
      reason: r.reason,
      refundSdg: dec(r.refundSdg.toString()).toFixed(2),
      isExchange: r.isExchange,
      daysAfterSale: Math.max(0, Math.floor((r.createdAt.getTime() - r.sale.createdAt.getTime()) / DAY_MS)),
    })),
    notes: returnNotes(
      reasonRows.map((r) => ({ code: r.code, count: r.count })),
      productRows.map((p) => ({ label: p.label, returnedQty: p.returnedQty, soldQty: p.soldQty })),
    ),
  };
}

// ─── إلغاءات طلبات المتجر ──────────────────────────────────────────────────

export interface CancellationReport {
  count: number;
  /** أُلغيت بعد دفع (أو جزء منه) */
  afterPayment: number;
  totalSdg: string;
  refundedSdg: string;
  reasons: { reason: string; count: number }[];
}

export async function cancellationReport(range: { start: Date; end: Date }): Promise<CancellationReport> {
  const orders = await prisma.order.findMany({
    where: { status: "CANCELLED", cancelledAt: { gte: range.start, lt: range.end } },
    select: { totalSdg: true, cancelReason: true, payments: { select: { amountSdg: true } } },
  });
  const reasons = new Map<string, number>();
  let total = dec(0);
  let refunded = dec(0);
  let afterPayment = 0;
  for (const o of orders) {
    total = total.plus(o.totalSdg.toString());
    const paid = o.payments.filter((p) => dec(p.amountSdg.toString()).gt(0));
    if (paid.length) afterPayment += 1;
    refunded = refunded.plus(
      o.payments.reduce((a, p) => (dec(p.amountSdg.toString()).lt(0) ? a.minus(p.amountSdg.toString()) : a), dec(0)),
    );
    const key = o.cancelReason?.trim() || "بلا سبب مكتوب";
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }
  return {
    count: orders.length,
    afterPayment,
    totalSdg: total.toFixed(2),
    refundedSdg: refunded.toFixed(2),
    reasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}
