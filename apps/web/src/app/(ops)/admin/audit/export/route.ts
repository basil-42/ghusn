import { getSession } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/permissions";
import { AUDIT_CATEGORY_LABELS, auditFeed, parseFeedParams } from "@/lib/audit-feed";
import { formatDateTime } from "@/lib/format";

const cell = (v: string | null | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`;

/** تصدير سجل التدقيق CSV (يفتح في Excel بالعربية) — بنفس فلاتر الصفحة، للمالك فقط. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !roleCan(session.user.role, { audit: ["read"] })) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const p = parseFeedParams(Object.fromEntries(url.searchParams));
  const items = await auditFeed({
    ...p.range,
    category: p.category,
    actorId: p.actorId,
    attentionOnly: p.attentionOnly,
  });
  const rows = [
    ["الوقت", "النوع", "الحدث", "التفاصيل", "من", "تستحق الانتباه"].map(cell).join(","),
    ...items.map((i) =>
      [formatDateTime(i.at), AUDIT_CATEGORY_LABELS[i.category], i.title, i.detail, i.actors, i.sensitive ? "نعم" : ""]
        .map(cell)
        .join(","),
    ),
  ];
  // BOM حتى يقرأ Excel العربية بترميز UTF-8
  return new Response("﻿" + rows.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ghusn-audit-${p.fromDay}_${p.toDay}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
