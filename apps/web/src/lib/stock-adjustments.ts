import {
  CoreError,
  Decimal,
  adjustmentNoteRequired,
  canApproveAdjustment,
  consumeBatches,
  dec,
  estimateAdjustmentUsd,
  planAdjustment,
  signedAdjustmentQty,
  variantLabel,
  type AdjustmentReason,
} from "@ghusn/core";
import { Prisma, prisma, type StockAdjustmentStatus } from "@ghusn/db";
import { roleCan } from "./auth/permissions";
import { nextDocumentNumber } from "./documents";
import { formatAmount } from "./format";
import { notify } from "./notifications";
import { PrivateImageError, savePrivateImage } from "./private-images";
import { kickPushDelivery } from "./push";
import { getStockSettings } from "./settings";
import { lockStockLevel } from "./stock";

/**
 * تسويات المخزون (D-111): تُسجَّل لصنف واحد بسبب، ولا يتغير الرصيد حتى تُعتمد. المديرة تعتمد حتى
 * الحد في الضبط، والمالك بلا حد؛ من يملك اعتماد قيمتها تُعتمد تسويته فوراً. الاعتماد يصرف من
 * الدفعات (الأقرب انتهاءً أولاً) ويكتب حركة «تسوية» قيمتها بمتوسط التكلفة لحظتها.
 */

type Tx = Prisma.TransactionClient;
type Actor = { id: string; role: unknown };

export class AdjustmentError extends Error {}

export const REASON_LABELS: Record<AdjustmentReason, string> = {
  DAMAGED: "تالف",
  EXPIRED: "منتهي الصلاحية",
  LOST: "مفقود",
  INTERNAL_USE: "استخدام داخلي / عيّنة",
  FOUND: "زيادة وُجدت",
  COUNT: "فرق جرد",
};

export const STATUS_LABELS: Record<StockAdjustmentStatus, string> = {
  PENDING: "بانتظار الاعتماد",
  APPROVED: "معتمدة",
  REJECTED: "مرفوضة",
};

const UNIT_LABEL: Record<string, string> = { PIECE: "حبة", METER: "متر", SHEET: "ورقة" };
const qtyText = (qty: Decimal | string, unit: string) => `${dec(qty).toFixed()} ${UNIT_LABEL[unit] ?? unit}`;
const usd = (v: Decimal | string) => `${formatAmount(dec(v).abs().toFixed(2))} $`;

async function approvalRights(user: Actor) {
  const { managerAdjustLimitUsd } = await getStockSettings();
  return {
    limitUsd: managerAdjustLimitUsd,
    canApprove: roleCan(user.role, { stock: ["approve"] }),
    unlimited: roleCan(user.role, { stock: ["approveAll"] }),
    seesCost: roleCan(user.role, { cost: ["read"] }),
  };
}

function coreMessage(e: unknown, unit: string, levelQty: string): never {
  if (e instanceof CoreError) {
    if (e.code === "INSUFFICIENT_STOCK") {
      throw new AdjustmentError(`الرصيد في النظام ${qtyText(levelQty, unit)} — لا يمكن إنقاص أكثر منه.`);
    }
    if (e.code === "COST_REQUIRED") {
      throw new AdjustmentError("هذا الصنف ليس له تكلفة في النظام — أدخلي تكلفة الوحدة بالدولار.");
    }
    if (e.code === "INVALID_QUANTITY") throw new AdjustmentError("الكمية غير صحيحة.");
  }
  throw e;
}

/**
 * التنفيذ داخل المعاملة: الرصيد والمتوسط والدفعات والحركة، ثم تثبيت القيمة على التسوية.
 * فرق الجرد (allowNegative) يُطبَّق حتى لو نزل الرصيد تحت الصفر (D-112).
 */
