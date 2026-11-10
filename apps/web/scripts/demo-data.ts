/**
 * بيانات تجريبية لتجربة المتجر ونقطة البيع قبل الإطلاق (D-151):
 *   pnpm db:demo          60 منتجاً بصور مرسومة، شحنتان، أسعار معتمدة، مبيعات 30 يوماً، وطلبات متجر مفتوحة
 *   pnpm db:demo:clear    يؤرشف المنتجات التجريبية (تختفي من المتجر ونقطة البيع)؛ المسح الكامل: pnpm db:fresh
 *
 * كل شيء يمر بدوال النظام نفسها (المنتج، الشحنة، الاستلام، اعتماد السعر، البيع، الطلب) فتصح التكلفة
 * الواصلة والمتوسط والدفعات والأرباح. التواريخ القديمة تُثبَّت بعد الإنشاء (الاستلام والمبيعات).
 * يرفض العمل على قاعدة ليست على هذا الجهاز أو مع NODE_ENV=production.
 */
import { computeSale, dec, normalizePhone, suggestedPriceSdg, type PaymentMethod } from "@ghusn/core";
import { prisma, type Prisma } from "@ghusn/db";
import { createId } from "@paralleldrive/cuid2";
import sharp from "sharp";
import { createProduct } from "../src/lib/catalog";
import { getRateAt } from "../src/lib/exchange-rates";
import { createWebOrder, quoteCart, transitionOrder } from "../src/lib/orders";
import { approvePrices, currentSellingRate, listPriceReview } from "../src/lib/pricing";
import { addProductImage } from "../src/lib/product-images";
import { createSale } from "../src/lib/sales";
import { posWallets } from "../src/lib/settings";
import {
  addShipmentCost,
  createShipment,
  saveShipmentLines,
  transitionShipment,
  updateShipmentDetails,
} from "../src/lib/shipments";
import { receiveShipment } from "../src/lib/stock";
import { DEMO_PRODUCTS, type DemoProduct } from "./demo/catalog";
import { productSvg } from "./demo/art";

const MARKER = "demo.data";
const DAY = 86_400_000;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "db", "ghusn-db"]);
const DEMO_RATES = { SDG: "2800", CNY: "7.2", QAR: "3.64", USD: "1" } as const;
const SUPPLIER_RATE = { CN: 7.2, QA: 3.64 } as const;

interface Marker {
  createdAt: string;
  clearedAt?: string;
  productIds: string[];
  supplierIds: string[];
  shipmentIds: string[];
  shiftIds: string[];
  saleIds: string[];
  orderNumbers: string[];
}

function guard() {
  if (process.env.NODE_ENV === "production") fail("لا تُشغَّل البيانات التجريبية في الإنتاج.");
  const raw = process.env.DATABASE_URL;
  if (!raw) fail("DATABASE_URL غير موجود — شغّلي الأمر من جذر المشروع: pnpm db:demo");
  const host = new URL(raw).hostname;
  if (!LOCAL_HOSTS.has(host))
    fail(`القاعدة على «${host}» ليست على هذا الجهاز — البيانات التجريبية للقاعدة المحلية فقط.`);
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/** مولّد عشوائي ثابت البذرة: نفس البيانات في كل تشغيل. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(151);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;

/** يوم بتوقيت الخرطوم (UTC+2) قبل n يوماً، الساعة h. */
function khartoum(daysAgo: number, hour: number, minute = 0): Date {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo, hour - 2, minute));
  return d;
}

async function readMarker(): Promise<Marker | null> {
  const row = await prisma.setting.findUnique({ where: { key: MARKER } });
  return (row?.value as unknown as Marker) ?? null;
}

async function saveMarker(m: Marker) {
  const value = m as unknown as Prisma.InputJsonValue;
  await prisma.setting.upsert({ where: { key: MARKER }, update: { value }, create: { key: MARKER, value } });
}

