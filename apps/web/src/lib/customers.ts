import {
  REPEAT_MIN_PURCHASES,
  averageTicket,
  customerSegment,
  dec,
  normalizeArabic,
  searchTerms,
  shopDay,
  spendShare,
  toLatinDigits,
  vipCustomers,
  type CustomerSegment,
} from "@ghusn/core";
import { prisma, type OrderStatus } from "@ghusn/db";
import { recordAudit } from "./audit";
import { ORDER_STATUS_LABELS } from "./orders";

/**
 * العملاء (D-115): يُسجَّل العميل تلقائياً برقم هاتفه من طلب المتجر أو فاتورة المحل.
 * المشتريات = فواتير المحل + طلبات المتجر المسلّمة. الإنفاق = الفواتير − المرتجعات + الطلبات المسلّمة.
 */

export class CustomerError extends Error {}

export interface CustomerRow {
  id: string;
  phone: string;
  name: string | null;
  createdAt: Date;
  shopCount: number;
  webCount: number;
  purchases: number;
  spendSdg: string;
  spendUsd: string;
  avgSdg: string | null;
  firstAt: Date | null;
  lastAt: Date | null;
  isVip: boolean;
  segment: CustomerSegment | null;
}

type RawRow = {
  id: string;
  phone: string;
  name: string | null;
  order_name: string | null;
  created_at: Date;
  shop_n: number;
  web_n: number;
  spend_sdg: string;
  spend_usd: string;
  first_at: Date | null;
  last_at: Date | null;
};

/** كل العملاء بأرقامهم في استعلام واحد — يكفي لآلاف العملاء؛ الفلترة والترتيب بعده في الذاكرة. */
async function loadRows(): Promise<RawRow[]> {
  return prisma.$queryRaw<RawRow[]>`
    WITH s AS (
      SELECT "customerId" AS id, count(*)::int AS n, sum("totalSdg") AS sdg, sum("revenueUsd") AS usd,
             min("createdAt") AS first_at, max("createdAt") AS last_at
      FROM "Sale" WHERE "customerId" IS NOT NULL GROUP BY 1
    ), r AS (
      SELECT sa."customerId" AS id, sum(rt."refundSdg") AS sdg, sum(rt."refundUsd") AS usd
      FROM "SaleReturn" rt JOIN "Sale" sa ON sa.id = rt."saleId"
      WHERE sa."customerId" IS NOT NULL GROUP BY 1
    ), o AS (
      SELECT "customerId" AS id, count(*)::int AS n, sum("totalSdg") AS sdg, sum(coalesce("revenueUsd", 0)) AS usd,
             min("createdAt") AS first_at, max("createdAt") AS last_at
      FROM "Order" WHERE status = 'DELIVERED' GROUP BY 1
    )
    SELECT c.id, c.phone, c.name, c."createdAt" AS created_at,
      (SELECT "customerName" FROM "Order" WHERE "customerId" = c.id ORDER BY "createdAt" DESC LIMIT 1) AS order_name,
      coalesce(s.n, 0) AS shop_n, coalesce(o.n, 0) AS web_n,
      (coalesce(s.sdg, 0) - coalesce(r.sdg, 0) + coalesce(o.sdg, 0))::text AS spend_sdg,
      (coalesce(s.usd, 0) - coalesce(r.usd, 0) + coalesce(o.usd, 0))::text AS spend_usd,
      least(s.first_at, o.first_at) AS first_at, greatest(s.last_at, o.last_at) AS last_at
    FROM "Customer" c
    LEFT JOIN s ON s.id = c.id LEFT JOIN r ON r.id = c.id LEFT JOIN o ON o.id = c.id
  `;
}

function toRow(r: RawRow, vipIds: ReadonlySet<string>): CustomerRow {
  const purchases = r.shop_n + r.web_n;
  const isVip = vipIds.has(r.id);
  return {
    id: r.id,
    phone: r.phone,
    name: r.name || r.order_name || null,
    createdAt: r.created_at,
    shopCount: r.shop_n,
    webCount: r.web_n,
    purchases,
    spendSdg: dec(r.spend_sdg).toFixed(0),
    spendUsd: dec(r.spend_usd).toFixed(2),
    avgSdg: averageTicket(r.spend_sdg, purchases),
    firstAt: r.first_at,
    lastAt: r.last_at,
    isVip,
    segment: customerSegment(purchases, isVip),
  };
}