export async function applyAdjustment(
  tx: Tx,
  adj: { id: string; number: string; variantId: string; reason: AdjustmentReason; qty: string; unit: string },
  userId: string,
  enteredUnitCostUsd: string | null,
  options: { allowNegative?: boolean } = {},
): Promise<{ valueUsd: Decimal }> {
  const level = await lockStockLevel(tx, adj.variantId);
  let plan;
  try {
    plan = planAdjustment({
      qty: adj.qty,
      levelQty: level.qty,
      avgCostUsd: level.avgCostUsd,
      enteredUnitCostUsd,
      allowNegative: options.allowNegative,
    });
  } catch (e) {
    coreMessage(e, adj.unit, level.qty);
  }
  const qty = dec(adj.qty);
  let batchId: string | null = null;
  if (qty.lt(0)) {
    const batches = await tx.$queryRaw<
      { id: string; qtyRemaining: Prisma.Decimal; expiresAt: Date | null; receivedAt: Date }[]
    >`SELECT "id", "qtyRemaining", "expiresAt", "receivedAt" FROM "StockBatch"
      WHERE "variantId" = ${adj.variantId} AND "qtyRemaining" > 0 FOR UPDATE`;
    // دفعات أقل من الرصيد (بيع دون اتصال سابق) لا تمنع التسوية: يُصرف ما فيها
    const { takes } = consumeBatches(
      batches.map((b) => ({
        id: b.id,
        qtyRemaining: b.qtyRemaining.toString(),
        expiresAt: b.expiresAt ? b.expiresAt.toISOString().slice(0, 10) : null,
        receivedAt: b.receivedAt,
      })),
      qty.abs(),
    );
    for (const t of takes) {
      await tx.stockBatch.update({ where: { id: t.batchId }, data: { qtyRemaining: { decrement: t.qty.toFixed() } } });
    }
    batchId = takes.length === 1 ? takes[0]!.batchId : null;
  } else {
    // الزيادة تُضاف لأحدث دفعة (كالمرتجع)؛ صنف بلا دفعات تُنشأ له دفعة بالتكلفة المعتمدة
    const [latest] = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "StockBatch" WHERE "variantId" = ${adj.variantId}
      ORDER BY "receivedAt" DESC LIMIT 1 FOR UPDATE`;
    if (latest) {
      await tx.stockBatch.update({ where: { id: latest.id }, data: { qtyRemaining: { increment: qty.toFixed() } } });
      batchId = latest.id;
    } else {
      const batch = await tx.stockBatch.create({
        data: {
          variantId: adj.variantId,
          qtyReceived: qty.toFixed(),
          qtyRemaining: qty.toFixed(),
          landedUnitUsd: plan.unitCostUsd.toFixed(6),
          receivedAt: new Date(),
        },
      });
      batchId = batch.id;
    }
  }
  await tx.stockLevel.update({
    where: { variantId: adj.variantId },
    data: { qty: plan.qtyAfter.toFixed(), avgCostUsd: plan.avgAfterUsd.toFixed(6) },
  });
  await tx.stockMovement.create({
    data: {
      variantId: adj.variantId,
      batchId,
      kind: "ADJUSTMENT",
      qty: qty.toFixed(),
      unitCostUsd: plan.unitCostUsd.toFixed(6),
      valueUsd: plan.valueUsd.toFixed(2),
      expenseUsd: plan.expenseUsd.toFixed(2),
      qtyAfter: plan.qtyAfter.toFixed(),
      avgCostAfterUsd: plan.avgAfterUsd.toFixed(6),
      adjustmentId: adj.id,
      note: `${adj.number} · ${REASON_LABELS[adj.reason]}`,
      createdById: userId,
    },
  });
  await tx.stockAdjustment.update({
    where: { id: adj.id },
    data: {
      status: "APPROVED",
      unitCostUsd: plan.unitCostUsd.toFixed(6),
      valueUsd: plan.valueUsd.toFixed(2),
      costEntered: plan.costEntered,
      decidedById: userId,
      decidedAt: new Date(),
    },
  });
  return { valueUsd: plan.valueUsd };
}

/** اعتُمدت تسوية ليس المالك من اعتمدها ← إشعار عادي له (رقابة عن بُعد). */
async function notifyApproved(
  tx: Tx,
  a: { id: string; number: string; reason: AdjustmentReason; label: string; qty: string; unit: string },
  valueUsd: Decimal,
  decider: Actor & { name: string },
) {
  if (roleCan(decider.role, { capital: ["update"] })) return;
  await notify(tx, {
    type: "STOCK_ADJUSTED",
    priority: "NORMAL",
    title: `اعتُمدت تسوية · ${REASON_LABELS[a.reason]}`,
    body: `${a.label} · ${qtyText(a.qty, a.unit)} · ${valueUsd.lt(0) ? "−" : "+"}${usd(valueUsd)} · اعتمدتها ${decider.name}`,
    href: `/admin/stock/adjustments?focus=${a.id}`,
    dedupeKey: `STOCK_ADJUSTED:${a.id}`,
    audience: { capital: ["update"] },
  });
}

export interface AdjustmentInput {
  variantId: string;
  reason: AdjustmentReason;
  qty: string;
  note: string | null;
  photo: File | null;
  /** لزيادة صنف بلا تكلفة — من يرى التكاليف فقط. */
  unitCostUsd: string | null;
}

/**
 * تسجيل تسوية. من تملك اعتماد قيمتها (المديرة حتى الحد، والمالك) تُنفَّذ فوراً؛ غيرها تنتظر
 * ويصل إشعار لمن يستطيع اعتمادها.
 */
export async function createAdjustment(
  input: AdjustmentInput,
  user: Actor & { name: string },
): Promise<{ id: string; number: string; approved: boolean }> {
  if (input.reason === "COUNT") throw new AdjustmentError("فرق الجرد يُسجَّل من شاشة الجرد.");
  const variant = await prisma.productVariant.findFirst({
    where: { id: input.variantId, deletedAt: null, product: { deletedAt: null } },
    include: { product: { select: { nameAr: true, unit: true } }, stockLevel: true },
  });
  if (!variant) throw new AdjustmentError("اختاري الصنف.");
  const unit = variant.product.unit;
  const label = [variant.product.nameAr, variantLabel(variant)].filter(Boolean).join(" · ");
  if (adjustmentNoteRequired(input.reason) && !input.note) {
    throw new AdjustmentError("اكتبي ملاحظة توضّح ما حدث — مطلوبة للمفقود والزيادة.");
  }
  let qty: Decimal;
  try {
    qty = signedAdjustmentQty(input.reason, input.qty);
  } catch {
    throw new AdjustmentError("أدخلي كمية أكبر من صفر.");
  }
  if (unit === "PIECE" && !qty.isInteger()) throw new AdjustmentError("الكمية بالحبة عدد صحيح.");
  const levelQty = variant.stockLevel?.qty.toString() ?? "0";
  const avg = variant.stockLevel?.avgCostUsd.toString() ?? "0";
  if (qty.lt(0) && qty.abs().gt(Decimal.max(levelQty, 0))) {
    throw new AdjustmentError(`الرصيد في النظام ${qtyText(levelQty, unit)} — لا يمكن إنقاص أكثر منه.`);
  }

  const rights = await approvalRights(user);
  const entered = rights.seesCost ? input.unitCostUsd : null;
  const estimate = estimateAdjustmentUsd(qty, avg, entered);
  const missingCost = qty.gt(0) && !dec(avg).gt(0) && !(entered && dec(entered).gt(0));
  // يعتمدها فوراً من يملك اعتماد قيمتها — إلا زيادة بلا تكلفة لم تُدخل تكلفتها (تنتظر من يدخلها)
  const auto = canApproveAdjustment({ valueUsd: estimate, ...rights }) && !(missingCost && !rights.seesCost);
  if (auto && missingCost) {
    throw new AdjustmentError("هذا الصنف ليس له تكلفة في النظام — أدخلي تكلفة الوحدة بالدولار.");
  }

  let photoKey: string | null = null;
  if (input.photo && input.photo.size > 0) {
    try {
      photoKey = await savePrivateImage(input.photo, "adjustments");
    } catch (e) {
      if (e instanceof PrivateImageError) {
        throw new AdjustmentError(
          e.code === "TOO_LARGE" ? "الصورة أكبر من 10 ميغابايت." : "تعذّرت قراءة الصورة. استخدمي JPG أو PNG أو WebP.",
        );
      }
      throw e;
    }
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const adj = await tx.stockAdjustment.create({
      data: {
        number: await nextDocumentNumber(tx, "ADJ", now, 4),
        variantId: variant.id,
        reason: input.reason,
        qty: qty.toFixed(),
        note: input.note,
        photoKey,
        requestedById: user.id,
        createdAt: now,
      },
    });
    const a = { id: adj.id, number: adj.number, variantId: variant.id, reason: input.reason, qty: qty.toFixed(), unit };
    if (auto) {
      const { valueUsd } = await applyAdjustment(tx, a, user.id, entered);
      await notifyApproved(tx, { ...a, label }, valueUsd, user);
      return { id: adj.id, number: adj.number, approved: true };
    }
    // للمعتمِدات: المديرة إن كانت ضمن حدها، وإلا المالك فقط (صنف بلا تكلفة: تُفحص قيمته عند الاعتماد)
    const withinLimit = dec(estimate).lte(rights.limitUsd);
    await notify(tx, {
      type: "STOCK_ADJUSTMENT",
      priority: "IMPORTANT",
      title: `تسوية بانتظار اعتمادك · ${REASON_LABELS[input.reason]}`,
      body: [
        label,
        qtyText(qty, unit),
        missingCost ? "صنف بلا تكلفة — أدخلي تكلفته" : `≈ ${usd(estimate)}`,
        `سجّلتها ${user.name}`,
        ...(input.note ? [`«${input.note}»`] : []),
      ].join(" · "),
      href: `/admin/stock/adjustments?focus=${adj.id}`,
      dedupeKey: `STOCK_ADJUSTMENT:${adj.id}`,
      audience: withinLimit ? { stock: ["approve"] } : { stock: ["approveAll"] },
    });
    return { id: adj.id, number: adj.number, approved: false };
  });
  kickPushDelivery();
  return result;
}

/** يقفل تسوية منتظرة ويعيدها مع صنفها، أو يرفض إن حُسمت. */
async function lockPending(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "StockAdjustment" WHERE "id" = ${id} FOR UPDATE`;
  const adj = await tx.stockAdjustment.findUnique({
    where: { id },
    include: { variant: { include: { product: { select: { nameAr: true, unit: true } }, stockLevel: true } } },
  });
  if (!adj) throw new AdjustmentError("التسوية غير موجودة.");
  if (adj.status !== "PENDING") throw new AdjustmentError("حُسمت هذه التسوية من قبل — حدّثي الصفحة.");
  return adj;
}

/** اعتماد تسوية منتظرة — يُعاد حساب قيمتها بمتوسط التكلفة الآن ويُفحص الحد عليها. */
export async function approveAdjustment(
  id: string,
  user: Actor & { name: string },
  unitCostUsd: string | null,
): Promise<void> {
  const rights = await approvalRights(user);
  if (!rights.canApprove && !rights.unlimited) throw new AdjustmentError("ليست لديك صلاحية الاعتماد.");
  await prisma.$transaction(async (tx) => {
    const adj = await lockPending(tx, id);
    const avg = adj.variant.stockLevel?.avgCostUsd.toString() ?? "0";
    const entered = rights.seesCost ? unitCostUsd : null;
    const estimate = estimateAdjustmentUsd(adj.qty.toString(), avg, entered);
    if (!canApproveAdjustment({ valueUsd: estimate, ...rights })) {
      throw new AdjustmentError(
        `القيمة ${usd(estimate)} فوق حد اعتمادك (${usd(String(rights.limitUsd))}) — يعتمدها المالك.`,
      );
    }
    const label = [adj.variant.product.nameAr, variantLabel(adj.variant)].filter(Boolean).join(" · ");
    const a = {
      id: adj.id,
      number: adj.number,
      variantId: adj.variantId,
      reason: adj.reason,
      qty: adj.qty.toString(),
      unit: adj.variant.product.unit,
    };
    const { valueUsd } = await applyAdjustment(tx, a, user.id, entered);
    await notifyApproved(tx, { ...a, label }, valueUsd, user);
  });
  kickPushDelivery();
}

/** رفض تسوية منتظرة بسبب مكتوب — يصل إشعار لمن سجّلتها. */
export async function rejectAdjustment(id: string, reason: string, user: Actor & { name: string }): Promise<void> {
  const rights = await approvalRights(user);
  await prisma.$transaction(async (tx) => {
    const adj = await lockPending(tx, id);
    const estimate = estimateAdjustmentUsd(adj.qty.toString(), adj.variant.stockLevel?.avgCostUsd.toString() ?? "0");
    if (!canApproveAdjustment({ valueUsd: estimate, ...rights })) {
      throw new AdjustmentError("هذه التسوية يحسمها المالك.");
    }
    await tx.stockAdjustment.update({
      where: { id },
      data: { status: "REJECTED", rejectReason: reason, decidedById: user.id, decidedAt: new Date() },
    });
    if (adj.requestedById !== user.id) {
      const label = [adj.variant.product.nameAr, variantLabel(adj.variant)].filter(Boolean).join(" · ");
      await notify(tx, {
        type: "STOCK_ADJUSTED",
        priority: "NORMAL",
        title: `رُفضت التسوية · ${adj.number}`,
        body: `${label} · ${qtyText(adj.qty.toString(), adj.variant.product.unit)} · «${reason}» — ${user.name}`,
        href: `/admin/stock/adjustments?focus=${adj.id}`,
        dedupeKey: `STOCK_REJECTED:${adj.id}`,
        to: [adj.requestedById],
      });
    }
  });
  kickPushDelivery();
}

// ---------- القراءة ----------

export interface AdjustmentFilter {
  status?: StockAdjustmentStatus;
  reason?: AdjustmentReason;
  range?: { start: Date; end: Date };
  /** الموظفة ترى ما سجّلته فقط. */
  onlyUserId?: string;
  take?: number;
}

/** قائمة التسويات للعرض. القيمة بالدولار لمن يرى التكاليف فقط. */
export async function listAdjustments(filter: AdjustmentFilter, withCost: boolean) {
  const rows = await prisma.stockAdjustment.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.reason ? { reason: filter.reason } : {}),
      ...(filter.range ? { createdAt: { gte: filter.range.start, lt: filter.range.end } } : {}),
      ...(filter.onlyUserId ? { requestedById: filter.onlyUserId } : {}),
    },
    orderBy: { createdAt: filter.status === "PENDING" ? "asc" : "desc" },
    take: filter.take ?? 200,
    include: {
      variant: { include: { product: { select: { id: true, nameAr: true, unit: true } }, stockLevel: true } },
      requestedBy: { select: { name: true } },
      decidedBy: { select: { name: true } },
    },
  });
  return rows.map((a) => {
    const avg = a.variant.stockLevel?.avgCostUsd.toString() ?? "0";
    const qty = a.qty.toString();
    return {
      id: a.id,
      number: a.number,
      variantId: a.variantId,
      productId: a.variant.product.id,
      label: [a.variant.product.nameAr, variantLabel(a.variant)].filter(Boolean).join(" · "),
      unit: a.variant.product.unit,
      reason: a.reason,
      qty,
      note: a.note,
      hasPhoto: !!a.photoKey,
      status: a.status,
      requestedById: a.requestedById,
      requestedBy: a.requestedBy.name,
      createdAt: a.createdAt,
      decidedBy: a.decidedBy?.name ?? null,
      decidedAt: a.decidedAt,
      rejectReason: a.rejectReason,
      ...(withCost
        ? {
            valueUsd:
              a.valueUsd?.toString() ??
              (a.status === "PENDING"
                ? estimateAdjustmentUsd(qty, avg)
                    .mul(dec(qty).lt(0) ? -1 : 1)
                    .toFixed(2)
                : null),
            /** صنف بلا تكلفة: يحتاج إدخالها عند الاعتماد. */
            needsCost: a.status === "PENDING" && dec(qty).gt(0) && !dec(avg).gt(0),
          }
        : {}),
    };
  });
}