// ---------- الإضافة ----------

async function ensureRates(at: Date) {
  for (const [code, value] of Object.entries(DEMO_RATES)) {
    if (await getRateAt(code, at)) continue;
    await prisma.exchangeRate.create({
      data: {
        currencyCode: code,
        unitsPerUsd: value,
        source: code === "QAR" || code === "USD" ? "FIXED_PEG" : "PARALLEL_MARKET",
        effectiveAt: at,
        note: "سعر تجريبي (بيانات التجربة)",
      },
    });
    console.log(`  · سعر ${code} تجريبي ${value} من ${at.toISOString().slice(0, 10)}`);
  }
}

async function addImages(productId: string, p: DemoProduct, withSecond: boolean) {
  // صور بخلفية حقيقية (منتج على طاولة) — مثل صور المحل المصوّرة؛ تُحفظ «صورة كاملة» افتراضياً (D-154)
  const render = async (colors: [string, string]) => {
    const png = await sharp(Buffer.from(productSvg(p.shape, colors, true)))
      .png()
      .toBuffer();
    await addProductImage(productId, new File([new Uint8Array(png)], "demo.png", { type: "image/png" }));
  };
  await render(p.colors);
  // صورة ثانية لبعض المنتجات (المعرض والمصغّرات)
  if (withSecond) await render([p.colors[1], p.colors[0]]);
}