export interface DirectoryStats {
  total: number;
  newThisMonth: number;
  repeat: number;
  vip: number;
  vipShare: string | null;
}

export async function customerDirectory(): Promise<{ rows: CustomerRow[]; stats: DirectoryStats }> {
  const raw = await loadRows();
  const values = raw.map((r) => ({ id: r.id, spendUsd: r.spend_usd }));
  const vip = vipCustomers(values);
  const rows = raw.map((r) => toRow(r, vip.ids));
  const month = shopDay(new Date()).slice(0, 7);
  return {
    rows,
    stats: {
      total: rows.length,
      // «جديد هذا الشهر» = أول شراء مكتمل هذا الشهر (لا مجرد طلب لم يُسلَّم)
      newThisMonth: rows.filter((r) => r.firstAt && shopDay(r.firstAt).slice(0, 7) === month).length,
      repeat: rows.filter((r) => r.purchases >= REPEAT_MIN_PURCHASES).length,
      vip: vip.ids.size,
      vipShare: spendShare(values, vip.ids),
    },
  };
}

export const CUSTOMER_FILTERS = ["vip", "repeat", "new"] as const;
export type CustomerFilter = (typeof CUSTOMER_FILTERS)[number];
export const CUSTOMER_SORTS = ["recent", "spend", "purchases"] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export interface DirectoryQuery {
  q?: string;
  filter?: CustomerFilter;
  sort?: CustomerSort;
}

export function parseDirectoryQuery(params: Record<string, string | string[] | undefined>): DirectoryQuery {
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const filter = one("f");
  const sort = one("sort");
  return {
    q: one("q")?.trim().slice(0, 60) || undefined,
    filter: (CUSTOMER_FILTERS as readonly string[]).includes(filter ?? "") ? (filter as CustomerFilter) : undefined,
    sort: (CUSTOMER_SORTS as readonly string[]).includes(sort ?? "") ? (sort as CustomerSort) : undefined,
  };
}

/** البحث بالاسم (عربي موحّد) أو بأي جزء من الرقم (0912… أو 912… أو +249912…). */
export function matchesQuery(row: Pick<CustomerRow, "name" | "phone">, q: string): boolean {
  const digits = toLatinDigits(q).replace(/\D/g, "");
  if (digits.length >= 3 && digits.length === toLatinDigits(q).replace(/[\s+\-()]/g, "").length) {
    const local = digits.replace(/^0+/, "");
    return row.phone.replace(/\D/g, "").includes(local);
  }
  const name = normalizeArabic(row.name ?? "");
  return searchTerms(q).every((t) => name.includes(t));
}

export function filterDirectory(rows: CustomerRow[], query: DirectoryQuery, canSeeValue: boolean): CustomerRow[] {
  let out = rows;
  if (query.q) out = out.filter((r) => matchesQuery(r, query.q!));
  if (query.filter === "vip") out = out.filter((r) => r.isVip);
  if (query.filter === "repeat") out = out.filter((r) => r.purchases >= REPEAT_MIN_PURCHASES);
  if (query.filter === "new") out = out.filter((r) => r.purchases === 1);
  // الموظفة لا ترتّب بالإنفاق (يكشف الترتيب ما أُخفي)
  const sort = query.sort === "spend" && !canSeeValue ? "recent" : (query.sort ?? "recent");
  const time = (d: Date | null) => d?.getTime() ?? 0;
  return [...out].sort((a, b) => {
    if (sort === "spend") return dec(b.spendUsd).cmp(a.spendUsd) || time(b.lastAt) - time(a.lastAt);
    if (sort === "purchases") return b.purchases - a.purchases || time(b.lastAt) - time(a.lastAt);
    // من اشترى أولاً بالأحدث شراءً، ثم من لم يكتمل له شراء بعد بالأحدث تسجيلاً
    if (!a.lastAt !== !b.lastAt) return a.lastAt ? -1 : 1;
    return time(b.lastAt ?? b.createdAt) - time(a.lastAt ?? a.createdAt);
  });
}

