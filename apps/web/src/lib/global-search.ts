import { formatPhone, matchRanges, normalizeArabic, numericQuery, searchTerms, stripArticle } from "@ghusn/core";
import { Prisma, prisma } from "@ghusn/db";
import { navFor, quickActionsFor } from "./admin-nav";
import { quickActionTitle } from "./admin-nav-model";
import { roleCan } from "./auth/permissions";
import { formatAmount } from "./format";
import { ORDER_STATUS_LABELS } from "./orders";
import { listSuppliers } from "./suppliers";

/**
 * البحث الشامل (D-121): مربع واحد يبحث في المنتجات والعملاء والطلبات والفواتير والشحنات والموردين والصفحات —
 * كل مجموعة حسب صلاحية المستخدمة (تُفحص هنا في الخادم). النتائج بيانات عرض فقط: لا تكلفة ولا هامش.
 */

export type SearchGroupKey = "products" | "customers" | "orders" | "sales" | "shipments" | "suppliers" | "pages";

export interface SearchItem {
  id: string;
  href: string;
  title: string;
  /** مواضع التظليل في العنوان */
  hl: [number, number][];
  sub?: string;
  meta?: string;
  tone?: "danger" | "gold";
}

export interface SearchGroup {
  key: SearchGroupKey;
  label: string;
  items: SearchItem[];
  /** وُجد أكثر مما عُرض */
  more: boolean;
  /** «عرض الكل» في صفحة القسم إن كان فيها بحث */
  moreHref?: string;
}

const TAKE = 5;
type Role = unknown;
const can = (role: Role, p: Parameters<typeof roleCan>[1]) => roleCan(role, p);

