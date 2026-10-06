import {
  canApproveAdjustment,
  countDifference,
  dec,
  fullCountDue,
  searchTerms,
  shopDay,
  summarizeCount,
  variantLabel,
  weeklySection,
  type Decimal,
} from "@ghusn/core";
import { Prisma, prisma, type StockCountScope, type StockCountStatus } from "@ghusn/db";
import { roleCan } from "./auth/permissions";
import { nextDocumentNumber } from "./documents";
import { formatAmount } from "./format";
import { notify } from "./notifications";
import { kickPushDelivery } from "./push";
import { getStockSettings } from "./settings";
import { applyAdjustment } from "./stock-adjustments";

/**
 * الجرد (D-112): المديرة تبدأ جرداً (المحل كله، قسم، أو عدّ سريع)، والموظفات يعددن بالمسح دون أن
 * يرين رصيد النظام (عدّ أعمى). رصيد النظام يُلتقط لحظة عدّ كل صنف، والفرق يُطبَّق على الرصيد الحالي
 * عند الاعتماد — فلا داعي لإغلاق المحل. المراجِعة تطلب إعادة عدّ ما تشك فيه، ثم تعتمد: كل فرق
 * يصبح تسوية «فرق جرد» (D-111) بمتوسط التكلفة؛ الصافي فوق حد المديرة يعتمده المالك.
 */

type Actor = { id: string; role: unknown; name: string };
export class CountError extends Error {}

export const SCOPE_LABELS: Record<StockCountScope, string> = {
  FULL: "جرد كامل",
  CATEGORY: "جرد قسم",
  QUICK: "عدّ سريع",
};
export const COUNT_STATUS_LABELS: Record<StockCountStatus, string> = {
  OPEN: "العد جارٍ",
  SUBMITTED: "بانتظار المراجعة",
  APPROVED: "معتمد",
  CANCELLED: "ملغى",
};
/** العدّ السريع: كل رصيد سالب + أغلى الأصناف تكلفةً مما في المخزون. */
const QUICK_TOP_COST = 10;
const UNIT_LABEL: Record<string, string> = { PIECE: "حبة", METER: "متر", SHEET: "ورقة" };
const usd = (v: Decimal) => `${formatAmount(v.abs().toFixed(2))} $`;
const ACTIVE: StockCountStatus[] = ["OPEN", "SUBMITTED"];

const lineLabel = (v: {
  size: string | null;
  color: string | null;
  volume: string | null;
  product: { nameAr: string };
}) => [v.product.nameAr, variantLabel(v)].filter(Boolean).join(" · ");

function countTitle(c: { scope: StockCountScope; category: { nameAr: string } | null }) {
  return c.scope === "CATEGORY" && c.category
    ? `${SCOPE_LABELS.CATEGORY} · ${c.category.nameAr}`
    : SCOPE_LABELS[c.scope];
}

// ---------- البدء ----------

/** الجرد الجاري (واحد فقط في كل وقت — أبسط للمحل وتمنع عدّ الصنف في جردين). */
export const activeCount = () =>
  prisma.stockCount.findFirst({
    where: { status: { in: ACTIVE } },
    include: { category: { select: { nameAr: true } } },
  });

export async function startCount(
  input: { scope: StockCountScope; categoryId: string | null },
  user: Actor,
): Promise<string> {
  if (await activeCount()) throw new CountError("يوجد جرد جارٍ — أنهيه أو ألغيه أولاً.");
  const base: Prisma.ProductVariantWhereInput = { deletedAt: null, product: { deletedAt: null } };
  let variantIds: string[];
  if (input.scope === "CATEGORY") {
    if (!input.categoryId) throw new CountError("اختاري القسم.");
    const rows = await prisma.productVariant.findMany({
      where: { ...base, product: { deletedAt: null, categoryId: input.categoryId } },
      select: { id: true },
    });
    variantIds = rows.map((r) => r.id);
  } else if (input.scope === "QUICK") {
    const [negative, costly] = await Promise.all([
      prisma.stockLevel.findMany({ where: { qty: { lt: 0 }, variant: base }, select: { variantId: true } }),
      prisma.stockLevel.findMany({
        where: { qty: { gt: 0 }, variant: base },
        orderBy: { avgCostUsd: "desc" },
        take: QUICK_TOP_COST,
        select: { variantId: true },
      }),
    ]);
    variantIds = [...new Set([...negative, ...costly].map((r) => r.variantId))];
  } else {
    const rows = await prisma.productVariant.findMany({ where: base, select: { id: true } });
    variantIds = rows.map((r) => r.id);
  }
  if (!variantIds.length) throw new CountError("لا توجد أصناف لهذا الجرد.");
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const c = await tx.stockCount.create({
      data: {
        number: await nextDocumentNumber(tx, "CNT", now),
        scope: input.scope,
        categoryId: input.scope === "CATEGORY" ? input.categoryId : null,
        createdById: user.id,
        createdAt: now,
      },
    });
    await tx.stockCountLine.createMany({ data: variantIds.map((variantId) => ({ countId: c.id, variantId })) });
    return c.id;
  });
}

