import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { barcodeSvg } from "@/lib/barcode-svg";
import { labelVariants } from "@/lib/stock";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "طباعة الملصقات | غصن" };

const MAX_LABELS = 1000;

/** «id:3,id:5» ← [{id, count}] — يتجاهل المدخلات غير الصالحة ويقف عند الحد. */
function parseItems(raw: string | undefined) {
  const items: { id: string; count: number }[] = [];
  let total = 0;
  for (const part of (raw ?? "").split(",").slice(0, 200)) {
    const m = /^([a-z0-9]{10,40}):(\d{1,4})$/.exec(part);
    if (!m) continue;
    const count = Math.min(Number(m[2]), MAX_LABELS - total);
    if (count <= 0) continue;
    items.push({ id: m[1]!, count });
    total += count;
  }
  return items;
}

/**
 * صفحة طباعة ملصقات 50×30 مم (D-37): كل ملصق صفحة مستقلة. خارج هيكل لوحة الإدارة
 * حتى لا تُطبع القائمة. في نافذة الطباعة: اختاري طابعة TSC والمقاس 50×30 وهوامش «بلا».
 */
export default async function PrintLabelsPage({ searchParams }: { searchParams: Promise<{ items?: string }> }) {
  await requirePermission({ product: ["read"] });
  const items = parseItems((await searchParams).items);
  const variants = await labelVariants(items.map((i) => i.id));
  const labels = items.flatMap((i) => {
    const v = variants.get(i.id);
    if (!v) return [];
    const svg = barcodeSvg(v.barcode);
    return Array.from({ length: i.count }, (_, n) => ({ key: `${i.id}-${n}`, ...v, svg }));
  });

  return (
    <>
      <style>{`
        @page { size: 50mm 30mm; margin: 0; }
        @media print {
          html, body { background: white !important; margin: 0; padding: 0; }
          .no-print { display: none !important; }
          .sheet { display: block !important; padding: 0 !important; gap: 0 !important; }
          .label { border: 0 !important; margin: 0 !important; break-after: page; page-break-after: always; }
          .label:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>
      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card p-4">
        <p>{labels.length} ملصق — في نافذة الطباعة اختاري طابعة TSC، المقاس 50×30 مم، والهوامش «بلا».</p>
        <PrintButton disabled={labels.length === 0} />
      </div>
      <div className="sheet flex flex-wrap justify-center gap-3 bg-muted p-4">
        {labels.map((l) => (
          <div
            key={l.key}
            className="label flex flex-col overflow-hidden border border-border bg-white text-black"
            style={{ width: "50mm", height: "30mm", padding: "1.5mm 2mm" }}
          >
            <p className="truncate text-center font-bold leading-tight" style={{ fontSize: "8.5pt" }}>
              {l.name}
            </p>
            <p className="truncate text-center leading-tight" style={{ fontSize: "7pt" }}>
              {l.variant ? `${l.variant} · ` : ""}
              <bdi dir="ltr">{l.sku}</bdi>
            </p>
            <div
              className="mt-[0.5mm] min-h-0 flex-1 [&>svg]:h-full [&>svg]:w-full"
              // SVG مولَّد على الخادم من أرقام الباركود فقط
              dangerouslySetInnerHTML={{ __html: l.svg }}
            />
          </div>
        ))}
      </div>
    </>
  );
}