async function add(ownerId: string) {
  const existing = await readMarker();
  if (existing && !existing.clearedAt) {
    fail(
      "البيانات التجريبية مضافة من قبل. لإعادتها: pnpm db:demo:clear ثم pnpm db:demo (أو pnpm db:fresh لمسح كل شيء).",
    );
  }
  const marker: Marker = {
    createdAt: new Date().toISOString(),
    productIds: [],
    supplierIds: [],
    shipmentIds: [],
    shiftIds: [],
    saleIds: [],
    orderNumbers: [],
  };

  const purchasedAt = khartoum(35, 11);
  const receivedAt = khartoum(32, 12);
  await ensureRates(khartoum(45, 9));

  console.log("1/6 الأقسام والمنتجات والصور…");
  const categories = new Map((await prisma.category.findMany()).map((c) => [c.slug, c.id]));
  const created: { p: DemoProduct; id: string; variantIds: string[] }[] = [];
  for (const [i, p] of DEMO_PRODUCTS.entries()) {
    const categoryId = categories.get(p.category);
    if (!categoryId) fail(`القسم «${p.category}» غير موجود — شغّلي pnpm db:seed أولاً.`);
    const id = await createProduct(
      {
        nameAr: p.nameAr,
        nameEn: p.nameEn,
        descriptionAr: p.descAr,
        descriptionEn: p.descEn,
        categoryId,
        type: "STOCK",
        unit: "PIECE",
        trackExpiry: !!p.trackExpiry,
        isActive: true,
        isWebVisible: true,
        variants: p.variants.map((v) => ({
          size: v.size ?? null,
          color: v.color ?? null,
          volume: v.volume ?? null,
          barcode: null,
          isActive: true,
        })),
      },
      ownerId,
    );
    const variants = await prisma.productVariant.findMany({ where: { productId: id }, orderBy: { sortOrder: "asc" } });
    created.push({ p, id, variantIds: variants.map((v) => v.id) });
    marker.productIds.push(id);
    await addImages(id, p, i % 3 === 0);
  }
  await saveMarker(marker);

  console.log("2/6 الموردون والشحنتان (شراء، تكاليف، استلام)…");
  const suppliers = {
    CN: await prisma.supplier.create({
      data: { name: "مورد تجريبي – قوانغتشو", country: "CN", currencyCode: "CNY", notes: "بيانات التجربة" },
    }),
    QA: await prisma.supplier.create({
      data: { name: "مورد تجريبي – الدوحة", country: "QA", currencyCode: "QAR", notes: "بيانات التجربة" },
    }),
  };
  marker.supplierIds.push(suppliers.CN.id, suppliers.QA.id);

  const receivedQty = new Map<string, number>();
  for (const key of ["CN", "QA"] as const) {
    const lines = created
      .filter((c) => c.p.supplier === key)
      .flatMap((c) =>
        c.p.variants
          // الكميات القليلة (≤2) مقصودة: «كمية محدودة» و«نفد» بعد المبيعات؛ والباقي مضاعف ليبقى المتجر ممتلئاً
          .map((v, i) => ({ variantId: c.variantIds[i]!, qty: v.qty <= 2 ? v.qty : v.qty * 2, unitPrice: v.cost }))
          .filter((l) => l.qty > 0),
      );
    const shipmentId = await createShipment(suppliers[key].id, ownerId);
    marker.shipmentIds.push(shipmentId);
    await updateShipmentDetails(shipmentId, {
      purchasedAt,
      dueDate: null,
      origin: key,
      notes: "شحنة تجريبية",
    });
    await saveShipmentLines(
      shipmentId,
      lines.map((l) => ({ variantId: l.variantId, qty: String(l.qty), unitPrice: String(l.unitPrice) })),
      ownerId,
    );
    await transitionShipment(shipmentId, "PURCHASED", ownerId);
    // تكاليف الشحن والجمارك «دُفعت من خارج المحل» — لا تنقص أي محفظة
    const costs: [Prisma.ShipmentCostCreateInput["kind"], string][] =
      key === "CN"
        ? [
            ["SHIPPING", "650"],
            ["CUSTOMS", "280"],
            ["CLEARANCE", "90"],
          ]
        : [["SHIPPING", "180"]];
    for (const [kind, amount] of costs) {
      await addShipmentCost(
        shipmentId,
        { kind, amount, walletId: null, currencyCode: "USD", paidAt: khartoum(33, 10), note: "تكلفة تجريبية" },
        ownerId,
      );
    }
    const saved = await prisma.shipmentLine.findMany({ where: { shipmentId } });
    await receiveShipment(
      shipmentId,
      saved.map((l) => ({
        lineId: l.id,
        receivedQty: l.qty.toString(),
        damagedQty: "0",
        expiresAt: new Date(Date.now() + 420 * DAY),
      })),
      ownerId,
    );
    for (const l of saved) receivedQty.set(l.variantId, Number(l.qty.toString()));
    // تاريخ الاستلام قبل المبيعات التجريبية
    const batches = await prisma.stockBatch.findMany({
      where: { shipmentLineId: { in: saved.map((l) => l.id) } },
      select: { id: true },
    });
    await prisma.shipment.update({ where: { id: shipmentId }, data: { receivedAt } });
    await prisma.stockBatch.updateMany({ where: { id: { in: batches.map((b) => b.id) } }, data: { receivedAt } });
    await prisma.stockMovement.updateMany({
      where: { batchId: { in: batches.map((b) => b.id) }, kind: "RECEIPT" },
      data: { createdAt: receivedAt },
    });
  }
  await saveMarker(marker);

  console.log("3/6 اعتماد الأسعار (الهامش المستهدف، تقريب للأعلى)…");
  const rate = await currentSellingRate();
  if (!rate) fail("لا يوجد سعر للجنيه.");
  const demoVariants = new Set(created.flatMap((c) => c.variantIds));
  const skip = new Set(created.filter((c) => c.p.noPrice).flatMap((c) => c.variantIds));
  const { rows } = await listPriceReview({ all: true });
  const prices = new Map<string, string>();
  for (const r of rows) {
    if (demoVariants.has(r.variantId) && !skip.has(r.variantId) && r.suggestedSdg)
      prices.set(r.variantId, r.suggestedSdg);
  }
  // متغيّر لم يُشترَ (نفد في النظام): سعر من تكلفته التقديرية
  for (const c of created) {
    if (c.p.noPrice) continue;
    c.p.variants.forEach((v, i) => {
      const id = c.variantIds[i]!;
      if (prices.has(id)) return;
      const costUsd = dec(v.cost).div(SUPPLIER_RATE[c.p.supplier]).mul("1.15");
      prices.set(
        id,
        suggestedPriceSdg({ avgCostUsd: costUsd, targetMargin: "0.40", sdgPerUsd: rate }).priceSdg.toFixed(0),
      );
    });
  }
  await approvePrices(
    [...prices].map(([variantId, priceSdg]) => ({ variantId, priceSdg, note: "سعر تجريبي" })),
    ownerId,
  );
  for (const c of created.filter((x) => x.p.inactive)) {
    await prisma.product.update({ where: { id: c.id }, data: { isActive: false } });
  }

  console.log("4/6 مبيعات 30 يوماً (ورديات مغلقة مطابقة)…");
  await history(created, prices, receivedQty, marker, ownerId);
  await saveMarker(marker);

  console.log("5/6 طلبات متجر مفتوحة…");
  await orders(created, receivedQty, marker);
  await saveMarker(marker);

  console.log("6/6 تم.");
  const sales = marker.saleIds.length;
  console.log(
    `✓ ${created.length} منتجاً · شحنتان · ${sales} فاتورة على ${marker.shiftIds.length} يوماً · ${marker.orderNumbers.length} طلبات متجر`,
  );
  console.log("  للأرشفة لاحقاً: pnpm db:demo:clear — وللمسح الكامل قبل الإطلاق: pnpm db:fresh");
}