// ---------- العد (عدّ أعمى: لا يُرسل رصيد النظام لمن تعدّ) ----------

export interface CounterLine {
  lineId: string;
  label: string;
  sku: string;
  unit: string;
  status: "PENDING" | "COUNTED" | "MISSING" | "RECOUNT";
  countedQty: string | null;
}

const counterSelect = {
  id: true,
  status: true,
  countedQty: true,
  variant: {
    select: { sku: true, size: true, color: true, volume: true, product: { select: { nameAr: true, unit: true } } },
  },
} satisfies Prisma.StockCountLineSelect;

function toCounterLine(l: Prisma.StockCountLineGetPayload<{ select: typeof counterSelect }>): CounterLine {
  return {
    lineId: l.id,
    label: lineLabel(l.variant),
    sku: l.variant.sku,
    unit: l.variant.product.unit,
    status: l.status,
    countedQty: l.countedQty?.toString() ?? null,
  };
}

/** شاشة العد: التقدم، ما طُلبت إعادة عدّه، وآخر ما عُدّ — بلا أرقام النظام. */
export async function counterView(countId: string) {
  const c = await prisma.stockCount.findUnique({
    where: { id: countId },
    include: { category: { select: { nameAr: true } } },
  });
  if (!c) return null;
  const [byStatus, recount, recent, pending] = await Promise.all([
    prisma.stockCountLine.groupBy({ by: ["status"], where: { countId }, _count: true }),
    prisma.stockCountLine.findMany({ where: { countId, status: "RECOUNT" }, select: counterSelect }),
    prisma.stockCountLine.findMany({
      where: { countId, status: { in: ["COUNTED", "MISSING"] } },
      orderBy: { countedAt: "desc" },
      take: 8,
      select: { ...counterSelect, countedBy: { select: { name: true } } },
    }),
    prisma.stockCountLine.findMany({
      where: { countId, status: "PENDING" },
      orderBy: { variant: { product: { nameAr: "asc" } } },
      take: 200,
      select: counterSelect,
    }),
  ]);
  const n = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
  const total = byStatus.reduce((a, b) => a + b._count, 0);
  return {
    id: c.id,
    number: c.number,
    title: countTitle(c),
    status: c.status,
    total,
    done: n("COUNTED") + n("MISSING"),
    pendingCount: n("PENDING"),
    recount: recount.map(toCounterLine),
    recent: recent.map((l) => ({ ...toCounterLine(l), by: l.countedBy?.name ?? null })),
    pending: pending.map(toCounterLine),
  };
}

/** مسح باركود/SKU أو اختيار من البحث ← سطر الصنف في هذا الجرد. */
export async function findCountLine(countId: string, code: string): Promise<CounterLine | null> {
  const c = code.trim();
  if (!c) return null;
  const line = await prisma.stockCountLine.findFirst({
    where: { countId, variant: { OR: [{ barcode: c }, { sku: c }] } },
    select: counterSelect,
  });
  return line ? toCounterLine(line) : null;
}

export async function searchCountLines(countId: string, query: string): Promise<CounterLine[]> {
  const terms = searchTerms(query);
  if (!terms.length) return [];
  const lines = await prisma.stockCountLine.findMany({
    where: { countId, variant: { product: { AND: terms.map((t) => ({ searchText: { contains: t } })) } } },
    take: 12,
    select: counterSelect,
  });
  return lines.map(toCounterLine);
}

async function snapshotQty(tx: Prisma.TransactionClient, variantId: string): Promise<string> {
  const level = await tx.stockLevel.findUnique({ where: { variantId }, select: { qty: true } });
  return level?.qty.toString() ?? "0";
}

