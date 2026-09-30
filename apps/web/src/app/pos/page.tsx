import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { currentSellingRate } from "@/lib/pricing";
import { getPosSettings } from "@/lib/settings";
import { getOpenShift } from "@/lib/shifts";
import { OpenShiftForm } from "./shift-forms";
import { PosTerminal } from "./terminal";

export default async function PosPage() {
  const { user } = await requirePermission({ pos: ["sell"] });
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
  return <PosTerminal maxDiscountPercent={settings.maxDiscountPercent} hasRate={!!rate} />;
}
