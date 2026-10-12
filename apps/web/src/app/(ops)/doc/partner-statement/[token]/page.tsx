import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PartnerStatementDoc } from "@/components/admin/partner-statement";
import { readRenderToken, statementData } from "@/lib/partners";

export const metadata: Metadata = { title: "كشف الشريك | غصن" };

/**
 * الصفحة التي يحوّلها الخادم إلى PDF (D-130): برمز موقّع صالح دقائق (لا كوكي جلسة داخل المتصفح الآلي).
 */
export default async function PartnerStatementDocPage({ params }: { params: Promise<{ token: string }> }) {
  const t = readRenderToken((await params).token);
  if (!t) notFound();
  const data = await statementData(t.partnerId, t.month);
  if (!data) notFound();
  return (
    <div className="min-h-screen bg-background py-6 print:bg-white print:py-0">
      <PartnerStatementDoc data={data} issuedAt={new Date()} />
    </div>
  );
}
