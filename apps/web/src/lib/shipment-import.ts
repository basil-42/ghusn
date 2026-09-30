import { IMPORT_COLUMNS, isShipmentEditable, normalizeArabic, planShipmentImport, type ImportPlan } from "@ghusn/core";
import { prisma } from "@ghusn/db";
import ExcelJS from "exceljs";
import { createProduct } from "./catalog";
import { ShipmentError, saveShipmentLines } from "./shipments";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** قالب Excel للاستيراد: العناوين، مثالان، وورقة بأسماء الأقسام (D-85). */
export async function buildImportTemplate(): Promise<Buffer> {
  const categories = await prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("البنود", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  ws.columns = IMPORT_COLUMNS.map((header) => ({ header, width: header === "الاسم" ? 28 : 14 }));
  ws.getRow(1).font = { bold: true };
  ws.addRow(["مسك أبيض", categories[0]?.nameAr ?? "", "بضاعة", "حبة", "50ml", "", "", "", "نعم", 12, 45]);
  ws.addRow(["مسك أبيض", categories[0]?.nameAr ?? "", "بضاعة", "حبة", "100ml", "", "", "", "نعم", 6, 80]);
  const cats = wb.addWorksheet("الأقسام", { views: [{ rightToLeft: true }] });
  cats.columns = [{ header: "الأقسام المتاحة", width: 24 }];
  categories.forEach((c) => cats.addRow([c.nameAr]));
  const help = wb.addWorksheet("تعليمات", { views: [{ rightToLeft: true }] });
  help.columns = [{ header: "تعليمات", width: 90 }];
  [
    "كل صف = صنف (متغيّر) مع الكمية وسعر الشراء للوحدة بعملة المورد.",
    "القسم: كما في ورقة «الأقسام». النوع: بضاعة أو مادة تغليف (فارغ = بضاعة). الوحدة: حبة أو متر أو ورقة (فارغ = حبة).",
    "صفوف بنفس الاسم والقسم = منتج واحد بعدة متغيّرات؛ اكتبي الحجم أو المقاس أو اللون لكل صف.",
    "الصنف الموجود يُعرف بباركود المصنع، أو بنفس الاسم والقسم والخيارات. غير ذلك يُنشأ منتجاً جديداً.",
    "صلاحية: نعم للعطور ومستحضرات التجميل. باركود المصنع اختياري (فارغ = باركود داخلي تلقائي).",
    "احذفي صفي المثال قبل الرفع.",
  ].forEach((t) => help.addRow([t]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function readRows(file: File): Promise<unknown[][]> {
  if (file.size === 0) throw new ShipmentError("الملف فارغ.");
  if (file.size > MAX_FILE_BYTES) throw new ShipmentError("الملف أكبر من 2 ميغابايت.");
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as ArrayBuffer);
  } catch {
    throw new ShipmentError("تعذّرت قراءة الملف — استخدمي قالب Excel (xlsx.).");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new ShipmentError("الملف بلا أوراق.");
  const header = (ws.getRow(1).values as unknown[]).slice(1).map((v) => normalizeArabic(String(v ?? "")));
  if (IMPORT_COLUMNS.some((c, i) => header[i] !== normalizeArabic(c))) {
    throw new ShipmentError("أعمدة الملف لا تطابق القالب — نزّلي القالب واملئيه.");
  }
  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    if (n === 1) return;
    // ExcelJS: القيم تبدأ من الفهرس 1؛ الصيغ والنص الغني ← نصها
    const values = (row.values as unknown[]).slice(1, IMPORT_COLUMNS.length + 1).map((v) => {
      if (v && typeof v === "object") {
        const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
        return o.result ?? o.text ?? o.richText?.map((t) => t.text).join("") ?? "";
      }
      return v ?? "";
    });
    rows[n - 2] = values;
  });
  return Array.from(rows, (r) => r ?? []);
}

async function planFor(shipmentId: string, file: File) {
  const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId }, include: { lines: true } });
  if (!shipment) throw new ShipmentError("الشحنة غير موجودة.");
  if (!isShipmentEditable(shipment.status)) throw new ShipmentError("الشحنة مغلقة ولا تُعدَّل.");
  const [rows, categories, variants] = await Promise.all([
    readRows(file),
    prisma.category.findMany({ where: { isActive: true }, select: { id: true, nameAr: true } }),
    prisma.productVariant.findMany({
      where: { deletedAt: null, product: { deletedAt: null } },
      select: {
        id: true,
        barcode: true,
        size: true,
        color: true,
        volume: true,
        product: { select: { nameAr: true, categoryId: true } },
      },
    }),
  ]);
  const plan = planShipmentImport({
    rows,
    categories: categories.map((c) => ({ id: c.id, name: c.nameAr })),
    existing: variants.map((v) => ({
      variantId: v.id,
      productName: v.product.nameAr,
      categoryId: v.product.categoryId,
      size: v.size,
      color: v.color,
      volume: v.volume,
      barcode: v.barcode,
    })),
  });
  // صنف موجود أصلاً في بنود الشحنة
  const inShipment = new Set(shipment.lines.map((l) => l.variantId));
  for (const l of plan.lines) {
    if (l.variantId && inShipment.has(l.variantId)) {
      plan.errors.push({ row: l.row, message: "الصنف موجود في بنود الشحنة — عدّلي كميته هناك." });
    }
  }
  plan.errors.sort((a, b) => a.row - b.row);
  return { shipment, plan };
}

