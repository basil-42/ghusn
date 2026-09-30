import { NextResponse } from "next/server";
import { apiSession } from "@/lib/auth/api";
import { listPosCatalog } from "@/lib/sales";
import { getPosSettings, getReceiptSettings } from "@/lib/settings";

/**
 * نسخة الكتالوج لنقطة البيع دون اتصال (D-82): الاسم والباركود والسعر والرصيد فقط — بلا تكلفة
 * (يصل لجهاز الموظفة). مع حد الخصم ونصوص الإيصال لطباعة الإيصال دون اتصال.
 */
export async function GET() {
  const auth = await apiSession({ pos: ["sell"] });
  if ("error" in auth) return auth.error;
  const [items, pos, receipt] = await Promise.all([listPosCatalog(), getPosSettings(), getReceiptSettings()]);
  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      cashier: { id: auth.session.user.id, name: auth.session.user.name },
      maxDiscountPercent: pos.maxDiscountPercent,
      receipt,
      items,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
