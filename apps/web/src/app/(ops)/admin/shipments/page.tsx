import { SHIPMENT_STATUSES, type ShipmentStatus } from "@ghusn/core";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount, formatDateTime } from "@/lib/format";
import { STATUS_LABELS, listShipments } from "@/lib/shipments";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "الشحنات | غصن" };

export function StatusBadge({ status }: { status: ShipmentStatus }) {
  const variant =
    status === "RECEIVED"
      ? "success"
      : status === "CANCELLED"
        ? "destructive"
        : status === "DRAFT"
          ? "default"
          : "warning";
  return <Badge variant={variant}>{STATUS_LABELS[status]}</Badge>;
}

export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requirePermission({ shipment: ["read"] });
  const { status: raw } = await searchParams;
  const status = SHIPMENT_STATUSES.find((s) => s === raw);
  const shipments = await listShipments(status);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">الشحنات</h1>
        {roleCan(session.user.role, { shipment: ["create"] }) ? (
          <Button asChild>
            <Link href="/admin/shipments/new">
              <Plus aria-hidden /> شحنة جديدة
            </Link>
          </Button>
        ) : null}
      </header>

      <nav aria-label="تصفية حسب الحالة" className="flex gap-2 overflow-x-auto pb-1">
        {[undefined, ...SHIPMENT_STATUSES].map((s) => (
          <Link
            key={s ?? "all"}
            href={s ? `/admin/shipments?status=${s}` : "/admin/shipments"}
            className={cn(
              "flex min-h-10 shrink-0 items-center rounded-full border border-border px-4 text-sm font-semibold",
              s === status ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
            )}
          >
            {s ? STATUS_LABELS[s] : "الكل"}
          </Link>
        ))}
      </nav>

      {shipments.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
          لا توجد شحنات.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {shipments.map((s) => (
            <li key={s.id}>
              <Link
                href={`/admin/shipments/${s.id}`}
                className="flex h-full flex-col gap-2 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-sage"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <bdi dir="ltr" className="font-bold tabular-nums">
                      {s.number}
                    </bdi>
                    <p className="truncate text-sm text-muted-foreground">{s.supplierName}</p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
                <div className="mt-auto flex items-end justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">
                    {formatDateTime(s.purchasedAt)} · {s.lineCount} بند
                  </span>
                  <bdi dir="ltr" className="font-semibold tabular-nums">
                    {formatAmount(s.goodsTotal, s.currency.decimals)} {s.currency.symbol}
                  </bdi>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