export type ImportPreview = Pick<ImportPlan, "errors"> & {
  lines: { row: number; label: string; qty: string; unitPrice: string; isNew: boolean }[];
  newProducts: number;
  newVariants: number;
};

/** معاينة دون كتابة: ما سيُضاف وما سيُنشأ والأخطاء بأرقام صفوف Excel. */
export async function previewImport(shipmentId: string, file: File): Promise<ImportPreview> {
  const { plan } = await planFor(shipmentId, file);
  return {
    errors: plan.errors,
    lines: plan.lines.map((l) => ({
      row: l.row,
      label: l.label,
      qty: l.qty,
      unitPrice: l.unitPrice,
      isNew: !l.variantId,
    })),
    newProducts: plan.newProducts.length,
    newVariants: plan.newProducts.reduce((n, p) => n + p.variants.length, 0),
  };
}

/**
 * التنفيذ: يعيد قراءة الملف والتحقق (لا يُوثق بالمعاينة)، ينشئ المنتجات الجديدة بنفس قواعد
 * الكتالوج (غير ظاهرة في المتجر)، ثم يضيف البنود للشحنة (ويُحدِّث حساب المورد إن كانت مشتراة).
 */
export async function applyImport(shipmentId: string, file: File, userId: string): Promise<number> {
  const { shipment, plan } = await planFor(shipmentId, file);
  if (plan.errors.length) throw new ShipmentError("في الملف أخطاء — راجعي المعاينة.");
  const ids = new Map<string, string>();
  for (const p of plan.newProducts) {
    const productId = await createProduct(
      {
        nameAr: p.nameAr,
        nameEn: null,
        descriptionAr: null,
        descriptionEn: null,
        categoryId: p.categoryId,
        type: p.type,
        unit: p.unit,
        trackExpiry: p.trackExpiry,
        isActive: true,
        isWebVisible: false,
        variants: p.variants.map((v) => ({ ...v, isActive: true })),
      },
      userId,
    );
    const created = await prisma.productVariant.findMany({ where: { productId }, orderBy: { sortOrder: "asc" } });
    p.variants.forEach((v, i) => {
      const id = created[i]?.id;
      if (id) ids.set(v.key, id);
    });
  }
  const lines = [
    ...shipment.lines
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((l) => ({ variantId: l.variantId, qty: l.qty.toString(), unitPrice: l.unitPrice.toString() })),
    ...plan.lines.map((l) => {
      const variantId = l.variantId ?? (l.newKey ? ids.get(l.newKey) : undefined);
      if (!variantId) throw new Error("import variant missing");
      return { variantId, qty: l.qty, unitPrice: l.unitPrice };
    }),
  ];
  await saveShipmentLines(shipmentId, lines, userId);
  return plan.lines.length;
}
