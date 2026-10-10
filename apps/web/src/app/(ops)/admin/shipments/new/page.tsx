import { prisma } from "@ghusn/db";
import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { NewShipmentForm } from "../forms";
import { PageHeader } from "@/components/admin/page-header";

export const metadata: Metadata = { title: "شحنة جديدة | غصن" };

export default async function NewShipmentPage() {
  await requirePermission({ shipment: ["create"] });
  const suppliers = await prisma.supplier.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, currencyCode: true },
  });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="شحنة جديدة"
        back={{ href: "/admin/shipments", label: "الشحنات" }}
        description="المورد والعملة وتاريخ الشراء أولاً — الأصناف والتكاليف تُضاف في الخطوة التالية."
      />
      <Card>
        {suppliers.length ? (
          <NewShipmentForm
            suppliers={suppliers.map((s) => ({ value: s.id, label: `${s.name} (${s.currencyCode})` }))}
          />
        ) : (
          <p>
            لا يوجد موردون بعد.{" "}
            <Link href="/admin/suppliers/new" className="font-semibold underline">
              أضيفي مورداً أولاً
            </Link>
          </p>
        )}
      </Card>
    </div>
  );
}
