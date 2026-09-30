import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { dec, sum } from "@ghusn/core";
import { Button } from "@/components/ui/button";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount } from "@/lib/format";
import { COUNTRIES, listSuppliers } from "@/lib/suppliers";
import { BalanceBadge } from "./balance";

export const metadata: Metadata = { title: "الموردون | غصن" };

export default async function SuppliersPage() {
  const session = await requirePermission({ supplier: ["read"] });
  const suppliers = await listSuppliers();
  const owedUsd = sum(suppliers.map((s) => (dec(s.balanceUsd).gt(0) ? s.balanceUsd : "0")));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">الموردون</h1>
          <p className="text-muted-foreground">
            إجمالي المستحق للموردين:{" "}
            <bdi dir="ltr" className="font-semibold text-foreground tabular-nums">
              {formatAmount(owedUsd)} $
            </bdi>{" "}
            (بسعر يوم الشراء)
          </p>
        </div>
        {roleCan(session.user.role, { supplier: ["create"] }) ? (
          <Button asChild>
            <Link href="/admin/suppliers/new">
              <Plus aria-hidden /> إضافة مورد
            </Link>
          </Button>
        ) : null}
      </header>

      {suppliers.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
          لا يوجد موردون بعد.
        </p>
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
