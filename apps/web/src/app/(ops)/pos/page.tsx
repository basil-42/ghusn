import { dec } from "@ghusn/core";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { customerForPos } from "@/lib/customers";
import { currentSellingRate } from "@/lib/pricing";
import { getReturn } from "@/lib/returns";
import { getPosSettings } from "@/lib/settings";
import { getOpenShift, safeBalanceNow } from "@/lib/shifts";
import { OpenShiftForm } from "./shift-forms";
import { PosTerminal } from "./terminal";

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ credit?: string; customer?: string }>;
}) {
  const { user } = await requirePermission({ pos: ["sell"] });
  const { credit: creditId, customer: customerId } = await searchParams;
  // وردية واحدة للخزنة (D-143): البيع على المفتوحة أياً كانت صاحبتها
  const shift = await getOpenShift();
  if (!shift) {
    const systemSdg = await safeBalanceNow();
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle>فتح وردية</CardTitle>
          <CardDescription>
            الوردية تبدأ من رصيد الخزنة في النظام، وعند الإغلاق تعدّين الدرج ويُطابَق مع المتوقع.
          </CardDescription>
        </CardHeader>
        {systemSdg === null ? (
          <p className="text-sm text-danger">لم تُضبط محفظة الخزنة بعد — اطلبي من المالك ضبطها من الإعدادات.</p>
        ) : (
          <OpenShiftForm systemSdg={systemSdg} />
        )}
      </Card>
    );
  }
  const [settings, rate, customer] = await Promise.all([
    getPosSettings(),
    currentSellingRate(),
    customerId ? customerForPos(customerId) : null,
  ]);
  // استبدال: رصيد المرتجع المتبقي
  const ret = creditId ? await getReturn(creditId) : null;
  const credit =
    ret?.isExchange && dec(ret.creditLeftSdg).gt(0)
      ? { returnId: ret.id, number: ret.number, amountSdg: dec(ret.creditLeftSdg).toFixed(0) }
      : null;
  return (
    <>
      {shift.userId !== user.id ? (
        <p className="mb-3 rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
          الخزنة مع {shift.user.name} — البيع يُسجَّل على ورديتها.
        </p>
      ) : null}
      <PosTerminal
        key={credit?.returnId ?? customerId ?? "sale"}
        maxDiscountPercent={settings.maxDiscountPercent}
        hasRate={!!rate}
        credit={credit}
        customer={customer}
      />
    </>
  );
}
