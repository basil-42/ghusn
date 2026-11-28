import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardFace } from "@/components/card-face";
import { requirePermission } from "@/lib/auth/session";
import { getOrderForStaff } from "@/lib/orders";
import { imageUrl } from "@/lib/product-images";
import { PrintButton } from "../../labels/print-button";

export const metadata: Metadata = { title: "بطاقة الإهداء | غصن" };

/**
 * بطاقة الإهداء بمقاس 10×15 سم (D-165): الشكل الذي اختاره العميل (أو قالب غصن) ورسالته و«من» — نفس
 * المكوّن الذي رآه في المعاينة. في نافذة الطباعة: المقاس 10×15 (أو 4×6 إنش) والهوامش «بلا».
 */
export default async function PrintCardPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission({ order: ["read"] });
  const o = await getOrderForStaff((await params).id);
  if (!o?.cardMessage) notFound();

  return (
    <>
      <style>{`
        @page { size: 100mm 150mm; margin: 0; }
        @media print {
          html, body { background: white !important; margin: 0; padding: 0; }
          .no-print { display: none !important; }
          .sheet { padding: 0 !important; background: white !important; }
          .card { border: 0 !important; box-shadow: none !important; }
        }
      `}</style>
      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card p-4">
        <p>
          بطاقة الطلب <bdi dir="ltr">{o.number}</bdi> ({o.cardDesign?.name ?? "قالب غصن"}) — في نافذة الطباعة اختاري
          المقاس 10×15 سم (4×6 إنش) والهوامش «بلا».
        </p>
        <PrintButton disabled={false} />
      </div>
      <div className="sheet flex justify-center bg-muted p-6">
        <CardFace
          message={o.cardMessage}
          from={o.cardFrom}
          design={
            o.cardDesign
              ? { imageUrl: imageUrl(o.cardDesign.imageKey, "full"), textColor: o.cardDesign.textColor }
              : null
          }
          className="card w-[100mm] border border-line"
        />
      </div>
    </>
  );
}
