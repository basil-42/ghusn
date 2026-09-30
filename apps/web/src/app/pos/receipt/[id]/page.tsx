import { plainNumber } from "@ghusn/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Receipt } from "@/components/receipt";
import { Button } from "@/components/ui/button";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount } from "@/lib/format";
import { getReceipt } from "@/lib/sales";
import { getReceiptSettings } from "@/lib/settings";
import { PrintButton } from "@/app/print/labels/print-button";

export const metadata: Metadata = { title: "إيصال | غصن" };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requirePermission({ pos: ["sell"] });
  const { id } = await params;
  const [data, settings] = await Promise.all([getReceipt(id), getReceiptSettings()]);
  // الموظفة ترى إيصالاتها؛ المالك والمديرة كل الإيصالات
  if (!data || (data.cashierId !== user.id && !roleCan(user.role, { sale: ["read"] }))) notFound();

  // إرسال الإيصال عبر واتساب (رابط wa.me الآن؛ Cloud API لاحقاً)
  const text = [
    `غصن — فاتورة ${data.number}`,
    ...data.lines.map((l) => `${l.label} × ${plainNumber(l.qty)}: ${formatAmount(l.amountSdg, 0)}`),
    `الإجمالي: ${formatAmount(data.totalSdg, 0)} ج.س`,
    settings.footer,
  ].join("\n");
  const wa = data.customer
    ? `https://wa.me/${data.customer.phone.replace("+", "")}?text=${encodeURIComponent(text)}`
    : null;

  return (
    <div className="flex flex-col items-center gap-4">
      <style>{`@page { size: 80mm auto; margin: 0; } @media print { body * { visibility: hidden; } .receipt, .receipt * { visibility: visible; } .receipt { position: absolute; inset: 0 auto auto 0; } }`}</style>
      <div className="flex flex-wrap justify-center gap-2 print:hidden">
        <PrintButton disabled={false} />
        {wa ? (
          <Button asChild variant="outline">
            <a href={wa} target="_blank" rel="noopener">
              إرسال واتساب
            </a>
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <Link href={`/pos/returns?invoice=${data.number}`}>مرتجع</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/pos">بيع جديد</Link>
        </Button>
      </div>
      <div className="rounded-xl border border-border shadow-sm print:border-0 print:shadow-none">
        <Receipt data={data} settings={settings} />
      </div>
    </div>
  );
}