/** حفظ عدد صنف: يلتقط رصيد النظام في نفس اللحظة. الجرد المرسَل يقبل فقط ما طُلبت إعادة عدّه. */
export async function saveCountLine(lineId: string, qty: string, user: Actor): Promise<CounterLine> {
  const q = dec(qty);
  if (q.lt(0)) throw new CountError("العدد لا يكون سالباً.");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "StockCountLine" WHERE "id" = ${lineId} FOR UPDATE`;
    const line = await tx.stockCountLine.findUnique({
      where: { id: lineId },
      include: { count: { select: { status: true } }, variant: { select: { product: { select: { unit: true } } } } },
    });
    if (!line) throw new CountError("الصنف ليس في هذا الجرد.");
    const open = line.count.status === "OPEN" || (line.count.status === "SUBMITTED" && line.status === "RECOUNT");
    if (!open) throw new CountError("انتهى العد في هذا الجرد.");
    if (line.variant.product.unit === "PIECE" && !q.isInteger()) throw new CountError("العدد بالحبة عدد صحيح.");
    const saved = await tx.stockCountLine.update({
      where: { id: lineId },
      data: {
        status: "COUNTED",
        countedQty: q.toFixed(),
        systemQty: await snapshotQty(tx, line.variantId),
        countedById: user.id,
        countedAt: new Date(),
      },
      select: counterSelect,
    });
    return toCounterLine(saved);
  });
}

/** «غير موجود على الرف» لأصناف بعينها، أو لكل ما لم يُعدّ — العدد صفر ويُلتقط رصيد النظام لكل صنف. */
export async function markMissing(countId: string, lineIds: string[] | "all", user: Actor): Promise<number> {
  const c = await prisma.stockCount.findUnique({ where: { id: countId }, select: { status: true } });
  if (c?.status !== "OPEN") throw new CountError("انتهى العد في هذا الجرد.");
  const ids = lineIds === "all" ? null : lineIds;
  if (ids && !ids.length) return 0;
  return prisma.$executeRaw`
    UPDATE "StockCountLine" l
       SET "status" = 'MISSING', "countedQty" = 0,
           "systemQty" = COALESCE((SELECT s."qty" FROM "StockLevel" s WHERE s."variantId" = l."variantId"), 0),
           "countedById" = ${user.id}, "countedAt" = now()
     WHERE l."countId" = ${countId} AND l."status" = 'PENDING'
       ${ids ? Prisma.sql`AND l."id" IN (${Prisma.join(ids)})` : Prisma.empty}`;
}

// ---------- المراجعة والاعتماد ----------

async function reviewLines(countId: string) {
  const lines = await prisma.stockCountLine.findMany({
    where: { countId },
    orderBy: [{ variant: { product: { nameAr: "asc" } } }, { variant: { sortOrder: "asc" } }],
    include: {
      variant: {
        select: {
          id: true,
          sku: true,
          size: true,
          color: true,
          volume: true,
          product: { select: { nameAr: true, unit: true } },
          stockLevel: { select: { qty: true, avgCostUsd: true } },
        },
      },
      countedBy: { select: { name: true } },
    },
  });
  return lines.map((l) => {
    const avg = l.variant.stockLevel?.avgCostUsd.toString() ?? "0";
    const counted = l.countedQty !== null && l.systemQty !== null;
    const difference = counted ? countDifference(l.countedQty!.toString(), l.systemQty!.toString()) : dec(0);
    return {
      lineId: l.id,
      variantId: l.variantId,
      label: lineLabel(l.variant),
      sku: l.variant.sku,
      unit: l.variant.product.unit,
      status: l.status,
      systemQty: l.systemQty?.toString() ?? null,
      countedQty: l.countedQty?.toString() ?? null,
      difference,
      avgCostUsd: avg,
      /** زيادة لصنف بلا تكلفة: تُدخل تكلفته عند الاعتماد (D-111). */
      needsCost: difference.gt(0) && !dec(avg).gt(0),
      countedBy: l.countedBy?.name ?? null,
      countedById: l.countedById,
      countedAt: l.countedAt,
      adjustmentId: l.adjustmentId,
    };
  });
}

function summaryOf(lines: Awaited<ReturnType<typeof reviewLines>>, costs: Record<string, string> = {}) {
  return summarizeCount(
    lines
      .filter((l) => l.status === "COUNTED" || l.status === "MISSING")
      .map((l) => ({
        difference: l.difference,
        unitCostUsd: dec(l.avgCostUsd).gt(0)
          ? l.avgCostUsd
          : costs[l.lineId] && /^\d+(\.\d+)?$/.test(costs[l.lineId]!)
            ? costs[l.lineId]!
            : "0",
      })),
  );
}

/** شاشة المراجعة (للمعتمِدات): رصيد النظام وقت العد، المعدود، الفرق وقيمته. */
export async function countReview(countId: string) {
  const c = await prisma.stockCount.findUnique({
    where: { id: countId },
    include: {
      category: { select: { nameAr: true } },
      createdBy: { select: { name: true } },
      submittedBy: { select: { name: true } },
      decidedBy: { select: { name: true } },
    },
  });
  if (!c) return null;
  const lines = await reviewLines(countId);
  return {
    id: c.id,
    number: c.number,
    title: countTitle(c),
    scope: c.scope,
    status: c.status,
    createdBy: c.createdBy.name,
    createdAt: c.createdAt,
    submittedBy: c.submittedBy?.name ?? null,
    submittedAt: c.submittedAt,
    decidedBy: c.decidedBy?.name ?? null,
    decidedAt: c.decidedAt,
    cancelReason: c.cancelReason,
    lines,
    summary: summaryOf(lines),
    recountCount: lines.filter((l) => l.status === "RECOUNT").length,
    pendingCount: lines.filter((l) => l.status === "PENDING").length,
  };
}

async function approvalRights(user: Actor) {
  const { managerAdjustLimitUsd } = await getStockSettings();
  return {
    limitUsd: managerAdjustLimitUsd,
    canApprove: roleCan(user.role, { stock: ["approve"] }),
    unlimited: roleCan(user.role, { stock: ["approveAll"] }),
  };
}

/** إنهاء العد وإرساله للمراجعة — لا يبقى صنف بلا عدّ («غير موجود» = صفر). */
export async function submitCount(countId: string, user: Actor): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "StockCount" WHERE "id" = ${countId} FOR UPDATE`;
    const c = await tx.stockCount.findUnique({
      where: { id: countId },
      include: { category: { select: { nameAr: true } } },
    });
    if (!c || c.status !== "OPEN") throw new CountError("هذا الجرد ليس قيد العد.");
    const pending = await tx.stockCountLine.count({ where: { countId, status: "PENDING" } });
    if (pending) throw new CountError(`بقي ${pending} صنف لم يُعدّ — عُدّيه أو اختاري «غير موجود».`);
    await tx.stockCount.update({
      where: { id: countId },
      data: { status: "SUBMITTED", submittedById: user.id, submittedAt: new Date() },
    });
    const s = summaryOf(await reviewLines(countId));
    const { managerAdjustLimitUsd } = await getStockSettings();
    await notify(tx, {
      type: "STOCK_COUNT",
      priority: "IMPORTANT",
      title: `جرد بانتظار مراجعتك · ${countTitle(c)}`,
      body: [
        c.number,
        `أرسلته ${user.name}`,
        s.shortageLines || s.surplusLines
          ? `عجز ${s.shortageLines} · زيادة ${s.surplusLines} · الصافي ${s.netUsd.lt(0) ? "−" : "+"}${usd(s.netUsd)}`
          : "كل الأصناف مطابقة",
      ].join(" · "),
      href: `/admin/stock/counts/${countId}`,
      dedupeKey: `COUNT_SUBMITTED:${countId}:${Date.now()}`,
      audience: s.netUsd.abs().lte(managerAdjustLimitUsd) ? { stock: ["approve"] } : { stock: ["approveAll"] },
    });
  });
  kickPushDelivery();
}