/** نفس توحيد normalizeArabic للحروف داخل SQL (للأعمدة غير المخزّنة موحّدة: الأسماء). */
const norm = (col: Prisma.Sql) => Prisma.sql`translate(lower(coalesce(${col}, '')), 'أإآٱةىؤئ', 'ااااهيوي')`;
const like = (t: string) => `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const allTerms = (col: Prisma.Sql, terms: string[]) =>
  terms.length
    ? Prisma.join(
        terms.map((t) => Prisma.sql`${norm(col)} LIKE ${like(t)}`),
        " AND ",
      )
    : Prisma.sql`FALSE`;

/** آخر أرقام المستند: «155» ← «…-000155» */
const docSuffix = (digits: string, width: number) =>
  digits.length <= width ? `%-${digits.padStart(width, "0")}` : `%${digits}`;

export async function globalSearch(rawQuery: string, role: Role): Promise<SearchGroup[]> {
  const q = rawQuery.trim().slice(0, 80);
  const terms = searchTerms(q).map(stripArticle);
  if (!terms.length) return [];
  const digits = numericQuery(q);
  const upper = q.toUpperCase();

  const [products, customers, orders, sales, shipments, suppliers] = await Promise.all([
    can(role, { product: ["read"] }) ? searchProducts(q, terms, digits) : null,
    can(role, { customer: ["read"] }) ? searchCustomers(terms, digits) : null,
    can(role, { order: ["read"] }) ? searchOrders(terms, digits, upper) : null,
    can(role, { sale: ["read"] }) ? searchSales(terms, digits, upper) : null,
    can(role, { shipment: ["read"] }) ? searchShipments(terms, digits, upper) : null,
    can(role, { supplier: ["read"] }) ? searchSuppliers(terms) : null,
  ]);
  const pages = searchPages(role, terms);

  const groups: SearchGroup[] = [];
  const push = (g: (Omit<SearchGroup, "more"> & { rows: SearchItem[] }) | null) => {
    if (!g || !g.rows.length) return;
    groups.push({
      key: g.key,
      label: g.label,
      moreHref: g.moreHref,
      items: g.rows.slice(0, TAKE),
      more: g.rows.length > TAKE,
    });
  };
  const enc = encodeURIComponent(q);
  const byKey = {
    products: products && {
      key: "products",
      label: "المنتجات",
      rows: products.rows,
      moreHref: `/admin/products?q=${enc}`,
    },
    customers: customers && {
      key: "customers",
      label: "العملاء",
      rows: customers,
      moreHref: `/admin/customers?q=${enc}`,
    },
    orders: orders && { key: "orders", label: "طلبات المتجر", rows: orders },
    sales: sales && { key: "sales", label: "الفواتير", rows: sales },
    shipments: shipments && { key: "shipments", label: "الشحنات", rows: shipments },
    suppliers: suppliers && { key: "suppliers", label: "الموردون", rows: suppliers },
    pages: { key: "pages", label: "صفحات وإجراءات", rows: pages },
  } as const;
  // رقم = هاتف أو مستند غالباً: العملاء والطلبات أولاً — إلا إن طابق باركوداً بالضبط (الماسح)
  const order: SearchGroupKey[] =
    digits && !products?.exact
      ? ["customers", "orders", "sales", "shipments", "products", "suppliers", "pages"]
      : ["products", "customers", "orders", "sales", "shipments", "suppliers", "pages"];
  for (const k of order) push(byKey[k] as Parameters<typeof push>[0]);
  return groups;
}

async function searchProducts(
  q: string,
  terms: string[],
  digits: string | null,
): Promise<{ rows: SearchItem[]; exact: boolean }> {
  const select = {
    id: true,
    nameAr: true,
    type: true,
    category: { select: { nameAr: true } },
    variants: {
      where: { deletedAt: null, isActive: true },
      select: {
        barcode: true,
        sku: true,
        size: true,
        color: true,
        volume: true,
        priceSdg: true,
        stockLevel: { select: { qty: true } },
      },
    },
  } as const;
  const base = { deletedAt: null, type: "STOCK" as const };
  // الباركود أو SKU بالضبط أولاً (الماسح)
  const exact =
    digits || /^[A-Z0-9-]{4,}$/i.test(q)
      ? await prisma.product.findMany({
          where: { ...base, variants: { some: { deletedAt: null, OR: [{ barcode: q }, { sku: q.toUpperCase() }] } } },
          select,
          take: 1,
        })
      : [];
  let rows = exact.length
    ? exact
    : await prisma.product.findMany({
        where: { ...base, AND: terms.map((t) => ({ searchText: { contains: t } })) },
        select,
        orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
        take: TAKE + 1,
      });
  // تسامح مع الأخطاء الإملائية: تشابه الكلمات (pg_trgm) حين لا تطابق حرفية
  if (!rows.length && !digits) {
    const n = normalizeArabic(q);
    const ids = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Product"
       WHERE "deletedAt" IS NULL AND "type" = 'STOCK' AND word_similarity(${n}, "searchText") >= 0.45
       ORDER BY word_similarity(${n}, "searchText") DESC LIMIT ${TAKE}`;
    if (ids.length) {
      const found = await prisma.product.findMany({ where: { id: { in: ids.map((r) => r.id) } }, select });
      rows = ids.map((r) => found.find((p) => p.id === r.id)).filter((p): p is (typeof found)[number] => !!p);
    }
  }
  const items = rows.map((p) => {
    const qty = p.variants.reduce((s, v) => s + Number(v.stockLevel?.qty ?? 0), 0);
    const prices = [...new Set(p.variants.map((v) => v.priceSdg?.toString()).filter((v): v is string => !!v))];
    const hit = exact.length ? p.variants.find((v) => v.barcode === q || v.sku === q.toUpperCase()) : undefined;
    const variant = hit ? [hit.size, hit.color, hit.volume].filter(Boolean).join(" · ") : "";
    const price = prices.length
      ? `${prices.length > 1 ? "من " : ""}${formatAmount(
          prices.reduce((a, b) => (Number(a) <= Number(b) ? a : b)),
          0,
        )} ج.س`
      : "بلا سعر";
    return {
      id: p.id,
      href: `/admin/products/${p.id}`,
      title: p.nameAr,
      hl: matchRanges(p.nameAr, terms),
      sub: [p.category.nameAr, variant, hit ? hit.barcode : ""].filter(Boolean).join(" · "),
      meta: qty > 0 ? `${formatAmount(qty, 0)} متوفر · ${price}` : `نفد · ${price}`,
      tone: qty > 0 ? undefined : "danger",
    } satisfies SearchItem;
  });
  return { rows: items, exact: exact.length > 0 };
}

