import { Building2, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/admin/empty-state";
import { dec, sum } from "@ghusn/core";
import { Button } from "@/components/ui/button";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount } from "@/lib/format";
import { COUNTRIES, listSuppliers } from "@/lib/suppliers";
import { BalanceBadge } from "./balance";
import { PageHeader } from "@/components/admin/page-header";

export const metadata: Metadata = { title: "الموردون | غصن" };

export default async function SuppliersPage() {
  const session = await requirePermission({ supplier: ["read"] });
  const suppliers = await listSuppliers();
  const owedUsd = sum(suppliers.map((s) => (dec(s.balanceUsd).gt(0) ? s.balanceUsd : "0")));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="الموردون"
        description={
          <>
            إجمالي المستحق للموردين:{" "}
            <bdi dir="ltr" className="font-semibold text-foreground tabular-nums">
              {formatAmount(owedUsd)} $
            </bdi>{" "}
            (بسعر يوم الشراء)
          </>
        }
        actions={
          roleCan(session.user.role, { supplier: ["create"] }) ? (
            <Button asChild>
              <Link href="/admin/suppliers/new">
                <Plus aria-hidden /> إضافة مورد
              </Link>
            </Button>
          ) : null
        }
      />

      {suppliers.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="لا يوجد موردون بعد."
          hint="سجّلي من تشترين منهم (في قطر أو الصين أو مصر أو السودان) لتتابعي المستحقات والدفعات بعملة كل مورد."
          action={
            roleCan(session.user.role, { supplier: ["create"] })
              ? { href: "/admin/suppliers/new", label: "إضافة مورد" }
              : null
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {suppliers.map((s) => (
            <li key={s.id}>
              <Link
                href={`/admin/suppliers/${s.id}`}
                className="flex h-full flex-col gap-2 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-sage"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{s.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {COUNTRIES[s.country] ?? s.country} · {s.currency.nameAr}
                      {s.isActive ? "" : " · غير نشط"}
                    </p>
                  </div>
                  <BalanceBadge balance={s.balance} symbol={s.currency.symbol} decimals={s.currency.decimals} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