/** طلب إعادة عدّ صنف مشكوك فيه — يرجع لمن عدّته (إشعار) ويمنع الاعتماد حتى يُعاد. */
export async function requestRecount(lineId: string, user: Actor): Promise<void> {
  if (!roleCan(user.role, { stock: ["approve"] })) throw new CountError("ليست لديك صلاحية المراجعة.");
  await prisma.$transaction(async (tx) => {
    const line = await tx.stockCountLine.findUnique({
      where: { id: lineId },
      include: {
        count: { select: { id: true, number: true, status: true } },
        variant: { select: { size: true, color: true, volume: true, product: { select: { nameAr: true } } } },
      },
    });
    if (!line || line.count.status !== "SUBMITTED") throw new CountError("الجرد ليس بانتظار المراجعة.");
    if (line.status !== "COUNTED" && line.status !== "MISSING") throw new CountError("هذا الصنف لم يُعدّ بعد.");
    await tx.stockCountLine.update({ where: { id: lineId }, data: { status: "RECOUNT" } });
    if (line.countedById && line.countedById !== user.id) {
      await notify(tx, {
        type: "STOCK_COUNT",
        priority: "IMPORTANT",
        title: `أعيدي عدّ صنف · ${line.count.number}`,
        body: `${lineLabel(line.variant)} — طلبت ${user.name} إعادة عدّه`,
        href: `/admin/stock/counts/${line.count.id}/count`,
        dedupeKey: `COUNT_RECOUNT:${lineId}:${Date.now()}`,
        to: [line.countedById],
      });
    }
  });
  kickPushDelivery();
}

