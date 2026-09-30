import {
  allowedShipmentTransitions,
  canChangeShipmentCosts,
  canReceiveShipment,
  isShipmentEditable,
  plainNumber,
  shopDay,
} from "@ghusn/core";
import { prisma } from "@ghusn/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount, formatDateTime } from "@/lib/format";
import { COST_LABELS, STATUS_LABELS, getShipment } from "@/lib/shipments";
import { COUNTRIES } from "@/lib/suppliers";
import { CostForm, DetailsForm, LinesEditor, StatusActions, VoidCostForm } from "../forms";
import { StatusBadge } from "../page";

export const metadata: Metadata = { title: "شحنة | غصن" };

const TRANSITION_LABELS: Record<string, string> = {
  PURCHASED: "تأكيد الشراء (يُسجَّل في حساب المورد)",
  IN_TRANSIT: "في الطريق",
  IN_CUSTOMS: "في الجمارك",
  ARRIVED: "وصلت",
  CANCELLED: "إلغاء الشحنة",
};

export default async function ShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission({ shipment: ["read"] });
  const { id } = await params;
  const s = await getShipment(id);
  if (!s) notFound();
  const role = session.user.role;
  const canEdit = roleCan(role, { shipment: ["update"] }) && isShipmentEditable(s.status);
  const canEditDetails = roleCan(role, { shipment: ["update"] }) && s.status !== "CANCELLED";
  const canCost = roleCan(role, { shipmentCost: ["create"] }) && canChangeShipmentCosts(s.status);
  const canVoidCost = roleCan(role, { shipmentCost: ["void"] }) && canChangeShipmentCosts(s.status);
  const canReceive = roleCan(role, { shipment: ["receive"] }) && canReceiveShipment(s.status);
  const received = s.status === "RECEIVED";
  const wallets = canCost
    ? await prisma.wallet.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, currencyCode: true },
      })
    : [];
  const today = shopDay(new Date());
  const cur = s.currency;
  const landedByLine = new Map(s.landed?.lines.map((l) => [l.lineId, l]) ?? []);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold">
            <bdi dir="ltr">{s.number}</bdi>
          </h1>
          <StatusBadge status={s.status} />
        </div>
        <p className="text-muted-foreground">
          <Link href={`/admin/suppliers/${s.supplier.id}`} className="font-semibold underline">
            {s.supplier.name}
          </Link>{" "}
          · {COUNTRIES[s.origin] ?? s.origin} · قيمة البضاعة{" "}
          <bdi dir="ltr" className="font-semibold text-foreground tabular-nums">
            {formatAmount(s.goodsTotal, cur.decimals)} {cur.symbol}
          </bdi>
          {s.rateUsed ? (
            <>
              {" "}
              · سعر الشراء{" "}
              <bdi dir="ltr" className="tabular-nums">
                {plainNumber(s.rateUsed)} {cur.code}/$
              </bdi>
            </>
          ) : null}
        </p>
      </header>

      {canEdit ? (
        <StatusActions
          id={s.id}
          next={allowedShipmentTransitions(s.status).map((to) => ({
            value: to,
            label: TRANSITION_LABELS[to] ?? STATUS_LABELS[to],
          }))}
        />
      ) : null}
      {canReceive ? (
        <Button asChild className="self-start">
          <Link href={`/admin/shipments/${s.id}/receive`}>استلام الشحنة وإدخالها للمخزون</Link>
        </Button>
      ) : null}
      {received ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted p-4">
          <p>
            استُلمت {s.receivedAt ? formatDateTime(s.receivedAt) : ""}
            {s.receivedBy ? ` · ${s.receivedBy}` : ""} — دخلت البضاعة المخزون.
          </p>
          <Button asChild variant="outline">
            <Link href={`/admin/labels?shipment=${s.id}`}>طباعة ملصقات الباركود</Link>
          </Button>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>البنود</CardTitle>
          <CardDescription>
            {s.status === "DRAFT"
              ? "المسودة لا تؤثر على حساب المورد حتى تأكيد الشراء."
              : "تعديل البنود بعد الشراء يُحدِّث حساب المورد (تُلغى الحركة السابقة وتُسجَّل جديدة)."}
          </CardDescription>
        </CardHeader>
        <LinesEditor
          id={s.id}
          currencySymbol={cur.symbol}
          disabled={!canEdit}
          initial={s.lines.map(({ variantId, label, sku, unit, qty, unitPrice }) => ({
            variantId,
            label,
            sku,
            unit,
            qty: plainNumber(qty),
            unitPrice: plainNumber(unitPrice),
          }))}
        />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>تكاليف الشحنة</CardTitle>
          <CardDescription>
            {s.status === "DRAFT"
              ? "تُضاف بعد تأكيد الشراء."
              : received
                ? "فاتورة وصلت بعد الاستلام؟ أضيفيها هنا: نصيب البضاعة الباقية يرفع متوسط تكلفتها، ونصيب ما بيع يُسجَّل مصروفاً."
                : "كل بند بعملة المحفظة التي دُفع منها وبسعر صرف يوم الدفع. تُوزَّع على البنود حسب القيمة (D-25)."}
          </CardDescription>
        </CardHeader>
        {s.costs.length ? (
          <ul className="flex flex-col gap-2">
            {s.costs.map((c) => (
              <li
                key={c.id}
                className={`flex flex-col gap-1 rounded-xl border border-border p-3 ${c.voided ? "opacity-60" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className={`font-semibold ${c.voided ? "line-through" : ""}`}>
                      {COST_LABELS[c.kind]} — من {c.walletName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatDateTime(c.paidAt)}
                      {c.note ? ` · ${c.note}` : ""}
                    </p>
                  </div>
                  <div className="text-end">
                    <bdi dir="ltr" className="font-bold tabular-nums">
                      {formatAmount(c.amount)} {c.currencyCode}
                    </bdi>
                    <p dir="ltr" className="text-xs text-muted-foreground tabular-nums">
                      = {formatAmount(c.amountUsd)} $ @ {plainNumber(c.rateUsed)}
                    </p>
                  </div>
                </div>
                {c.voided ? (
                  <p className="text-sm text-destructive">
                    ملغاة{c.voided.by ? ` · ${c.voided.by}` : ""} — {c.voided.reason}
                  </p>
                ) : canVoidCost ? (
                  <div className="self-end">
                    <VoidCostForm id={s.id} costId={c.id} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {canCost ? (
          <CostForm
            id={s.id}
            today={today}
            wallets={wallets.map((w) => ({ value: w.id, label: `${w.name} (${w.currencyCode})` }))}
            kinds={Object.entries(COST_LABELS).map(([value, label]) => ({ value, label }))}
          />
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>التكلفة الواصلة</CardTitle>
          <CardDescription>
            {s.landed
              ? `البضاعة ${formatAmount(s.landed.goodsUsd)}$ + تكاليف ${formatAmount(s.landed.extraUsd)}$ = ${formatAmount(s.landed.totalUsd)}$. ${
                  received
                    ? "محسوبة على السليم المستلم؛ تكلفة التالف والناقص محمّلة عليه."
                    : "تُثبَّت للدفعة عند الاستلام بالكمية المستلمة فعلاً."
                }${received && s.landed.lossUsd !== "0" ? ` خسارة بنود لم تصل: ${formatAmount(s.landed.lossUsd)}$.` : ""}`
              : s.lines.length
                ? `لا يوجد سعر صرف لـ ${cur.code} في تاريخ الشراء.`
                : "أضيفي البنود لحساب التكلفة."}
          </CardDescription>
        </CardHeader>
        {s.landed ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المنتج</TableHead>
                <TableHead>الكمية</TableHead>
                {received ? (
                  <>
                    <TableHead>السليم</TableHead>
                    <TableHead>التالف</TableHead>
                    <TableHead>الناقص</TableHead>
                  </>
                ) : null}
                <TableHead>القيمة $</TableHead>
                <TableHead>الحصة</TableHead>
                <TableHead>التكاليف $</TableHead>
                <TableHead>التكلفة الواصلة للوحدة $</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {s.lines.map((l) => {
                const x = landedByLine.get(l.id);
                return (
                  <TableRow key={l.id}>
                    <TableCell>{l.label}</TableCell>
                    <TableCell className="tabular-nums">{plainNumber(l.qty)}</TableCell>
                    {l.received ? (
                      <>
                        <TableCell className="tabular-nums">{plainNumber(l.received.qty)}</TableCell>
                        <TableCell className="tabular-nums">{plainNumber(l.received.damaged)}</TableCell>
                        <TableCell className="tabular-nums">{plainNumber(l.received.missing)}</TableCell>
                      </>
                    ) : null}
                    <TableCell className="tabular-nums">{x ? formatAmount(x.valueUsd) : ""}</TableCell>
                    <TableCell className="tabular-nums">{x ? `${x.sharePct}%` : ""}</TableCell>
                    <TableCell className="tabular-nums">{x ? formatAmount(x.extraUsd) : ""}</TableCell>
                    <TableCell className="font-bold tabular-nums">
                      {x?.landedUnitUsd ? (
                        formatAmount(x.landedUnitUsd)
                      ) : x ? (
                        <span className="text-destructive">خسارة</span>
                      ) : (
                        ""
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>بيانات الشحنة</CardTitle>
        </CardHeader>
        <DetailsForm
          id={s.id}
          isDraft={s.status === "DRAFT"}
          purchasedAt={shopDay(s.purchasedAt)}
          dueDate={s.dueDate ? shopDay(s.dueDate) : ""}
          origin={s.origin}
          notes={s.notes ?? ""}
          today={today}
          disabled={!canEditDetails}
          countries={Object.entries(COUNTRIES).map(([value, label]) => ({ value, label }))}
        />
      </Card>
    </div>
  );
}