// ---------- صفحة العميل ----------

export interface HistoryEntry {
  kind: "SALE" | "ORDER";
  id: string;
  number: string;
  at: Date;
  items: string;
  totalSdg: string;
  /** المرتجع من فاتورة المحل */
  returnedSdg: string | null;
  /** للطلبات: الحالة (المسلّم يُحسب في المشتريات) */
  status: OrderStatus | null;
  statusLabel: string | null;
  by: string | null;
  recipient: string | null;
}

const PAYABLE_EXCLUDED: OrderStatus[] = ["CANCELLED"];

export async function customerProfile(id: string) {
  // حالة «مميز» نسبية لكل العملاء، فتُحسب من القائمة كاملة
  const all = await loadRows();
  const raw = all.find((r) => r.id === id);
  if (!raw) return null;
  const vip = vipCustomers(all.map((r) => ({ id: r.id, spendUsd: r.spend_usd })));
  const row = toRow(raw, vip.ids);

  const [sales, orders, notes] = await Promise.all([
    prisma.sale.findMany({
      where: { customerId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        number: true,
        createdAt: true,
        totalSdg: true,
        cashier: { select: { name: true } },
        returns: { select: { refundSdg: true } },
        lines: {
          orderBy: { sortOrder: "asc" },
          select: {
            label: true,
            qty: true,
            variantId: true,
            variant: { select: { product: { select: { categoryId: true, id: true } } } },
          },
        },
      },
    }),
    prisma.order.findMany({
      where: { customerId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        number: true,
        createdAt: true,
        status: true,
        totalSdg: true,
        recipientName: true,
        recipientPhone: true,
        lines: {
          orderBy: { sortOrder: "asc" },
          select: {
            label: true,
            variantId: true,
            variant: { select: { product: { select: { categoryId: true, id: true } } } },
          },
        },
      },
    }),
    prisma.customerNote.findMany({
      where: { customerId: id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, body: true, createdAt: true, authorId: true, author: { select: { name: true } } },
    }),
  ]);

  const history: HistoryEntry[] = [
    ...sales.map((s) => {
      const returned = s.returns.reduce((a, r) => a.plus(r.refundSdg.toString()), dec(0));
      return {
        kind: "SALE" as const,
        id: s.id,
        number: s.number,
        at: s.createdAt,
        items: s.lines.map((l) => l.label).join("، "),
        totalSdg: dec(s.totalSdg.toString()).toFixed(0),
        returnedSdg: returned.gt(0) ? returned.toFixed(0) : null,
        status: null,
        statusLabel: null,
        by: s.cashier.name,
        recipient: null,
      };
    }),
    ...orders.map((o) => ({
      kind: "ORDER" as const,
      id: o.id,
      number: o.number,
      at: o.createdAt,
      items: o.lines.map((l) => l.label).join("، "),
      totalSdg: dec(o.totalSdg.toString()).toFixed(0),
      returnedSdg: null,
      status: o.status,
      statusLabel: o.status === "DELIVERED" ? null : ORDER_STATUS_LABELS[o.status],
      by: null,
      recipient: o.recipientName,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  // ما يحبه: من الفواتير والطلبات غير الملغاة
  const lines = [
    ...sales.flatMap((s) => s.lines),
    ...orders.filter((o) => !PAYABLE_EXCLUDED.includes(o.status)).flatMap((o) => o.lines),
  ];
  const productIds = [...new Set(lines.map((l) => l.variant.product.id))];
  const [categories, occasions] = await Promise.all([
    prisma.category.findMany({
      where: { id: { in: [...new Set(lines.map((l) => l.variant.product.categoryId))] } },
      select: { id: true, nameAr: true },
    }),
    productIds.length
      ? prisma.productOccasion.findMany({
          where: { productId: { in: productIds }, occasion: { isActive: true } },
          select: { productId: true, occasion: { select: { id: true, nameAr: true } } },
        })
      : Promise.resolve([]),
  ]);
  const catName = new Map(categories.map((c) => [c.id, c.nameAr]));
  const byCategory = countBy(lines.map((l) => catName.get(l.variant.product.categoryId) ?? "—"));
  const byItem = countBy(lines.map((l) => l.label));
  const occasionsByProduct = new Map<string, string[]>();
  for (const po of occasions) {
    occasionsByProduct.set(po.productId, [...(occasionsByProduct.get(po.productId) ?? []), po.occasion.nameAr]);
  }
  const byOccasion = countBy(lines.flatMap((l) => occasionsByProduct.get(l.variant.product.id) ?? []));

  // لمن يهدي: المستلمون في طلبات الهدايا (غير الملغاة) — يُجمَّع بالرقم أو بالاسم
  const recipients = new Map<string, { name: string; count: number; lastAt: Date }>();
  for (const o of orders) {
    if (!o.recipientName || PAYABLE_EXCLUDED.includes(o.status)) continue;
    const key = o.recipientPhone?.replace(/\D/g, "") || normalizeArabic(o.recipientName);
    const r = recipients.get(key);
    if (r) {
      r.count += 1;
      if (o.createdAt > r.lastAt) r.lastAt = o.createdAt;
    } else recipients.set(key, { name: o.recipientName, count: 1, lastAt: o.createdAt });
  }

  return {
    customer: row,
    history,
    notes: notes.map((n) => ({
      id: n.id,
      body: n.body,
      createdAt: n.createdAt,
      authorId: n.authorId,
      authorName: n.author.name,
    })),
    likes: {
      categories: byCategory.slice(0, 6),
      topItem: byItem[0] && byItem[0].count > 1 ? byItem[0] : null,
    },
    recipients: [...recipients.values()].sort((a, b) => b.count - a.count || b.lastAt.getTime() - a.lastAt.getTime()),
    occasions: byOccasion.slice(0, 5),
  };
}

export type CustomerProfile = NonNullable<Awaited<ReturnType<typeof customerProfile>>>;

function countBy(values: string[]): { label: string; count: number }[] {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

// ---------- التعديل ----------

export async function renameCustomer(id: string, name: string, actorId: string): Promise<void> {
  const clean = name.trim().replace(/\s+/g, " ");
  const before = await prisma.customer.findUnique({ where: { id }, select: { name: true, phone: true } });
  if (!before) throw new CustomerError("العميل غير موجود.");
  if ((before.name ?? "") === clean) return;
  await prisma.customer.update({ where: { id }, data: { name: clean || null } });
  await recordAudit({
    type: "CUSTOMER_UPDATED",
    actorId,
    title: `تعديل اسم عميل · ${clean || "بلا اسم"}`,
    href: `/admin/customers/${id}`,
    changes: [{ field: "الاسم", before: before.name ?? "—", after: clean || "—" }],
  });
}

export async function addCustomerNote(customerId: string, body: string, authorId: string): Promise<void> {
  const exists = await prisma.customer.count({ where: { id: customerId } });
  if (!exists) throw new CustomerError("العميل غير موجود.");
  await prisma.customerNote.create({ data: { customerId, body: body.trim(), authorId } });
}

/** تحذف الملاحظةَ كاتبتُها، أو من يملك صلاحية رؤية القيمة (المالك والمديرة). حذف ناعم. */
export async function deleteCustomerNote(noteId: string, actor: { id: string; canModerate: boolean }) {
  const note = await prisma.customerNote.findUnique({
    where: { id: noteId },
    select: { authorId: true, deletedAt: true, customerId: true },
  });
  if (!note || note.deletedAt) throw new CustomerError("الملاحظة غير موجودة.");
  if (note.authorId !== actor.id && !actor.canModerate) throw new CustomerError("تحذف الملاحظةَ كاتبتُها فقط.");
  await prisma.customerNote.update({ where: { id: noteId }, data: { deletedAt: new Date() } });
  return note.customerId;
}

/** «بيع لها الآن»: الرقم والاسم لملء نقطة البيع. */
export async function customerForPos(id: string): Promise<{ phone: string; name: string | null } | null> {
  const c = await prisma.customer.findUnique({ where: { id }, select: { phone: true, name: true } });
  return c ? { phone: c.phone, name: c.name } : null;
}
