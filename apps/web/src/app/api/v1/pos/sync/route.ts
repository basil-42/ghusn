import { NextResponse } from "next/server";
import { apiSession } from "@/lib/auth/api";
import { offlineSaleSchema } from "@/lib/sale-schema";
import { SaleError, createSale } from "@/lib/sales";

/**
 * مزامنة فاتورة بيعت دون اتصال (D-63، D-82). متكرر بأمان: نفس المعرّف يعيد نفس الرقم.
 * 422 = خطأ في البيانات يحتاج تدخلاً (يبقى في طابور الجهاز مع الرسالة).
 */
export async function POST(request: Request) {
  const auth = await apiSession({ pos: ["sell"] });
  if ("error" in auth) return auth.error;
  const body: unknown = await request.json().catch(() => null);
  const parsed = offlineSaleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "INVALID" }, { status: 422 });
  }
  const { createdAt, localNumber, unitPrices, ...sale } = parsed.data;
  const at = new Date(createdAt);
  // وقت الجهاز: لا مستقبل (مع سماحية دقائق لفرق الساعة)
  if (at.getTime() > Date.now() + 10 * 60_000) {
    return NextResponse.json({ error: "وقت الجهاز في المستقبل — صحّحي ساعة الجهاز." }, { status: 422 });
  }
  try {
    const result = await createSale(
      {
        ...sale,
        approval: null,
        creditReturnId: null,
        offline: { createdAt: at, localNumber, unitPrices },
      },
      auth.session.user.id,
    );
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof SaleError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