/** عدد المنتظرة التي تستطيع هذه المستخدمة حسمها (للشارة في المخزون). */
export async function countPendingFor(user: Actor): Promise<number> {
  const rights = await approvalRights(user);
  if (!rights.canApprove && !rights.unlimited) return 0;
  if (rights.unlimited) return prisma.stockAdjustment.count({ where: { status: "PENDING" } });
  const rows = await prisma.stockAdjustment.findMany({
    where: { status: "PENDING" },
    select: { qty: true, variant: { select: { stockLevel: { select: { avgCostUsd: true } } } } },
  });
  return rows.filter((r) =>
    canApproveAdjustment({
      valueUsd: estimateAdjustmentUsd(r.qty.toString(), r.variant.stockLevel?.avgCostUsd.toString() ?? "0"),
      ...rights,
    }),
  ).length;
}

/** التسويات المنتظرة لكل صنف (صافي الكمية) — سطر تحت الصنف في شاشة المخزون. */
export async function pendingByVariant(variantIds: string[]): Promise<Map<string, string>> {
  if (!variantIds.length) return new Map();
  const rows = await prisma.stockAdjustment.groupBy({
    by: ["variantId"],
    where: { status: "PENDING", variantId: { in: variantIds } },
    _sum: { qty: true },
  });
  return new Map(rows.map((r) => [r.variantId, r._sum.qty?.toString() ?? "0"]));
}

