import { shopDay } from "@ghusn/core";
import { recordAudit } from "@/lib/audit";
import { roleCan } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/session";
import {
  INSIGHT_TABS,
  expenseSheets,
  insightSheets,
  monthlyReportSheets,
  parseDayRange,
  salesSheets,
  stockSheets,
  type InsightTab,
} from "@/lib/exports";
import { parsePeriod } from "@/lib/insights";
import { buildWorkbook, xlsxResponse, type Sheet } from "@/lib/xlsx";

type Permissions = Parameters<typeof roleCan>[1];

// كل تصدير بصلاحية شاشته، وما فيه تكلفة يحتاج صلاحية التكلفة أيضاً (D-117)
const KINDS: Record<string, { label: string; permission: Permissions }> = {
  report: { label: "التقرير الشهري", permission: { report: ["read"] } },
  sales: { label: "المبيعات", permission: { sale: ["read"], cost: ["read"] } },
  expenses: { label: "المصاريف", permission: { expense: ["read"] } },
  stock: { label: "المخزون وقيمته", permission: { stock: ["read"], cost: ["read"] } },
  insights: { label: "التحليلات", permission: { report: ["read"], cost: ["read"] } },
};

/** تنزيل ملف Excel — يُسجَّل في سجل التدقيق (من صدّر ماذا ومتى). */
export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const def = KINDS[kind];
  const session = await getSession();
  if (!def || !session || !roleCan(session.user.role, def.permission))
    return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  let sheets: Sheet<never>[];
  let suffix: string;
  try {
    if (kind === "report") {
      const month = url.searchParams.get("month") ?? "";
      if (!/^\d{4}-\d{2}$/.test(month)) return new Response("Bad month", { status: 400 });
      sheets = await monthlyReportSheets(month);
      suffix = month;
    } else if (kind === "insights") {
      const tab = url.searchParams.get("tab") ?? "";
      if (!(INSIGHT_TABS as readonly string[]).includes(tab)) return new Response("Bad tab", { status: 400 });
      const range = parsePeriod(Object.fromEntries(url.searchParams));
      sheets = await insightSheets(tab as InsightTab, range);
      suffix =
        tab === "dead" || tab === "reorder"
          ? `${tab}-${shopDay(new Date())}`
          : `${tab}-${range.fromDay}_${range.toDay}`;
    } else if (kind === "stock") {
      sheets = await stockSheets();
      suffix = shopDay(new Date());
    } else {
      const range = parseDayRange({ from: url.searchParams.get("from"), to: url.searchParams.get("to") });
      sheets = kind === "sales" ? await salesSheets(range) : await expenseSheets(range);
      suffix = `${range.fromDay}_${range.toDay}`;
    }
  } catch (e) {
    if (e instanceof RangeError) return new Response(e.message, { status: 400 });
    throw e;
  }
  const buffer = await buildWorkbook(sheets);
  await recordAudit({
    type: "DATA_EXPORTED",
    actorId: session.user.id,
    title: `تصدير ${def.label}`,
    detail: suffix.replace("_", " ← "),
  });
  return xlsxResponse(buffer, `ghusn-${kind}-${suffix}.xlsx`);
}
