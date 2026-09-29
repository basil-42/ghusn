import { prisma } from "@ghusn/db";
import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { NewShipmentForm } from "../forms";

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
      <h1 className="font-display text-3xl font-bold">شحنة جديدة</h1>
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
