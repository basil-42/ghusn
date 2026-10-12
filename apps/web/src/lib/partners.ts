import { dec, normalizePhone, shopDay } from "@ghusn/core";
import { signToken, verifyToken } from "@ghusn/core/server";
import { prisma } from "@ghusn/db";
import { notify } from "./notifications";
import { renderPdf, internalUrl } from "./pdf";
import { currentShopMonth, monthlyReport } from "./reports";
import { siteUrl } from "./site";
import { storage } from "./storage";

/**
 * الشركاء وكشوفهم الشهرية (D-130). الكشف PDF يُنشأ في الخادم من صفحة /doc/partner-statement ويُحفظ
 * كما صدر (أرشيف)، ويُرسل لكل شريك برابط موقّع صالح 7 أيام لا يحتاج تسجيل دخول.
 */

export class PartnerError extends Error {}

export const LINK_DAYS = 7;
const RENDER_MINUTES = 5;
const DAY_MS = 86_400_000;

function secret(): string {
  const s = process.env.BETTER_AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("BETTER_AUTH_SECRET is missing");
  return s;
}

/** الشهر السابق لشهر YYYY-MM. */
export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ─── الشركاء ──────────────────────────────────────────────────────────────

export async function listPartners(includeInactive = false) {
  return prisma.partner.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, phone: true, isActive: true },
  });
}

export async function savePartner(input: { id?: string; name: string; phone: string }) {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new PartnerError("رقم الهاتف غير صحيح.");
  const name = input.name.trim();
  if (name.length < 2 || name.length > 60) throw new PartnerError("الاسم مطلوب (حتى 60 حرفاً).");
  if (input.id) {
    await prisma.partner.update({ where: { id: input.id }, data: { name, phone } });
    return input.id;
  }
  const active = await prisma.partner.count({ where: { isActive: true } });
  // D-06: أربعة شركاء بنسبة 25% — شريك خامس يعني تغيير النسب، وهذا قرار لا إدخال
  if (active >= 4) throw new PartnerError("الشركاء أربعة (25% لكل واحد) — أوقفي شريكاً قبل إضافة آخر.");
  const created = await prisma.partner.create({ data: { name, phone, sortOrder: active } });
  return created.id;
}

export async function setPartnerActive(id: string, isActive: boolean) {
  if (isActive && (await prisma.partner.count({ where: { isActive: true } })) >= 4) {
    throw new PartnerError("الشركاء النشطون أربعة بالفعل.");
  }
  await prisma.partner.update({ where: { id }, data: { isActive } });
}

// ─── بيانات الكشف ─────────────────────────────────────────────────────────

export type StatementData = NonNullable<Awaited<ReturnType<typeof statementData>>>;

/** ما يعرضه الكشف: ملخص الشهر ورأس المال ونصيب الشريك (25%، D-06). */
export async function statementData(partnerId: string, month: string) {
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { id: true, name: true, phone: true },
  });
  if (!partner) return null;
  const r = await monthlyReport(month);
  return {
    partner,
    month,
    complete: month < currentShopMonth(),
    netSalesSdg: r.netSalesSdg,
    netRevenueUsd: r.netRevenueUsd,
    grossProfitUsd: r.grossProfitUsd,
    grossMargin: r.grossMargin,
    expensesUsd: dec(r.expensesUsd).toFixed(2),
    expensesByCategory: r.expensesByCategory.map((e) => ({ name: e.name, usd: e.usd })),
    // خسائر المخزون وفروقات الصندوق: الفرق بين مجمل الربح − المصاريف وصافي الربح (نفس حساب التقرير الشهري)
    otherLossesUsd: dec(r.grossProfitUsd).minus(r.expensesUsd).minus(r.netProfitUsd).toFixed(2),
    netProfitUsd: r.netProfitUsd,
    capital: r.capital,
  };
}

// ─── الروابط الموقّعة ─────────────────────────────────────────────────────

/** رابط صفحة الكشف للمتصفح داخل الخادم (دقائق). المعرّف: partnerId:month */
export function renderToken(partnerId: string, month: string, now = Date.now()) {
  return signToken(
    { k: "statement-render", id: `${partnerId}:${month}`, exp: now + RENDER_MINUTES * 60_000 },
    secret(),
  );
}

export function readRenderToken(token: string): { partnerId: string; month: string } | null {
  const p = verifyToken(token, "statement-render", secret());
  const [partnerId, month] = p?.id.split(":") ?? [];
  return partnerId && month && /^\d{4}-\d{2}$/.test(month) ? { partnerId, month } : null;
}

