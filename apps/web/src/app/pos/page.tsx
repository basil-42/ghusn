import { dec } from "@ghusn/core";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { currentSellingRate } from "@/lib/pricing";
import { getReturn } from "@/lib/returns";
import { getPosSettings } from "@/lib/settings";
import { getOpenShift } from "@/lib/shifts";
import { OpenShiftForm } from "./shift-forms";
import { PosTerminal } from "./terminal";

export default async function PosPage({ searchParams }: { searchParams: Promise<{ credit?: string }> }) {
  const { user } = await requirePermission({ pos: ["sell"] });
  const { credit: creditId } = await searchParams;
  const shift = await getOpenShift(user.id);
  if (!shift) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle>فتح وردية</CardTitle>
          <CardDescription>عدّي النقد في الدرج قبل البيع. عند الإغلاق يُطابَق مع المقبوض نقداً.</CardDescription>
        </CardHeader>
        <OpenShiftForm />
      </Card>
    );
  }
  const [settings, rate] = await Promise.all([getPosSettings(), currentSellingRate()]);
  // استبدال: رصيد المرتجع المتبقي
  const ret = creditId ? await getReturn(creditId) : null;
  const credit =
    ret?.isExchange && dec(ret.creditLeftSdg).gt(0)
      ? { returnId: ret.id, number: ret.number, amountSdg: dec(ret.creditLeftSdg).toFixed(0) }
      : null;
  return (
    <PosTerminal
      key={credit?.returnId ?? "sale"}
      maxDiscountPercent={settings.maxDiscountPercent}
      hasRate={!!rate}
      credit={credit}
    />
  );
}