/**
 * اعتماد الجرد: كل فرق غير صفري يصبح تسوية «فرق جرد» معتمدة (بمتوسط التكلفة لحظتها، أو بالتكلفة
 * المدخلة لصنف بلا تكلفة)، تُطبَّق على الرصيد الحالي حتى لو نزل تحت الصفر. الصافي يُفحص على الحد.
 */
export async function approveCount(countId: string, user: Actor, costs: Record<string, string>): Promise<void> {
  const rights = await approvalRights(user);
  if (!rights.canApprove && !rights.unlimited) throw new CountError("ليست لديك صلاحية الاعتماد.");
  await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "StockCount" WHERE "id" = ${countId} FOR UPDATE`;
      const c = await tx.stockCount.findUnique({
        where: { id: countId },
        include: { category: { select: { nameAr: true } } },
      });
      if (!c || c.status !== "SUBMITTED") throw new CountError("الجرد ليس بانتظار المراجعة — حدّثي الصفحة.");
      const lines = await reviewLines(countId);
      if (lines.some((l) => l.status === "RECOUNT")) throw new CountError("ما زالت أصناف تنتظر إعادة العد.");
      if (lines.some((l) => l.status === "PENDING")) throw new CountError("بقيت أصناف لم تُعدّ.");
      const missingCost = lines.filter((l) => l.needsCost && !(costs[l.lineId] && dec(costs[l.lineId]!).gt(0)));
      if (missingCost.length) {
        throw new CountError(`أدخلي تكلفة الوحدة للأصناف بلا تكلفة: ${missingCost.map((l) => l.label).join("، ")}.`);
      }
      const s = summaryOf(lines, costs);
      if (!canApproveAdjustment({ valueUsd: s.netUsd, ...rights })) {
        throw new CountError(
          `صافي الفروقات ${usd(s.netUsd)} فوق حد اعتمادك (${formatAmount(String(rights.limitUsd))} $) — يعتمده المالك.`,
        );
      }
      const now = new Date();
      const diffs = lines.filter((l) => !l.difference.isZero()).sort((a, b) => a.variantId.localeCompare(b.variantId));
      for (const l of diffs) {
        const adj = await tx.stockAdjustment.create({
          data: {
            number: await nextDocumentNumber(tx, "ADJ", now, 4),
            variantId: l.variantId,
            reason: "COUNT",
            qty: l.difference.toFixed(),
            note: `${c.number} · النظام وقت العد ${dec(l.systemQty ?? "0").toFixed()} · المعدود ${dec(l.countedQty ?? "0").toFixed()}`,
            requestedById: l.countedById ?? user.id,
            countId,
            createdAt: now,
          },
        });
        await applyAdjustment(
          tx,
          {
            id: adj.id,
            number: adj.number,
            variantId: l.variantId,
            reason: "COUNT",
            qty: l.difference.toFixed(),
            unit: l.unit,
          },
          user.id,
          l.needsCost ? costs[l.lineId]! : null,
          { allowNegative: true },
        );
        await tx.stockCountLine.update({ where: { id: l.lineId }, data: { adjustmentId: adj.id } });
      }
      await tx.stockCount.update({
        where: { id: countId },
        data: { status: "APPROVED", decidedById: user.id, decidedAt: now },
      });
      if (!roleCan(user.role, { capital: ["update"] })) {
        await notify(tx, {
          type: "STOCK_ADJUSTED",
          priority: "NORMAL",
          title: `اعتُمد ${countTitle(c)} · ${c.number}`,
          body: diffs.length
            ? `عجز ${s.shortageLines} · زيادة ${s.surplusLines} · الصافي ${s.netUsd.lt(0) ? "−" : "+"}${usd(s.netUsd)} · اعتمدته ${user.name}`
            : `كل الأصناف مطابقة · اعتمدته ${user.name}`,
          href: `/admin/stock/counts/${countId}`,
          dedupeKey: `COUNT_APPROVED:${countId}`,
          audience: { capital: ["update"] },
        });
      }
    },
    // جرد كامل قد يحوي مئات الأصناف — كل فرق تسوية بحركتها
    { timeout: 120_000, maxWait: 10_000 },
  );
  kickPushDelivery();
}

export async function cancelCount(countId: string, reason: string, user: Actor): Promise<void> {
  if (!roleCan(user.role, { stock: ["approve"] })) throw new CountError("ليست لديك صلاحية الإلغاء.");
  const updated = await prisma.stockCount.updateMany({
    where: { id: countId, status: { in: ACTIVE } },
    data: { status: "CANCELLED", cancelReason: reason, decidedById: user.id, decidedAt: new Date() },
  });
  if (!updated.count) throw new CountError("لا يمكن إلغاء هذا الجرد.");
}

// ---------- القوائم ----------

export async function listCounts(take = 30) {
  const counts = await prisma.stockCount.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: {
      category: { select: { nameAr: true } },
      createdBy: { select: { name: true } },
      decidedBy: { select: { name: true } },
      _count: { select: { lines: true, adjustments: true } },
    },
  });
  const done = await prisma.stockCountLine.groupBy({
    by: ["countId"],
    where: { countId: { in: counts.map((c) => c.id) }, status: { in: ["COUNTED", "MISSING"] } },
    _count: true,
  });
  return counts.map((c) => ({
    id: c.id,
    number: c.number,
    title: countTitle(c),
    status: c.status,
    createdBy: c.createdBy.name,
    createdAt: c.createdAt,
    decidedBy: c.decidedBy?.name ?? null,
    decidedAt: c.decidedAt,
    total: c._count.lines,
    done: done.find((d) => d.countId === c.id)?._count ?? 0,
    adjustments: c._count.adjustments,
  }));
}

export const countCategories = () =>
  prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, nameAr: true },
  });

// ---------- التذكير بمواعيد الجرد ----------

/**
 * تذكير أسبوعي للمديرة (السبت 10 ص بتوقيت الخرطوم): قسم هذا الأسبوع بالتناوب، والجرد الكامل إن
 * مرّ عليه 90 يوماً، والأصناف ذات الرصيد السالب (عدّ سريع). لا يُرسل إن كان هناك جرد جارٍ.
 */
export async function runCountReminders(now = new Date()): Promise<boolean> {
  if (await activeCount()) return false;
  const [categories, approved, negative] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true, products: { some: { deletedAt: null } } },
      orderBy: { sortOrder: "asc" },
      select: { id: true, nameAr: true },
    }),
    prisma.stockCount.findMany({
      where: { status: "APPROVED", scope: { in: ["FULL", "CATEGORY"] } },
      select: { scope: true, categoryId: true, decidedAt: true },
    }),
    prisma.stockLevel.count({ where: { qty: { lt: 0 }, variant: { deletedAt: null, product: { deletedAt: null } } } }),
  ]);
  const lastFull = approved
    .filter((a) => a.scope === "FULL" && a.decidedAt)
    .reduce<Date | null>((m, a) => (!m || a.decidedAt! > m ? a.decidedAt! : m), null);
  const lastOf = (id: string) =>
    approved
      .filter((a) => a.decidedAt && (a.scope === "FULL" || a.categoryId === id))
      .reduce<Date | null>((m, a) => (!m || a.decidedAt! > m ? a.decidedAt! : m), null);
  const section = weeklySection(categories.map((c) => ({ ...c, lastCountedAt: lastOf(c.id) })));
  const parts: string[] = [];
  const full = fullCountDue(lastFull, now);
  if (full) parts.push(lastFull ? "مرّ 90 يوماً على آخر جرد كامل — حان موعده" : "لم يُعمل جرد كامل بعد");
  else if (section) parts.push(`قسم هذا الأسبوع: ${section.nameAr}`);
  if (negative) parts.push(`${negative} صنف رصيده سالب — عدّ سريع`);
  if (!parts.length) return false;
  const id = await notify(prisma, {
    type: "STOCK_COUNT",
    priority: "NORMAL",
    title: full ? "موعد الجرد الكامل" : "جرد هذا الأسبوع",
    body: parts.join(" · "),
    href: `/admin/stock/counts?suggest=${full ? "FULL" : section ? `CATEGORY:${section.id}` : "QUICK"}`,
    dedupeKey: `COUNT_DUE:${shopDay(now)}`,
    audience: { stock: ["approve"] },
  });
  return !!id;
}

export const UNIT_LABELS = UNIT_LABEL;
