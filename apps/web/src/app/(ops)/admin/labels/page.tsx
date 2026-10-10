import type { Metadata } from "next";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@ghusn/db";
import { shipmentLabelItems, type LabelItem } from "@/lib/stock";
import { LabelPlanner } from "./planner";
import { PageHeader } from "@/components/admin/page-header";

export const metadata: Metadata = { title: "ملصقات الباركود | غصن" };

export default async function LabelsPage({ searchParams }: { searchParams: Promise<{ shipment?: string }> }) {
  await requirePermission({ product: ["read"] });
  const { shipment } = await searchParams;
  let items: LabelItem[] = [];
  let source: string | null = null;
  if (shipment) {
    const s = await prisma.shipment.findUnique({ where: { id: shipment }, select: { number: true, status: true } });
    if (s?.status === "RECEIVED") {
      items = await shipmentLabelItems(shipment);
      source = s.number;
    }
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="ملصقات الباركود"
        description={`طابعة TSC TE210 بملصقات 50×30 مم${source ? ` · من الشحنة ${source}` : ""}.`}
      />
      <Card>
        <CardHeader>
          <CardTitle>ماذا نطبع؟</CardTitle>
          <CardDescription>
            العدد المقترح = السليم المستلم للأصناف ذات الباركود الداخلي (200…). الأصناف التي عليها باركود المصنع لا
            تحتاج ملصقاً عادةً (العدد صفر) — غيّريه إن احتجتِ.
          </CardDescription>
        </CardHeader>
        <LabelPlanner initial={items} />
      </Card>
    </div>
  );
}