async function searchCustomers(terms: string[], digits: string | null): Promise<SearchItem[]> {
  const local = digits?.replace(/^0+/, "");
  const where = local
    ? Prisma.sql`regexp_replace(c."phone", '\\D', '', 'g') LIKE ${like(local)}`
    : allTerms(Prisma.sql`c."name"`, terms);
  const rows = await prisma.$queryRaw<{ id: string; name: string | null; phone: string; purchases: bigint }[]>`
    SELECT c."id", c."name", c."phone",
           (SELECT COUNT(*) FROM "Sale" s WHERE s."customerId" = c."id")
         + (SELECT COUNT(*) FROM "Order" o WHERE o."customerId" = c."id" AND o."status" = 'DELIVERED') AS "purchases"
      FROM "Customer" c
     WHERE ${where}
     ORDER BY "purchases" DESC, c."createdAt" DESC
     LIMIT ${TAKE + 1}`;
  return rows.map((c) => {
    const title = c.name || formatPhone(c.phone);
    return {
      id: c.id,
      href: `/admin/customers/${c.id}`,
      title,
      hl: c.name ? matchRanges(c.name, terms) : [],
      sub: c.name ? formatPhone(c.phone) : undefined,
      meta: Number(c.purchases) ? `${Number(c.purchases)} مشتريات` : "بلا مشتريات بعد",
    };
  });
}

async function searchOrders(terms: string[], digits: string | null, upper: string): Promise<SearchItem[]> {
  const local = digits?.replace(/^0+/, "");
  const where = digits
    ? Prisma.sql`(o."number" LIKE ${docSuffix(digits, 6)}
        OR (${local!.length >= 4} AND (regexp_replace(cu."phone", '\\D', '', 'g') LIKE ${like(local!)}
          OR regexp_replace(coalesce(o."recipientPhone", ''), '\\D', '', 'g') LIKE ${like(local!)})))`
    : Prisma.sql`(o."number" LIKE ${like(upper)} OR (${allTerms(Prisma.sql`o."customerName"`, terms)})
        OR (${allTerms(Prisma.sql`o."recipientName"`, terms)}))`;
  const rows = await prisma.$queryRaw<
    { id: string; number: string; customerName: string; status: keyof typeof ORDER_STATUS_LABELS; totalSdg: string }[]
  >`
    SELECT o."id", o."number", o."customerName", o."status", o."totalSdg"::text AS "totalSdg"
      FROM "Order" o JOIN "Customer" cu ON cu."id" = o."customerId"
     WHERE ${where}
     ORDER BY o."createdAt" DESC
     LIMIT ${TAKE + 1}`;
  return rows.map((o) => ({
    id: o.id,
    href: `/admin/orders/${o.id}`,
    title: o.number,
    hl: [],
    sub: o.customerName,
    meta: `${ORDER_STATUS_LABELS[o.status] ?? o.status} · ${formatAmount(o.totalSdg, 0)} ج.س`,
    tone: o.status === "NEW" || o.status === "PAYMENT_REVIEW" ? "gold" : undefined,
  }));
}

