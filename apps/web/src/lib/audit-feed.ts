import { dec, estimateAdjustmentUsd, shopDay, shopDayStart } from "@ghusn/core";
import { prisma } from "@ghusn/db";
import { formatAmount } from "./format";
import { ORDER_STATUS_LABELS } from "./orders";
import { REASON_LABELS as PRICE_REASONS } from "./pricing";
import { getPosSettings, getStockSettings } from "./settings";
import { COST_LABELS } from "./shipments";
import { REASON_LABELS as ADJ_REASONS } from "./stock-adjustments";

/**
 * سجل التدقيق الموحّد (D-114): يُقرأ من الجداول التي تسجّل أصلاً من فعل ماذا ومتى (الأسعار، سعر
 * الصرف، المخزون، المال، نقطة البيع، الطلبات) ومن AuditEvent لما لا يُسجَّل في غيره. لا نسخ للبيانات —
 * كل حدث يُعرض من مصدره، فيشمل بأثر رجعي كل ما سُجّل منذ البداية. للمالك فقط.
 */

export const AUDIT_CATEGORIES = ["money", "prices", "stock", "pos", "orders", "users"] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];
export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  money: "المال",
  prices: "الأسعار",
  stock: "المخزون",
  pos: "نقطة البيع",
  orders: "الطلبات",
  users: "المستخدمون والضبط",
};

export interface FeedItem {
  id: string;
  at: Date;
  category: AuditCategory;
  kind: string;
  title: string;
  detail: string | null;
  /** «هبة ← سارة»: من فعل ← من اعتمد. */
  actors: string | null;
  actorIds: string[];
  href: string | null;
  sensitive: boolean;
}

export interface FeedFilter {
  from: Date;
  to: Date;
  category?: AuditCategory;
  actorId?: string;
  attentionOnly?: boolean;
}

const sdg = (v: { toString(): string }) => `${formatAmount(v, 0)} ج.س`;
const money = (v: { toString(): string }, cur: string) => `${formatAmount(v, cur === "SDG" ? 0 : 2)} ${cur}`;
const usd = (v: { toString(): string }) => `${formatAmount(dec(v.toString()).abs().toFixed(2))} $`;
const join = (...p: (string | null | undefined | false)[]) => p.filter(Boolean).join(" · ") || null;
const who = (...names: (string | null | undefined)[]) => {
  const n = names.filter(Boolean) as string[];
  return n.length ? [...new Set(n)].join(" ← ") : null;
};
/** حدّ كل مصدر في الفترة — يكفي أسابيع عمل محل واحد. */
const TAKE = 400;

