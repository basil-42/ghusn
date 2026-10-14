import { canReceiveShipment, plainNumber } from "@ghusn/core";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount } from "@/lib/format";
import { COST_LABELS, getShipment } from "@/lib/shipments";
import { ReceiveForm } from "./receive-form";
import { PageHeader } from "@/components/admin/page-header";

export const metadata: Metadata = { title: "استلام شحنة | غصن" };

export default async function ReceivePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission({ shipment: ["receive"] });
  const { id } = await params;
  const s = await getShipment(id);
  if (!s) notFound();
  if (!canReceiveShipment(s.status) || !s.purchaseRate) redirect(`/admin/shipments/${id}`);
  const costs = s.costs.filter((c) => !c.voided);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          <>
            استلام <bdi dir="ltr">{s.number}</bdi>
          </>
        }
        back={{ href: `/admin/shipments/${s.id}`, label: "الشحنة" }}
        description={s.supplier.name}
      />

      <Alert>
        {costs.length ? (
          <>
            التكاليف المسجّلة:{" "}
            {costs.map((c) => `${COST_LABELS[c.kind]} ${formatAmount(c.amount)} ${c.currencyCode}`).join(" · ")}.
          </>
        ) : (
          "لا توجد تكاليف مسجّلة لهذه الشحنة."
        )}{" "}
        هل أدخلتِ كل التكاليف؟ الفاتورة التي تصل لاحقاً تُضاف من صفحة الشحنة وتُعدِّل متوسط التكلفة.
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>الكميات الواصلة</CardTitle>
          <CardDescription>
            السليم يدخل المخزون. التالف يُسجَّل، والفرق حتى الكمية المشتراة يُعدّ ناقصاً؛ وتكلفتهما تُحمَّل على السليم
            من نفس البند. حساب المورد لا يتغير (سعر الشراء {plainNumber(s.purchaseRate)} {s.currency.code}/$).
          </CardDescription>
        </CardHeader>
        <ReceiveForm
          id={s.id}
          number={s.number}
          purchaseRate={s.purchaseRate}
          costs={costs.map((c) => ({ amount: c.amount, rateUsed: c.rateUsed }))}
          lines={s.lines.map(({ id, label, sku, unit, trackExpiry, qty, unitPrice }) => ({
            id,
            label,
            sku,
            unit,
            trackExpiry,
            qty: plainNumber(qty),
            unitPrice,
          }))}
        />
      </Card>
    </div>
  );
}
