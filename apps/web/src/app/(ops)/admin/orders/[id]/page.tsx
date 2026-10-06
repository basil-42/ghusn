import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount, formatDateTime } from "@/lib/format";
import { CITY_LABELS, ORDER_STATUS_LABELS, getOrderForStaff, statusVariant } from "@/lib/orders";
import { OrderActions } from "../order-actions";
import { orderMessages } from "@/lib/order-messages";
import { MarkOrderOpened } from "./mark-opened";
import { OrderMessages } from "./order-messages";

export const metadata: Metadata = { title: "طلب | غصن" };

const PAYMENT_LABELS = { COD: "عند الاستلام (مع شركة التوصيل)", IN_SHOP: "في المحل عند الاستلام", BANKAK: "بنكك" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission({ order: ["read"] });
  const { id } = await params;
  const [o, messages] = await Promise.all([getOrderForStaff(id), orderMessages(id)]);
  if (!o) notFound();
  const role = session.user.role;
  const canSeeProofs = roleCan(role, { order: ["payment"] });
  const sdg = (v: string) => `${formatAmount(v, 0)} ج.س`;

  return (
    <div className="flex flex-col gap-6">
      <MarkOrderOpened orderId={o.id} />
      <header className="flex flex-col gap-1">
        <Link href="/admin/orders" className="text-sm text-muted-foreground underline">
          طلبات المتجر
        </Link>
        <h1 className="flex flex-wrap items-center gap-3 font-display text-3xl font-bold">
          <bdi dir="ltr">{o.number}</bdi>
          <Badge variant={statusVariant(o.status)}>{ORDER_STATUS_LABELS[o.status]}</Badge>
        </h1>
        <p className="text-muted-foreground">{formatDateTime(o.createdAt)}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>الأصناف</CardTitle>
            </CardHeader>
            <ul className="divide-y divide-border">
              {o.lines.map((l) => (
                <li key={l.id} className="flex justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block font-semibold">{l.label}</span>
                    <span dir="ltr" className="text-xs text-muted-foreground">
                      {l.sku}
                    </span>
                  </span>
                  <span className="shrink-0 text-end tabular-nums">
                    <bdi dir="ltr">
                      {formatAmount(l.qty, 0)} × {formatAmount(l.unitPriceSdg, 0)}
                    </bdi>
                    <span className="block font-bold">{sdg(l.lineTotalSdg)}</span>
                  </span>
                </li>
              ))}
            </ul>
            {o.wrapName ? (
              <p className="flex justify-between gap-3 border-t border-border py-2">
                <span className="font-semibold">تغليف «{o.wrapName}»</span>
                <span className="tabular-nums">{sdg(o.wrapPriceSdg ?? "0")}</span>
              </p>
            ) : null}
            <p className="flex justify-between border-t border-border pt-3 text-lg font-bold">
              <span>الإجمالي</span>
              <span className="tabular-nums">{sdg(o.totalSdg)}</span>
            </p>
            <p className="text-sm text-muted-foreground">رسوم التوصيل يدفعها العميل لشركة التوصيل.</p>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>العميل والتسليم</CardTitle>
            </CardHeader>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">العميل</dt>
                <dd className="font-semibold">
                  {o.customerName} ·{" "}
                  <a href={`tel:${o.phone}`} dir="ltr" className="underline">
                    {o.phone}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">الاستلام</dt>
                <dd className="font-semibold">
                  {o.fulfillment === "PICKUP" ? "من المحل" : `توصيل — ${o.city ? CITY_LABELS[o.city] : ""}`}
                </dd>
              </div>
              {o.address ? (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">العنوان</dt>
                  <dd className="whitespace-pre-line font-semibold">{o.address}</dd>
                </div>
              ) : null}
              {o.recipientName || o.recipientPhone ? (
                <div>
                  <dt className="text-muted-foreground">المستلم</dt>
                  <dd className="font-semibold">
                    {o.recipientName}
                    {o.recipientPhone ? (
                      <>
                        {" "}
                        ·{" "}
                        <a href={`tel:${o.recipientPhone}`} dir="ltr" className="underline">
                          {o.recipientPhone}
                        </a>
                      </>
                    ) : null}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-muted-foreground">الدفع</dt>
                <dd className="font-semibold">{PAYMENT_LABELS[o.paymentMethod]}</dd>
              </div>
              {o.courierRef ? (
                <div>
                  <dt className="text-muted-foreground">رقم الشحنة</dt>
                  <dd dir="ltr" className="font-semibold">
                    {o.courierRef}
                  </dd>
                </div>
              ) : null}
              {o.note ? (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">ملاحظة العميل</dt>
                  <dd className="whitespace-pre-line font-semibold">{o.note}</dd>
                </div>
              ) : null}
              {o.cancelReason ? (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">سبب الإلغاء</dt>
                  <dd className="font-semibold text-destructive">{o.cancelReason}</dd>
                </div>
              ) : null}
            </dl>
          </Card>

          {o.cardMessage || o.wrapName ? (
            <Card>
              <CardHeader>
                <CardTitle>الهدية</CardTitle>
              </CardHeader>
              {o.cardMessage ? (
                <div className="flex flex-col gap-2">
                  <p className="whitespace-pre-line rounded-xl bg-muted p-3 font-display text-lg">{o.cardMessage}</p>
                  <a
                    href={`/print/card/${o.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center self-start rounded-xl border border-primary px-4 font-semibold text-primary hover:bg-muted"
                  >
                    طباعة البطاقة
                  </a>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">بلا بطاقة.</p>
              )}
            </Card>
          ) : null}

          {o.paymentMethod === "BANKAK" ? (
            <Card>
              <CardHeader>
                <CardTitle>دفع بنكك</CardTitle>
              </CardHeader>
              {o.status === "AWAITING_PAYMENT" && o.paymentDueAt ? (
                <p className="text-sm">
                  مهلة الدفع حتى <span className="font-semibold">{formatDateTime(o.paymentDueAt)}</span> — بعدها يُلغى
                  الطلب تلقائياً ويُفك الحجز.
                </p>
              ) : null}
              {o.proofs.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">لم يرفع العميل إشعاراً بعد.</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-3">
                  {o.proofs.map((p) => (
                    <li key={p.id} className="flex flex-col gap-2 rounded-xl border border-border p-3 text-sm">
                      <span className="flex flex-wrap justify-between gap-2">
                        <span>
                          رقم العملية:{" "}
                          <bdi dir="ltr" className="font-semibold">
                            {p.reference}
                          </bdi>
                        </span>
                        <span className="text-muted-foreground">{formatDateTime(p.at)}</span>
                      </span>
                      {canSeeProofs ? (
                        <a
                          href={`/admin/orders/${o.id}/proof/${p.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="self-start"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- صورة خاصة من مسار بصلاحية */}
                          <img
                            src={`/admin/orders/${o.id}/proof/${p.id}`}
                            alt={`إشعار بنكك ${p.reference}`}
                            className="max-h-80 rounded-lg border border-border"
                          />
                        </a>
                      ) : null}
                      <span
                        className={
                          p.accepted === true
                            ? "font-semibold text-primary"
                            : p.accepted === false
                              ? "font-semibold text-destructive"
                              : "font-semibold"
                        }
                      >
                        {p.accepted === true ? "مقبول" : p.accepted === false ? "مرفوض" : "بانتظار المراجعة"}
                        {p.reviewer ? ` · ${p.reviewer}` : ""}
                        {p.note ? ` · ${p.note}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>السجل</CardTitle>
            </CardHeader>
            <ol className="flex flex-col gap-2 text-sm">
              {o.history.map((h) => (
                <li
                  key={h.id}
                  className="flex flex-wrap justify-between gap-2 border-b border-border pb-2 last:border-0"
                >
                  <span>
                    <span className="font-semibold">{ORDER_STATUS_LABELS[h.to]}</span>
                    {h.reason ? <span className="text-muted-foreground"> · {h.reason}</span> : null}
                  </span>
                  <span className="text-muted-foreground">
                    {formatDateTime(h.at)} · {h.actor ?? (h.to === "CANCELLED" ? "النظام" : "العميل")}
                  </span>
                </li>
              ))}
            </ol>
            {o.payments.length ? (
              <ul className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-sm">
                {o.payments.map((p) => (
                  <li key={p.id} className="flex justify-between">
                    <span>
                      {p.amountSdg.startsWith("-") ? "رُد للعميل من" : "المقبوض إلى"} «{p.wallet}» ·{" "}
                      {formatDateTime(p.at)}
                      {p.reference ? (
                        <>
                          {" "}
                          · <bdi dir="ltr">{p.reference}</bdi>
                        </>
                      ) : null}
                    </span>
                    <span className="font-semibold tabular-nums">{sdg(p.amountSdg)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        </div>

        <aside className="flex flex-col gap-4">
          {messages ? (
            <OrderMessages
              orderId={o.id}
              primary={messages.primary}
              others={messages.others}
              unavailable={messages.unavailable}
            />
          ) : null}
          {o.status !== "DELIVERED" && o.status !== "CANCELLED" && roleCan(role, { order: ["update"] }) ? (
            <div className="flex flex-col gap-3">
              <h2 className="font-semibold">الخطوة التالية</h2>
              <OrderActions
                id={o.id}
                status={o.status}
                fulfillment={o.fulfillment}
                canCancel={roleCan(role, { order: ["cancel"] })}
                canReviewPayment={canSeeProofs}
                pendingProofId={o.proofs.find((p) => !p.reviewedAt)?.id ?? null}
                paid={o.payments.some((p) => !p.amountSdg.startsWith("-"))}
              />
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
