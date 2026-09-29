import { shopDay } from "@ghusn/core";
import { prisma } from "@ghusn/db";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { COUNTRIES } from "@/lib/suppliers";
import { NewSupplierForm } from "../forms";

export const metadata: Metadata = { title: "إضافة مورد | غصن" };

export default async function NewSupplierPage() {
  await requirePermission({ supplier: ["create"] });
  const currencies = await prisma.currency.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { code: true, nameAr: true },
  });
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-bold">إضافة مورد</h1>
      <NewSupplierForm
        today={shopDay(new Date())}
        countries={Object.entries(COUNTRIES).map(([value, label]) => ({ value, label }))}
        currencies={currencies.map((c) => ({ value: c.code, label: `${c.nameAr} (${c.code})` }))}
      />
    </div>
  );
}
