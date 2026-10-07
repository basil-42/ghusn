import { SHOP_TIME_ZONE, dec } from "@ghusn/core";
import ExcelJS from "exceljs";

/**
 * ملفات Excel للتصدير (D-117): ورقة لكل جزء، من اليمين لليسار، عناوين ثابتة، وأرقام حقيقية تُجمع.
 * القيم تُحسب بـ Decimal في الخادم؛ التحويل إلى رقم هنا للعرض في الخلية فقط (لا حساب بعده).
 */

export type ColumnKind =
  | "text"
  /** مبلغ بعملة متغيرة — لا يُجمع */
  | "amount"
  | "sdg"
  | "usd"
  | "unitUsd"
  | "rate"
  | "qty"
  | "int"
  | "percent"
  | "datetime"
  | "date";

export interface Column<T> {
  header: string;
  kind?: ColumnKind;
  width?: number;
  value: (row: T) => string | number | Date | null | undefined;
}

export interface Sheet<T = never> {
  name: string;
  /** سطر أعلى الورقة (الفترة، ملاحظة) */
  title?: string;
  columns: Column<T>[];
  rows: T[];
  /** صف إجمالي لأعمدة المبالغ والكميات */
  totals?: boolean;
  note?: string;
}

const FORMATS: Partial<Record<ColumnKind, string>> = {
  amount: "#,##0.00",
  sdg: "#,##0",
  usd: "#,##0.00",
  unitUsd: "#,##0.000000",
  rate: "#,##0.######",
  qty: "#,##0.###",
  int: "#,##0",
  percent: "0.0%",
  datetime: "yyyy-mm-dd hh:mm",
  date: "yyyy-mm-dd",
};
const SUMMABLE: ReadonlySet<ColumnKind> = new Set(["sdg", "usd", "qty", "int"]);

// ألوان الهوية (D-51): رأس أخضر الغابة بنص عاجي
const HEADER_FILL = "FF2F3B2C";
const HEADER_FONT = "FFF5F1E8";
const TOTAL_FILL = "FFEFEADF";

/** الوقت بتوقيت الخرطوم كقيمة تاريخ في Excel (Excel بلا منطقة زمنية). */
function shopLocal(d: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")));
}

function cellValue(kind: ColumnKind, v: string | number | Date | null | undefined): ExcelJS.CellValue {
  if (v === null || v === undefined || v === "") return null;
  if (kind === "datetime" || kind === "date") return v instanceof Date ? shopLocal(v) : String(v);
  if (kind === "text") return String(v);
  // مبلغ بنص عشري من Decimal ← رقم للخلية
  return typeof v === "number" ? v : dec(String(v)).toNumber();
}

export async function buildWorkbook(sheets: Sheet<never>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "غصن";
  wb.created = new Date();
  for (const s of sheets as unknown as Sheet<unknown>[]) {
    // أسماء الأوراق: 31 حرفاً بلا رموز ممنوعة
    const ws = wb.addWorksheet(s.name.replace(/[\\/*?:[\]]/g, " ").slice(0, 31), {
      views: [{ rightToLeft: true, state: "frozen", ySplit: s.title ? 2 : 1 }],
    });
    let r = 1;
    if (s.title) {
      ws.getCell(r, 1).value = s.title;
      ws.getCell(r, 1).font = { bold: true, size: 13 };
      r += 1;
    }
    const headerRow = ws.getRow(r);
    s.columns.forEach((c, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: HEADER_FONT } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      ws.getColumn(i + 1).width = c.width ?? (c.kind && c.kind !== "text" ? 14 : 22);
      const fmt = c.kind ? FORMATS[c.kind] : undefined;
      if (fmt) ws.getColumn(i + 1).numFmt = fmt;
    });
    headerRow.height = 28;
    const first = r + 1;
    for (const row of s.rows) {
      r += 1;
      const line = ws.getRow(r);
      s.columns.forEach((c, i) => {
        line.getCell(i + 1).value = cellValue(c.kind ?? "text", c.value(row));
      });
    }
    if (s.totals && s.rows.length) {
      r += 1;
      const line = ws.getRow(r);
      line.getCell(1).value = "الإجمالي";
      s.columns.forEach((c, i) => {
        const cell = line.getCell(i + 1);
        if (i > 0 && c.kind && SUMMABLE.has(c.kind)) {
          const col = ws.getColumn(i + 1).letter;
          cell.value = { formula: `SUM(${col}${first}:${col}${r - 1})` };
        }
        cell.font = { bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
      });
    }
    if (s.note) {
      r += 2;
      ws.getCell(r, 1).value = s.note;
      ws.getCell(r, 1).font = { italic: true, color: { argb: "FF5F6B54" } };
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Response لتنزيل الملف (خاص، بلا تخزين مؤقت). */
export function xlsxResponse(buffer: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

/** يسهّل كتابة الأعمدة مع استنتاج نوع الصف. */
export const sheet = <T>(s: Sheet<T>): Sheet<never> => s as unknown as Sheet<never>;
