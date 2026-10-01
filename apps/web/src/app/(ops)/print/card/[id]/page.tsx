import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { getOrderForStaff } from "@/lib/orders";
import { PrintButton } from "../../labels/print-button";

export const metadata: Metadata = { title: "بطاقة الإهداء | غصن" };

/**
 * بطاقة الإهداء بقالب غصن (A6: 105×148 مم، D-91). الرمز بالذهبي في الأعلى، ونص العميل كما كتبه
 * بخط العناوين، والعبارة في الأسفل. في نافذة الطباعة: المقاس A6 والهوامش «بلا».
 */
export default async function PrintCardPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission({ order: ["read"] });
  const o = await getOrderForStaff((await params).id);
  if (!o?.cardMessage) notFound();
  const rtl = /[؀-ۿ]/.test(o.cardMessage);

  return (
    <>
      <style>{`
        @page { size: 105mm 148mm; margin: 0; }
        @media print {
          html, body { background: white !important; margin: 0; padding: 0; }
          .no-print { display: none !important; }
          .sheet { padding: 0 !important; background: white !important; }
          .card { border: 0 !important; box-shadow: none !important; }
        }
      `}</style>
      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card p-4">
        <p>
          بطاقة الطلب <bdi dir="ltr">{o.number}</bdi> — في نافذة الطباعة اختاري المقاس A6 والهوامش «بلا».
        </p>
        <PrintButton disabled={false} />
      </div>
      <div className="sheet flex justify-center bg-muted p-6">
        <div
          className="card flex flex-col items-center justify-between border border-line bg-ivory px-[12mm] py-[14mm] text-forest"
          style={{ width: "105mm", height: "148mm" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- رمز الهوية كما هو */}
          <img src="/brand/mark-gold.svg" alt="غصن" style={{ width: "18mm" }} />
          <p
            dir={rtl ? "rtl" : "ltr"}
            className="whitespace-pre-line text-center font-display text-2xl leading-relaxed"
          >
            {o.cardMessage}
          </p>
          <p className="font-display text-sm text-gold">هدايا تُصنع لتُذكر</p>
        </div>
      </div>
    </>
  );
}