async function searchSales(terms: string[], digits: string | null, upper: string): Promise<SearchItem[]> {
  const local = digits?.replace(/^0+/, "");
  const where = digits
    ? Prisma.sql`(s."number" LIKE ${docSuffix(digits, 6)}
        OR (${local!.length >= 4} AND regexp_replace(coalesce(cu."phone", ''), '\\D', '', 'g') LIKE ${like(local!)}))`
    : Prisma.sql`(s."number" LIKE ${like(upper)} OR (${allTerms(Prisma.sql`s."customerName"`, terms)}))`;
  const rows = await prisma.$queryRaw<
    { id: string; number: string; customerName: string | null; totalSdg: string; createdAt: Date }[]
  >`
    SELECT s."id", s."number", s."customerName", s."totalSdg"::text AS "totalSdg", s."createdAt"
      FROM "Sale" s LEFT JOIN "Customer" cu ON cu."id" = s."customerId"
     WHERE ${where}
     ORDER BY s."createdAt" DESC
     LIMIT ${TAKE + 1}`;
  return rows.map((s) => ({
    id: s.id,
    href: `/pos/receipt/${s.id}`,
    title: s.number,
    hl: [],
    sub: s.customerName ?? "بلا عميل",
    meta: `${formatAmount(s.totalSdg, 0)} ج.س`,
  }));
}

async function searchShipments(terms: string[], digits: string | null, upper: string): Promise<SearchItem[]> {
  const where = digits
    ? Prisma.sql`sh."number" LIKE ${docSuffix(digits, 3)}`
    : Prisma.sql`(sh."number" LIKE ${like(upper)} OR (${allTerms(Prisma.sql`su."name"`, terms)}))`;
  const rows = await prisma.$queryRaw<{ id: string; number: string; supplier: string; origin: string }[]>`
    SELECT sh."id", sh."number", su."name" AS "supplier", sh."origin"
      FROM "Shipment" sh JOIN "Supplier" su ON su."id" = sh."supplierId"
     WHERE ${where}
     ORDER BY sh."purchasedAt" DESC
     LIMIT ${TAKE + 1}`;
  return rows.map((s) => ({
    id: s.id,
    href: `/admin/shipments/${s.id}`,
    title: s.number,
    hl: [],
    sub: `${s.supplier} · ${s.origin}`,
  }));
}

async function searchSuppliers(terms: string[]): Promise<SearchItem[]> {
  // الموردون قليلون: الرصيد من نفس دالة كشف الحساب (منطق الدفتر في @ghusn/core)
  const all = await listSuppliers();
  return all
    .filter((s) => {
      const n = normalizeArabic(s.name);
      return terms.every((t) => n.includes(t));
    })
    .slice(0, TAKE + 1)
    .map((s) => ({
      id: s.id,
      href: `/admin/suppliers/${s.id}`,
      title: s.name,
      hl: matchRanges(s.name, terms),
      sub: s.country,
      meta:
        Number(s.balance) > 0
          ? `مستحق ${formatAmount(s.balance, s.currency.decimals)} ${s.currency.symbol}`
          : "لا مستحقات",
    }));
}

/** صفحات القائمة وإجراءات «+ جديد» المطابقة — نفس ما تراه المستخدمة في القائمة. */
function searchPages(role: Role, terms: string[]): SearchItem[] {
  const nav = navFor(role);
  const pages = [...nav.groups.flatMap((g) => g.sections), ...(nav.footer ? [nav.footer] : [])].flatMap((s) =>
    s.pages.map((p) => ({ href: p.href, label: p.label, section: s.label })),
  );
  const actions = quickActionsFor(role).map((a) => ({
    href: a.href,
    label: quickActionTitle(a.label),
    section: "إجراء",
  }));
  const seen = new Set<string>();
  return [...actions, ...pages]
    .filter((p) => {
      const n = normalizeArabic(`${p.label} ${p.section}`);
      if (seen.has(p.href) || !terms.every((t) => n.includes(t))) return false;
      seen.add(p.href);
      return true;
    })
    .map((p) => ({
      id: p.href,
      href: p.href,
      title: p.label,
      hl: matchRanges(p.label, terms),
      sub: p.section === p.label ? undefined : p.section,
    }));
}