const CUSTOMERS: [string, string][] = [
  ["+249912345601", "أمل عثمان"],
  ["+249912345602", "سارة محمد"],
  ["+249912345603", "هبة الطيب"],
  ["+249912345604", "مريم إبراهيم"],
  ["+249912345605", "محمد عبدالله"],
  ["+249912345606", "أحمد حسن"],
  ["+249912345607", "رؤى صالح"],
  ["+249912345608", "نسرين علي"],
  ["+249912345609", "خالد يوسف"],
  ["+249912345610", "ريم عمر"],
  ["+249912345611", "تسنيم بابكر"],
  ["+249912345612", "عمر الفاضل"],
  ["+249912345613", "ولاء مصطفى"],
  ["+249912345614", "إسراء حمد"],
  ["+249912345615", "يوسف الأمين"],
];

async function history(
  created: { p: DemoProduct; id: string; variantIds: string[] }[],
  prices: Map<string, string>,
  stock: Map<string, number>,
  marker: Marker,
  ownerId: string,
) {
  const staff = await prisma.user.findMany({ where: { banned: false, role: { in: ["STAFF", "MANAGER", "OWNER"] } } });
  const cashiers = staff.length ? staff.map((u) => u.id) : [ownerId];
  const wallets = await posWallets();
  const sellable = created
    .filter((c) => !c.p.inactive && !c.p.noPrice)
    .flatMap((c) => c.variantIds.filter((id) => prices.has(id)));
  let opening = dec(0);
  let seq = 0;

  // لا يُباع آخر 4 قطع من صنف عادي — ينفد فقط ما كميته قليلة أصلاً
  const initial = new Map(stock);
  const floor = (id: string) => ((initial.get(id) ?? 0) <= 2 ? 0 : 4);

  for (let daysAgo = 30; daysAgo >= 1; daysAgo--) {
    const openedAt = khartoum(daysAgo, 9);
    const closedAt = khartoum(daysAgo, 22);
    // يوم فيه وردية حقيقية سابقة: يُترك كما هو
    const overlap = await prisma.shift.count({
      where: { openedAt: { lte: closedAt }, OR: [{ closedAt: null }, { closedAt: { gte: openedAt } }] },
    });
    if (overlap) continue;
    const cashier = pick(cashiers);
    const rate = (await getRateAt("SDG", openedAt)) ?? DEMO_RATES.SDG;
    const shift = await prisma.shift.create({
      data: {
        userId: cashier,
        openedAt,
        openingCashSdg: opening.toFixed(2),
        openingSystemSdg: opening.toFixed(2),
        cashWalletId: wallets.cash,
        closedAt,
        closedById: cashier,
        closedAsMatch: true,
        closeSdgPerUsd: rate,
      },
    });
    marker.shiftIds.push(shift.id);

    // الجمعة والخميس أنشط
    const weekday = openedAt.getUTCDay();
    const count = 2 + Math.floor(rand() * 4) + (weekday === 4 || weekday === 5 ? 2 : 0);
    for (let n = 0; n < count; n++) {
      const available = sellable.filter((id) => (stock.get(id) ?? 0) > floor(id));
      if (!available.length) break;
      const lineCount = Math.min(available.length, rand() < 0.6 ? 1 : rand() < 0.75 ? 2 : 3);
      const chosen = new Set<string>();
      while (chosen.size < lineCount) chosen.add(pick(available));
      const lines = [...chosen].map((variantId) => {
        const left = stock.get(variantId) ?? 0;
        const qty = left - floor(variantId) >= 2 && rand() < 0.15 ? 2 : 1;
        return { variantId, qty: String(qty), lineDiscountSdg: "0", unitPriceSdg: prices.get(variantId)! };
      });
      const subtotal = lines.reduce((acc, l) => acc.plus(dec(l.unitPriceSdg).mul(l.qty)), dec(0));
      // خصم 5% أحياناً (تحت الحد وفوق التكلفة)، مقرّب لـ 500
      const discount = rand() < 0.15 ? subtotal.mul("0.05").div(500).floor().mul(500) : dec(0);
      const totals = computeSale(
        lines.map((l) => ({ key: l.variantId, qty: l.qty, unitPriceSdg: l.unitPriceSdg, lineDiscountSdg: "0" })),
        discount,
      );
      const total = totals.totalSdg;
      const r = rand();
      const payments: { method: PaymentMethod; amountSdg: string; reference: string | null }[] =
        r < 0.65
          ? [{ method: "CASH", amountSdg: total.toFixed(0), reference: null }]
          : r < 0.9
            ? [{ method: "BANKAK", amountSdg: total.toFixed(0), reference: `${Math.floor(1e8 + rand() * 9e8)}` }]
            : [
                { method: "CASH", amountSdg: total.div(2).floor().toFixed(0), reference: null },
                {
                  method: "BANKAK",
                  amountSdg: total.minus(total.div(2).floor()).toFixed(0),
                  reference: `${Math.floor(1e8 + rand() * 9e8)}`,
                },
              ];
      const customer = rand() < 0.45 ? pick(CUSTOMERS) : null;
      const minutes = 60 + Math.floor((n + rand()) * (600 / count));
      const createdAt = new Date(openedAt.getTime() + minutes * 60_000);
      const id = createId();
      seq += 1;
      await createSale(
        {
          id,
          lines: lines.map(({ variantId, qty }) => ({ variantId, qty, lineDiscountSdg: "0" })),
          invoiceDiscountSdg: discount.toFixed(0),
          payments,
          cashTenderedSdg: null,
          customerPhone: customer ? normalizePhone(customer[0], "SD") : null,
          customerName: customer?.[1] ?? null,
          creditReturnId: null,
          offline: {
            createdAt,
            localNumber: `DEMO-${seq}`,
            unitPrices: Object.fromEntries(lines.map((l) => [l.variantId, l.unitPriceSdg])),
          },
        },
        cashier,
      );
      // تُعرض كفاتورة عادية من المحل (لا «دون اتصال» ولا «للمراجعة»)، وحركاتها بتاريخ البيع
      await prisma.sale.update({
        where: { id },
        data: { offline: false, localNumber: null, syncedAt: null, reviewNote: null },
      });
      await prisma.stockMovement.updateMany({ where: { saleId: id }, data: { createdAt } });
      for (const l of lines) stock.set(l.variantId, (stock.get(l.variantId) ?? 0) - Number(l.qty));
      marker.saleIds.push(id);
    }

    // إغلاق مطابق: المتوقع = البداية + النقد المقبوض
    const cash = await prisma.salePayment.aggregate({
      where: { method: "CASH", sale: { shiftId: shift.id } },
      _sum: { amountSdg: true },
    });
    const expected = opening.plus(cash._sum.amountSdg?.toString() ?? "0");
    await prisma.shift.update({
      where: { id: shift.id },
      data: { expectedCashSdg: expected.toFixed(2), countedCashSdg: expected.toFixed(2), differenceUsd: "0" },
    });
    opening = expected;
  }
}