export async function getAdjustmentPhoto(id: string) {
  return prisma.stockAdjustment.findUnique({ where: { id }, select: { photoKey: true, requestedById: true } });
}

/** خيار صنف للنموذج: الاسم والرصيد والوحدة، والتكلفة لمن يراها. */
export async function adjustmentVariant(variantId: string, withCost: boolean) {
  const v = await prisma.productVariant.findFirst({
    where: { id: variantId, deletedAt: null, product: { deletedAt: null } },
    include: { product: { select: { nameAr: true, unit: true } }, stockLevel: true },
  });
  if (!v) return null;
  const avg = v.stockLevel?.avgCostUsd.toString() ?? "0";
  return {
    variantId: v.id,
    label: [v.product.nameAr, variantLabel(v)].filter(Boolean).join(" · "),
    sku: v.sku,
    unit: v.product.unit,
    qty: v.stockLevel?.qty.toString() ?? "0",
    ...(withCost ? { avgCostUsd: avg, hasCost: dec(avg).gt(0) } : {}),
  };
}

/** مسح باركود أو SKU كامل ← الصنف مباشرة (قارئ الباركود يكتب الرمز ثم Enter). */
export async function findVariantByCode(code: string): Promise<string | null> {
  const c = code.trim();
  if (!c) return null;
  const v = await prisma.productVariant.findFirst({
    where: { deletedAt: null, product: { deletedAt: null }, OR: [{ barcode: c }, { sku: c }] },
    select: { id: true },
  });
  return v?.id ?? null;
}
