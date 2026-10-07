import { CUSTOMER_SEGMENT_LABELS, formatPhone, shopDay } from "@ghusn/core";
import { roleCan } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/session";
import { customerDirectory, filterDirectory, parseDirectoryQuery } from "@/lib/customers";

const cell = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** تصدير العملاء CSV (يفتح في Excel بالعربية) — بنفس بحث الصفحة وفلترها، للمالك والمديرة (D-115). */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !roleCan(session.user.role, { customer: ["value"] }))
    return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const query = parseDirectoryQuery(Object.fromEntries(url.searchParams));
  const { rows } = await customerDirectory();
  const list = filterDirectory(rows, query, true);
  const lines = [
    [
      "الاسم",
      "الهاتف",
      "التصنيف",
      "المشتريات",
      "من المحل",
      "من المتجر",
      "الإنفاق ج.س",
      "متوسط الفاتورة ج.س",
      "الإنفاق $",
      "أول شراء",
      "آخر شراء",
    ]
      .map(cell)
      .join(","),
    ...list.map((c) =>
      [
        c.name,
        formatPhone(c.phone),
        c.segment ? CUSTOMER_SEGMENT_LABELS[c.segment] : "",
        c.purchases,
        c.shopCount,
        c.webCount,
        c.spendSdg,
        c.avgSdg,
        c.spendUsd,
        c.firstAt ? shopDay(c.firstAt) : "",
        c.lastAt ? shopDay(c.lastAt) : "",
      ]
        .map(cell)
        .join(","),
    ),
  ];
  // BOM حتى يقرأ Excel العربية بترميز UTF-8
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ghusn-customers-${shopDay(new Date())}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