async function orders(
  created: { p: DemoProduct; id: string; variantIds: string[] }[],
  stock: Map<string, number>,
  marker: Marker,
) {
  const pool = created
    .filter((c) => !c.p.inactive && !c.p.noPrice)
    .flatMap((c) => c.variantIds)
    .filter((id) => (stock.get(id) ?? 0) >= 2);
  const plan: { to: ("CONFIRMED" | "PREPARING")[] }[] = [
    { to: [] },
    { to: [] },
    { to: ["CONFIRMED"] },
    { to: ["CONFIRMED", "PREPARING"] },
  ];
  for (const [i, step] of plan.entries()) {
    const items = [{ variantId: pick(pool), qty: 1 }];
    const quote = await quoteCart("ar", items);
    const customer = CUSTOMERS[i]!;
    try {
      const { number } = await createWebOrder({
        id: createId(),
        locale: "ar",
        customerName: customer[1],
        phone: customer[0],
        fulfillment: "PICKUP",
        city: null,
        address: null,
        recipientName: null,
        recipientPhone: null,
        note: i === 0 ? "أرجو تغليفها كهدية" : null,
        payment: "ON_RECEIPT",
        wrapStyleId: null,
        cardMessage: null,
        items,
        expectedTotalSdg: quote.totalSdg,
      });
      marker.orderNumbers.push(number);
      const order = await prisma.order.findUniqueOrThrow({ where: { number }, select: { id: true } });
      for (const to of step.to) await transitionOrder(order.id, to, null);
    } catch (e) {
      console.warn(`  · تعذّر طلب تجريبي: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

// ---------- الأرشفة ----------

async function clear() {
  const m = await readMarker();
  if (!m || m.clearedAt) fail("لا توجد بيانات تجريبية مضافة.");
  const now = new Date();
  const archived = await prisma.product.updateMany({
    where: { id: { in: m.productIds }, deletedAt: null },
    data: { deletedAt: now, isActive: false },
  });
  await prisma.supplier.updateMany({ where: { id: { in: m.supplierIds } }, data: { isActive: false } });
  await saveMarker({ ...m, clearedAt: now.toISOString() });
  console.log(`✓ أُرشف ${archived.count} منتجاً تجريبياً (اختفت من المتجر ونقطة البيع) وأُوقف الموردان التجريبيان.`);
  console.log("  المبيعات والحركات التجريبية تبقى في السجلات (لا يُحذف سجل مالي). للمسح الكامل: pnpm db:fresh");
}

async function main() {
  guard();
  const owner = await prisma.user.findFirst({ where: { role: "OWNER", banned: false }, orderBy: { createdAt: "asc" } });
  if (!owner) fail("لا يوجد حساب مالك — شغّلي pnpm owner:setup أولاً.");
  if (process.argv.includes("--clear")) await clear();
  else await add(owner.id);
}

main()
  .catch((e: unknown) => {
    console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
    if (e instanceof Error && e.stack) console.error(e.stack.split("\n").slice(1, 4).join("\n"));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