export async function auditFeed(f: FeedFilter): Promise<FeedItem[]> {
  const range = { gte: f.from, lt: f.to };
  const [pos, stockSettings] = await Promise.all([getPosSettings(), getStockSettings()]);
  const want = (c: AuditCategory) => !f.category || f.category === c;
  const items: FeedItem[] = [];
  const push = (i: FeedItem) => items.push(i);
  const tasks: Promise<void>[] = [];

  if (want("money")) {
    tasks.push(
      prisma.expense
        .findMany({
          where: { OR: [{ createdAt: range }, { voidedAt: range }] },
          take: TAKE,
          include: {
            category: { select: { name: true } },
            createdBy: { select: { name: true } },
            voidedBy: { select: { name: true } },
          },
        })
        .then((rows) => {
          for (const e of rows) {
            if (e.createdAt >= f.from && e.createdAt < f.to)
              push({
                id: `exp:${e.id}`,
                at: e.createdAt,
                category: "money",
                kind: "EXPENSE",
                title: `مصروف · ${e.category.name}`,
                detail: join(money(e.amount, e.currencyCode), e.note, e.number),
                actors: who(e.createdBy?.name),
                actorIds: [e.createdById].filter(Boolean) as string[],
                href: "/admin/expenses",
                sensitive: false,
              });
            if (e.voidedAt && e.voidedAt >= f.from && e.voidedAt < f.to)
              push({
                id: `expv:${e.id}`,
                at: e.voidedAt,
                category: "money",
                kind: "EXPENSE_VOID",
                title: `إلغاء مصروف · ${e.number}`,
                detail: join(
                  `${e.category.name} ${money(e.amount, e.currencyCode)}`,
                  e.voidReason && `«${e.voidReason}»`,
                ),
                actors: who(e.voidedBy?.name),
                actorIds: [e.voidedById].filter(Boolean) as string[],
                href: "/admin/expenses",
                sensitive: true,
              });
          }
        }),
      prisma.supplierLedgerEntry
        .findMany({
          where: { kind: { not: "PURCHASE" }, OR: [{ createdAt: range }, { voidedAt: range }] },
          take: TAKE,
          include: {
            supplier: { select: { id: true, name: true } },
            createdBy: { select: { name: true } },
            voidedBy: { select: { name: true } },
          },
        })
        .then((rows) => {
          for (const e of rows) {
            const label = e.kind === "PAYMENT" ? "دفعة لمورد" : "رصيد افتتاحي لمورد";
            const href = `/admin/suppliers/${e.supplier.id}`;
            if (e.createdAt >= f.from && e.createdAt < f.to)
              push({
                id: `sup:${e.id}`,
                at: e.createdAt,
                category: "money",
                kind: "SUPPLIER_ENTRY",
                title: `${label} · ${e.supplier.name}`,
                detail: join(money(e.amount, e.currencyCode), e.reference, e.note),
                actors: who(e.createdBy?.name),
                actorIds: [e.createdById].filter(Boolean) as string[],
                href,
                sensitive: false,
              });
            if (e.voidedAt && e.voidedAt >= f.from && e.voidedAt < f.to)
              push({
                id: `supv:${e.id}`,
                at: e.voidedAt,
                category: "money",
                kind: "SUPPLIER_VOID",
                title: `إلغاء ${label} · ${e.supplier.name}`,
                detail: join(money(e.amount, e.currencyCode), e.voidReason && `«${e.voidReason}»`),
                actors: who(e.voidedBy?.name),
                actorIds: [e.voidedById].filter(Boolean) as string[],
                href,
                sensitive: true,
              });
          }
        }),
      prisma.shipmentCost
        .findMany({
          where: { OR: [{ createdAt: range }, { voidedAt: range }] },
          take: TAKE,
          include: {
            shipment: { select: { id: true, number: true } },
            createdBy: { select: { name: true } },
            voidedBy: { select: { name: true } },
          },
        })
        .then((rows) => {
          for (const c of rows) {
            const href = `/admin/shipments/${c.shipment.id}`;
            if (c.createdAt >= f.from && c.createdAt < f.to)
              push({
                id: `sc:${c.id}`,
                at: c.createdAt,
                category: "money",
                kind: "SHIPMENT_COST",
                title: `تكلفة شحنة · ${COST_LABELS[c.kind]} · ${c.shipment.number}`,
                detail: join(money(c.amount, c.currencyCode), c.note),
                actors: who(c.createdBy?.name),
                actorIds: [c.createdById].filter(Boolean) as string[],
                href,
                sensitive: false,
              });
            if (c.voidedAt && c.voidedAt >= f.from && c.voidedAt < f.to)
              push({
                id: `scv:${c.id}`,
                at: c.voidedAt,
                category: "money",
                kind: "SHIPMENT_COST_VOID",
                title: `إلغاء تكلفة شحنة · ${c.shipment.number}`,
                detail: join(
                  `${COST_LABELS[c.kind]} ${money(c.amount, c.currencyCode)}`,
                  c.voidReason && `«${c.voidReason}»`,
                ),
                actors: who(c.voidedBy?.name),
                actorIds: [c.voidedById].filter(Boolean) as string[],
                href,
                sensitive: true,
              });
          }
        }),
      prisma.walletTransfer
        .findMany({
          where: { OR: [{ createdAt: range }, { voidedAt: range }] },
          take: TAKE,
          include: {
            fromWallet: { select: { name: true } },
            toWallet: { select: { name: true } },
            createdBy: { select: { name: true } },
            voidedBy: { select: { name: true } },
          },
        })
        .then((rows) => {
          for (const t of rows) {
            const what = `${t.fromWallet.name} ← ${t.toWallet.name}`;
            if (t.createdAt >= f.from && t.createdAt < f.to)
              push({
                id: `trf:${t.id}`,
                at: t.createdAt,
                category: "money",
                kind: "TRANSFER",
                title: `تحويل بين محفظتين · ${t.number}`,
                detail: join(
                  what,
                  `${money(t.fromAmount, t.fromCurrencyCode)} ← ${money(t.toAmount, t.toCurrencyCode)}`,
                ),
                actors: who(t.createdBy?.name),
                actorIds: [t.createdById].filter(Boolean) as string[],
                href: "/admin/wallets",
                sensitive: false,
              });
            if (t.voidedAt && t.voidedAt >= f.from && t.voidedAt < f.to)
              push({
                id: `trfv:${t.id}`,
                at: t.voidedAt,
                category: "money",
                kind: "TRANSFER_VOID",
                title: `إلغاء تحويل · ${t.number}`,
                detail: join(what, t.voidReason && `«${t.voidReason}»`),
                actors: who(t.voidedBy?.name),
                actorIds: [t.voidedById].filter(Boolean) as string[],
                href: "/admin/wallets",
                sensitive: true,
              });
          }
        }),
      prisma.walletAdjustment
        .findMany({
          where: { OR: [{ createdAt: range }, { voidedAt: range }] },
          take: TAKE,
          include: {
            wallet: { select: { name: true } },
            createdBy: { select: { name: true } },
            voidedBy: { select: { name: true } },
          },
        })
        .then((rows) => {
          for (const a of rows) {
            const label = a.kind === "OPENING" ? "رصيد افتتاحي لمحفظة" : "تسوية محفظة";
            if (a.createdAt >= f.from && a.createdAt < f.to)
              push({
                id: `wadj:${a.id}`,
                at: a.createdAt,
                category: "money",
                kind: "WALLET_ADJUSTMENT",
                title: `${label} · ${a.wallet.name}`,
                detail: join(money(a.amount, a.currencyCode), `«${a.reason}»`),
                actors: who(a.createdBy?.name),
                actorIds: [a.createdById].filter(Boolean) as string[],
                href: "/admin/wallets",
                sensitive: a.kind === "MANUAL",
              });
            if (a.voidedAt && a.voidedAt >= f.from && a.voidedAt < f.to)
              push({
                id: `wadjv:${a.id}`,
                at: a.voidedAt,
                category: "money",
                kind: "WALLET_ADJUSTMENT_VOID",
                title: `إلغاء ${label} · ${a.wallet.name}`,
                detail: join(money(a.amount, a.currencyCode), a.voidReason && `«${a.voidReason}»`),
                actors: who(a.voidedBy?.name),
                actorIds: [a.voidedById].filter(Boolean) as string[],
                href: "/admin/wallets",
                sensitive: true,
              });
          }
        }),
      prisma.capitalContribution
        .findMany({ where: { createdAt: range }, take: TAKE, include: { createdBy: { select: { name: true } } } })
        .then((rows) => {
          for (const c of rows)
            push({
              id: `cap:${c.id}`,
              at: c.createdAt,
              category: "money",
              kind: "CAPITAL",
              title: `تمويل · ${c.partnerName}`,
              detail: join(money(c.amount, c.currencyCode), c.note),
              actors: who(c.createdBy?.name),
              actorIds: [c.createdById].filter(Boolean) as string[],
              href: "/admin/capital",
              sensitive: false,
            });
        }),
      prisma.shift
        .findMany({ where: { closedAt: range }, take: TAKE, include: { user: { select: { name: true } } } })
        .then((rows) => {
          for (const s of rows) {
            const diff = dec(s.countedCashSdg?.toString() ?? "0").minus(s.expectedCashSdg?.toString() ?? "0");
            const short = diff.lt(0);
            push({
              id: `shift:${s.id}`,
              at: s.closedAt!,
              category: "money",
              kind: "SHIFT_CLOSE",
              title: diff.isZero() ? "إغلاق وردية مطابقة" : short ? "إغلاق وردية بعجز" : "إغلاق وردية بزيادة",
              detail: join(
                `المتوقع ${sdg(s.expectedCashSdg ?? 0)}`,
                `المعدود ${sdg(s.countedCashSdg ?? 0)}`,
                !diff.isZero() && `${short ? "عجز" : "زيادة"} ${sdg(diff.abs())}`,
                s.closeNote && `«${s.closeNote}»`,
              ),
              actors: who(s.user.name),
              actorIds: [s.userId],
              href: "/admin/sales",
              sensitive: short && diff.abs().gte(pos.shortageAlertSdg),
            });
          }
        }),
    );
  }

  if (want("prices")) {
    tasks.push(
      prisma.priceHistory
        .findMany({
          where: { createdAt: range },
          take: TAKE,
          include: {
            approvedBy: { select: { name: true } },
            variant: {
              select: { size: true, color: true, volume: true, product: { select: { id: true, nameAr: true } } },
            },
          },
        })
        .then((rows) => {
          for (const p of rows) {
            const label = [p.variant.product.nameAr, p.variant.size, p.variant.color, p.variant.volume]
              .filter(Boolean)
              .join(" · ");
            push({
              id: `price:${p.id}`,
              at: p.createdAt,
              category: "prices",
              kind: "PRICE",
              title: `${p.oldPriceSdg ? "تعديل سعر" : "أول سعر"} · ${label}`,
              detail: join(
                p.oldPriceSdg ? `${sdg(p.oldPriceSdg)} ← ${sdg(p.newPriceSdg)}` : sdg(p.newPriceSdg),
                PRICE_REASONS[p.reason],
                p.margin !== null && dec(p.margin.toString()).lt(0) && "تحت التكلفة",
                p.note,
              ),
              actors: who(p.approvedBy.name),
              actorIds: [p.approvedById],
              href: `/admin/products/${p.variant.product.id}`,
              sensitive: p.margin !== null && dec(p.margin.toString()).lt(0),
            });
          }
        }),
      prisma.exchangeRate
        .findMany({ where: { createdAt: range }, take: TAKE, include: { enteredBy: { select: { name: true } } } })
        .then((rows) => {
          for (const r of rows)
            push({
              id: `rate:${r.id}`,
              at: r.createdAt,
              category: "prices",
              kind: "RATE",
              title: `سعر الصرف · ${r.currencyCode}`,
              detail: join(
                `${formatAmount(r.unitsPerUsd, 2)} للدولار`,
                r.source === "ACTUAL_TRANSFER" && "من تحويل فعلي",
              ),
              actors: who(r.enteredBy?.name),
              actorIds: [r.enteredById].filter(Boolean) as string[],
              href: "/admin/exchange-rates",
              sensitive: false,
            });
        }),
    );
  }

  if (want("stock")) {
    tasks.push(
      prisma.stockAdjustment
        .findMany({
          where: { decidedAt: range, countId: null },
          take: TAKE,
          include: {
            requestedBy: { select: { name: true } },
            decidedBy: { select: { name: true } },
            variant: { select: { size: true, color: true, volume: true, product: { select: { nameAr: true } } } },
          },
        })
        .then((rows) => {
          for (const a of rows) {
            const label = [a.variant.product.nameAr, a.variant.size, a.variant.color, a.variant.volume]
              .filter(Boolean)
              .join(" · ");
            const value = a.valueUsd ? dec(a.valueUsd.toString()) : estimateAdjustmentUsd(a.qty.toString(), "0");
            push({
              id: `adj:${a.id}`,
              at: a.decidedAt!,
              category: "stock",
              kind: a.status === "APPROVED" ? "ADJUSTMENT" : "ADJUSTMENT_REJECTED",
              title: `${a.status === "APPROVED" ? "تسوية مخزون" : "رفض تسوية"} · ${ADJ_REASONS[a.reason]} · ${label} ${dec(a.qty.toString()).toFixed()}`,
              detail: join(
                a.number,
                a.note && `«${a.note}»`,
                a.valueUsd && usd(a.valueUsd),
                a.rejectReason && `«${a.rejectReason}»`,
              ),
              actors: who(a.requestedBy.name, a.decidedBy?.name),
              actorIds: [a.requestedById, a.decidedById].filter(Boolean) as string[],
              href: `/admin/stock/adjustments?focus=${a.id}`,
              sensitive:
                a.status === "APPROVED" && (a.reason === "LOST" || value.abs().gt(stockSettings.managerAdjustLimitUsd)),
            });
          }
        }),
      prisma.stockCount
        .findMany({
          where: { decidedAt: range },
          take: TAKE,
          include: {
            category: { select: { nameAr: true } },
            createdBy: { select: { name: true } },
            decidedBy: { select: { name: true } },
            adjustments: { select: { valueUsd: true } },
          },
        })
        .then((rows) => {
          for (const c of rows) {
            const net = c.adjustments.reduce((acc, a) => acc.plus(a.valueUsd?.toString() ?? "0"), dec(0));
            push({
              id: `cnt:${c.id}`,
              at: c.decidedAt!,
              category: "stock",
              kind: c.status === "APPROVED" ? "COUNT" : "COUNT_CANCELLED",
              title: `${c.status === "APPROVED" ? "اعتماد جرد" : "إلغاء جرد"} · ${c.category?.nameAr ?? (c.scope === "FULL" ? "المحل كله" : "عدّ سريع")}`,
              detail: join(
                c.number,
                c.status === "APPROVED" && `${c.adjustments.length} فرق · الصافي ${net.lt(0) ? "−" : "+"}${usd(net)}`,
                c.cancelReason && `«${c.cancelReason}»`,
              ),
              actors: who(c.createdBy.name, c.decidedBy?.name),
              actorIds: [c.createdById, c.decidedById].filter(Boolean) as string[],
              href: `/admin/stock/counts/${c.id}`,
              sensitive: c.status === "APPROVED" && net.abs().gt(stockSettings.managerAdjustLimitUsd),
            });
          }
        }),
      prisma.shipment
        .findMany({
          where: { receivedAt: range },
          take: TAKE,
          include: { supplier: { select: { name: true } }, receivedBy: { select: { name: true } } },
        })
        .then((rows) => {
          for (const s of rows)
            push({
              id: `rcv:${s.id}`,
              at: s.receivedAt!,
              category: "stock",
              kind: "RECEIPT",
              title: `استلام شحنة · ${s.number}`,
              detail: s.supplier.name,
              actors: who(s.receivedBy?.name),
              actorIds: [s.receivedById].filter(Boolean) as string[],
              href: `/admin/shipments/${s.id}`,
              sensitive: false,
            });
        }),
      prisma.stockMovement
        .findMany({
          where: { override: true, createdAt: range },
          take: TAKE,
          include: {
            createdBy: { select: { name: true } },
            sale: { select: { id: true, number: true } },
            variant: { select: { size: true, color: true, volume: true, product: { select: { nameAr: true } } } },
          },
        })
        .then((rows) => {
          for (const m of rows) {
            const label = [m.variant.product.nameAr, m.variant.size, m.variant.color, m.variant.volume]
              .filter(Boolean)
              .join(" · ");
            push({
              id: `ovr:${m.id}`,
              at: m.createdAt,
              category: "stock",
              kind: "OVERRIDE",
              title: `بيع بتجاوز الرصيد · ${label}`,
              detail: join(`الرصيد بعدها ${dec(m.qtyAfter.toString()).toFixed()}`, m.sale?.number),
              actors: who(m.createdBy?.name),
              actorIds: [m.createdById].filter(Boolean) as string[],
              href: m.sale ? `/pos/receipt/${m.sale.id}` : null,
              sensitive: true,
            });
          }
        }),
    );
  }

  if (want("pos")) {
    tasks.push(
      prisma.sale
        .findMany({
          where: { createdAt: range, approvedById: { not: null } },
          take: TAKE,
          include: { cashier: { select: { name: true } }, approvedBy: { select: { name: true } } },
        })
        .then((rows) => {
          for (const s of rows) {
            const discount = dec(s.lineDiscountSdg.toString()).plus(s.invoiceDiscountSdg.toString());
            const pct = dec(s.subtotalSdg.toString()).gt(0)
              ? discount.div(s.subtotalSdg.toString()).mul(100).toDecimalPlaces(0)
              : dec(0);
            const belowCost = dec(s.revenueUsd.toString()).lt(s.cogsUsd.toString());
            push({
              id: `sale:${s.id}`,
              at: s.createdAt,
              category: "pos",
              kind: "SALE_APPROVED",
              title: `${discount.gt(0) ? `خصم ${pct.toFixed()}%` : "بيع"} بموافقة · ${s.number}`,
              detail: join(
                `الصافي ${sdg(s.totalSdg)}`,
                discount.gt(0) && `الخصم ${sdg(discount)}`,
                belowCost && "تحت التكلفة",
              ),
              actors: who(s.cashier.name, s.approvedBy?.name),
              actorIds: [s.cashierId, s.approvedById].filter(Boolean) as string[],
              href: `/pos/receipt/${s.id}`,
              sensitive: true,
            });
          }
        }),
      prisma.saleReturn
        .findMany({
          where: { createdAt: range },
          take: TAKE,
          include: {
            cashier: { select: { name: true } },
            approvedBy: { select: { name: true } },
            sale: { select: { number: true } },
          },
        })
        .then((rows) => {
          for (const r of rows)
            push({
              id: `ret:${r.id}`,
              at: r.createdAt,
              category: "pos",
              kind: "RETURN",
              title: `${r.isExchange ? "استبدال" : "مرتجع"} · ${r.number}`,
              detail: join(
                `من ${r.sale.number}`,
                sdg(r.refundSdg),
                r.approvedById && "بعد مدة المرتجع (بموافقة)",
                r.reason,
              ),
              actors: who(r.cashier.name, r.approvedBy?.name),
              actorIds: [r.cashierId, r.approvedById].filter(Boolean) as string[],
              href: "/admin/sales",
              sensitive: !!r.approvedById,
            });
        }),
    );
  }

  if (want("orders")) {
    tasks.push(
      prisma.orderStatusHistory
        .findMany({
          where: { createdAt: range, actorId: { not: null } },
          take: TAKE,
          include: { actor: { select: { name: true } }, order: { select: { id: true, number: true } } },
        })
        .then((rows) => {
          for (const h of rows) {
            const to = h.toStatus as keyof typeof ORDER_STATUS_LABELS;
            const from = h.fromStatus as keyof typeof ORDER_STATUS_LABELS | null;
            push({
              id: `osh:${h.id}`,
              at: h.createdAt,
              category: "orders",
              kind: to === "CANCELLED" ? "ORDER_CANCELLED" : "ORDER_STATUS",
              title: `${to === "CANCELLED" ? "إلغاء طلب" : "حالة طلب"} · ${h.order.number}`,
              detail: join(
                from ? `${ORDER_STATUS_LABELS[from]} ← ${ORDER_STATUS_LABELS[to]}` : ORDER_STATUS_LABELS[to],
                h.reason && `«${h.reason}»`,
              ),
              actors: who(h.actor?.name),
              actorIds: [h.actorId].filter(Boolean) as string[],
              href: `/admin/orders/${h.order.id}`,
              sensitive: to === "CANCELLED",
            });
          }
        }),
      prisma.orderPayment
        .findMany({
          where: { receivedAt: range, amountSdg: { lt: 0 } },
          take: TAKE,
          include: {
            receivedBy: { select: { name: true } },
            order: { select: { id: true, number: true } },
            wallet: { select: { name: true } },
          },
        })
        .then((rows) => {
          for (const p of rows)
            push({
              id: `ref:${p.id}`,
              at: p.receivedAt,
              category: "orders",
              kind: "ORDER_REFUND",
              title: `رد مبلغ لعميل · ${p.order.number}`,
              detail: join(sdg(dec(p.amountSdg.toString()).abs()), `من «${p.wallet.name}»`, p.reference),
              actors: who(p.receivedBy?.name),
              actorIds: [p.receivedById].filter(Boolean) as string[],
              href: `/admin/orders/${p.order.id}`,
              sensitive: true,
            });
        }),
    );
  }

  if (want("users")) {
    tasks.push(
      prisma.auditEvent
        .findMany({ where: { createdAt: range }, take: TAKE * 2, include: { actor: { select: { name: true } } } })
        .then((rows) => {
          for (const e of rows)
            push({
              id: `ae:${e.id}`,
              at: e.createdAt,
              category:
                e.type === "PRODUCT_UPDATED" || e.type === "PRODUCT_ARCHIVED" || e.type === "CATEGORY_UPDATED"
                  ? "prices"
                  : "users",
              kind: e.type,
              title: e.title,
              detail: e.detail,
              actors: e.type === "LOGIN_FAILED" ? null : who(e.actor?.name),
              actorIds: [e.actorId].filter(Boolean) as string[],
              href: e.href,
              sensitive: e.sensitive,
            });
        }),
    );
  }
  // منتجات وأقسام من AuditEvent تظهر تحت «الأسعار» أيضاً حين يُختار ذلك الفلتر وحده
  if (f.category === "prices") {
    tasks.push(
      prisma.auditEvent
        .findMany({
          where: { createdAt: range, type: { in: ["PRODUCT_UPDATED", "PRODUCT_ARCHIVED", "CATEGORY_UPDATED"] } },
          take: TAKE,
          include: { actor: { select: { name: true } } },
        })
        .then((rows) => {
          for (const e of rows)
            push({
              id: `ae:${e.id}`,
              at: e.createdAt,
              category: "prices",
              kind: e.type,
              title: e.title,
              detail: e.detail,
              actors: who(e.actor?.name),
              actorIds: [e.actorId].filter(Boolean) as string[],
              href: e.href,
              sensitive: e.sensitive,
            });
        }),
    );
  }

  await Promise.all(tasks);
  return items
    .filter((i) => (f.category ? i.category === f.category : true))
    .filter((i) => (f.actorId ? i.actorIds.includes(f.actorId) : true))
    .filter((i) => (f.attentionOnly ? i.sensitive : true))
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** أرقام اللوحة أعلى الصفحة لنفس الفترة. */
export function feedStats(items: FeedItem[]) {
  return {
    total: items.length,
    attention: items.filter((i) => i.sensitive).length,
    voids: items.filter((i) => i.kind.endsWith("_VOID")).length,
    failedLogins: items.filter((i) => i.kind === "LOGIN_FAILED").length,
  };
}

/** عدد ما يستحق الانتباه اليوم — للملخص اليومي. */
export async function attentionCount(from: Date, to: Date): Promise<number> {
  return (await auditFeed({ from, to, attentionOnly: true })).length;
}

// ---------- معاملات الصفحة والتصدير ----------

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** آخر 7 أيام افتراضياً؛ أقصى فترة 92 يوماً. */
const MAX_DAYS = 92;

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface FeedParams {
  from?: string;
  to?: string;
  c?: string;
  actor?: string;
  f?: string;
}

export function parseFeedParams(p: FeedParams, today = shopDay(new Date())) {
  let toDay = p.to && DAY_RE.test(p.to) ? p.to : today;
  if (toDay > today) toDay = today;
  let fromDay = p.from && DAY_RE.test(p.from) ? p.from : addDays(toDay, -6);
  if (fromDay > toDay) fromDay = toDay;
  if (fromDay < addDays(toDay, -(MAX_DAYS - 1))) fromDay = addDays(toDay, -(MAX_DAYS - 1));
  const category = AUDIT_CATEGORIES.includes(p.c as AuditCategory) ? (p.c as AuditCategory) : undefined;
  return {
    fromDay,
    toDay,
    category,
    actorId: p.actor || undefined,
    attentionOnly: p.f === "attention",
    range: { from: shopDayStart(fromDay), to: shopDayStart(addDays(toDay, 1)) },
  };
}