/** رابط الكشف المرسل للشريك: صالح 7 أيام. */
export function statementLink(statementId: string, now = Date.now()) {
  const token = signToken({ k: "statement", id: statementId, exp: now + LINK_DAYS * DAY_MS }, secret());
  return `${siteUrl()}/d/${token}`;
}

export function readStatementToken(token: string): string | null {
  return verifyToken(token, "statement", secret())?.id ?? null;
}

// ─── الإصدار والأرشيف ─────────────────────────────────────────────────────

/**
 * يُنشئ PDF الكشف ويحفظه (يستبدل إصداراً سابقاً لنفس الشهر). الشهر الجاري لا يُصدر — أرقامه لم تكتمل.
 */
export async function issueStatement(partnerId: string, month: string, issuedById: string | null) {
  if (!/^\d{4}-\d{2}$/.test(month) || month >= currentShopMonth()) {
    throw new PartnerError("يُصدر الكشف لشهر مكتمل فقط.");
  }
  const data = await statementData(partnerId, month);
  if (!data) throw new PartnerError("الشريك غير موجود.");
  const pdf = await renderPdf(internalUrl(`/doc/partner-statement/${renderToken(partnerId, month)}`));
  const key = `private/statements/${partnerId}/${month}-${Date.now().toString(36)}.pdf`;
  await storage.put(key, pdf, "application/pdf");
  const previous = await prisma.partnerStatement.findUnique({
    where: { partnerId_month: { partnerId, month } },
    select: { fileKey: true },
  });
  const row = await prisma.partnerStatement.upsert({
    where: { partnerId_month: { partnerId, month } },
    create: { partnerId, month, fileKey: key, shareUsd: data.capital.perPartnerUsd, issuedById },
    update: { fileKey: key, shareUsd: data.capital.perPartnerUsd, issuedById, issuedAt: new Date() },
  });
  if (previous && previous.fileKey !== key) await storage.delete(previous.fileKey).catch(() => {});
  return row;
}

/** يُصدر كشوف الشهر لكل الشركاء النشطين. */
export async function issueMonth(month: string, issuedById: string | null) {
  const partners = await listPartners();
  const issued = [];
  for (const p of partners) issued.push(await issueStatement(p.id, month, issuedById));
  return issued;
}

export async function statementFile(statementId: string) {
  const s = await prisma.partnerStatement.findUnique({
    where: { id: statementId },
    select: { fileKey: true, month: true, partner: { select: { name: true } } },
  });
  if (!s) return null;
  const body = await storage.get(s.fileKey);
  return body ? { body, filename: `ghusn-statement-${s.month}.pdf`, month: s.month, partner: s.partner.name } : null;
}

export async function statementsForMonth(month: string) {
  const [partners, statements] = await Promise.all([
    listPartners(true),
    prisma.partnerStatement.findMany({
      where: { month },
      select: { id: true, partnerId: true, shareUsd: true, issuedAt: true, issuedBy: { select: { name: true } } },
    }),
  ]);
  return partners
    .map((p) => {
      const s = statements.find((x) => x.partnerId === p.id);
      return {
        partner: p,
        statement: s
          ? {
              id: s.id,
              shareUsd: s.shareUsd.toFixed(2),
              issuedAt: s.issuedAt,
              issuedBy: s.issuedBy?.name ?? "تلقائياً",
            }
          : null,
      };
    })
    .filter((x) => x.partner.isActive || x.statement);
}

/**
 * مهمة يوم 1 من كل شهر (D-130): كشوف الشهر السابق لكل الشركاء النشطين، ثم إشعار المالك ليرسلها.
 * مرة واحدة لكل شهر (dedupeKey)؛ فشل مولّد الـ PDF يُسجَّل ويُعاد في الجولة التالية.
 */
export async function runMonthlyStatements(now = new Date()) {
  const month = previousMonth(shopDay(now).slice(0, 7));
  const partners = await listPartners();
  if (!partners.length) return 0;
  const existing = await prisma.partnerStatement.findMany({ where: { month }, select: { partnerId: true } });
  const missing = partners.filter((p) => !existing.some((e) => e.partnerId === p.id));
  for (const p of missing) await issueStatement(p.id, month, null);
  await notify(prisma, {
    type: "PARTNER_STATEMENTS",
    priority: "NORMAL",
    title: `كشوف الشركاء لشهر ${month} جاهزة`,
    body: "راجعيها وأرسليها لكل شريك على واتساب.",
    href: `/admin/reports/partners?month=${month}`,
    dedupeKey: `PARTNER_STATEMENTS:${month}`,
    audience: { partner: ["manage"] },
  });
  return missing.length;
}
