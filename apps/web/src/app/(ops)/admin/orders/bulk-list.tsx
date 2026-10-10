"use client";

import { sum } from "@ghusn/core";
import { Check, CircleAlert, MessageCircle, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { bulkTransitionAction, logOrderMessageAction, type BulkState } from "./actions";

export interface OrderRow {
  id: string;
  number: string;
  customerName: string;
  sub: string;
  due: string | null;
  statusLabel: string;
  statusVariant: "default" | "success" | "warning" | "destructive";
  totalSdg: string;
  /** يقبل إجراء التبويب الجماعي */
  eligible: boolean;
  /** لماذا لا يقبله (يظهر بدل مربع التحديد) */
  ineligibleHint?: string;
}

export interface BulkAction {
  to: string;
  label: string;
  done: string;
  /** مرجع شركة التوصيل لدفعة التسليم */
  courierRef?: boolean;
  /** يسجّل مالاً: خطوة تأكيد بالعدد والإجمالي */
  confirm?: boolean;
}

const sdg = (v: string) => `${formatAmount(v, 0)} ج.س`;

/**
 * قائمة الطلبات مع الإجراء الجماعي للتبويب (D-124): تحديد ← زر واحد ← نتيجة لكل طلب، ثم رسائل واتساب
 * المقترحة لمن نجح طلبه (تُفتح واحدة تلو الأخرى وتُسجَّل).
 */
export function BulkOrderList({
  rows,
  action,
  empty,
}: {
  rows: OrderRow[];
  action: BulkAction | null;
  empty: React.ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [courierRef, setCourierRef] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<BulkState | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const eligible = rows.filter((r) => r.eligible);
  // طلبات اختفت من التبويب (نُقلت) تخرج من التحديد
  const chosen = rows.filter((r) => selected.has(r.id) && r.eligible);
  const total = sum(chosen.map((r) => r.totalSdg)).toFixed(0);
  const all = eligible.length > 0 && chosen.length === eligible.length;

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function run() {
    if (!action || !chosen.length) return;
    if (action.confirm && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    startTransition(async () => {
      const res = await bulkTransitionAction({
        ids: chosen.map((r) => r.id),
        to: action.to,
        courierRef: action.courierRef ? courierRef : undefined,
      });
      setResult(res);
      setSent(new Set());
      const ok = res.results?.filter((r) => r.ok).length ?? 0;
      if (ok) toast(`${action.done}: ${ok} ${ok === 1 ? "طلب" : "طلبات"}`);
      setSelected(new Set());
      setCourierRef("");
    });
  }

  const failed = result?.results?.filter((r) => !r.ok) ?? [];
  const messages = result?.messages ?? [];

  return (
    <div className={cn("flex flex-col gap-2", chosen.length && "pb-28 md:pb-24")}>
      {result ? (
        <section
          aria-label="نتيجة الإجراء الجماعي"
          className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1 text-sm">
              {result.error ? <span className="font-semibold text-danger">{result.error}</span> : null}
              {result.results ? (
                <span className="font-semibold">
                  <Check aria-hidden className="inline size-4 text-sage" /> نجح{" "}
                  {result.results.filter((r) => r.ok).length} من {result.results.length}
                </span>
              ) : null}
              {failed.map((r) => (
                <span key={r.id} className="text-danger">
                  <CircleAlert aria-hidden className="inline size-4" />{" "}
                  <Link href={`/admin/orders/${r.id}`} className="font-semibold underline">
                    <bdi dir="ltr">{r.number}</bdi>
                  </Link>{" "}
                  — {r.error}
                </span>
              ))}
              {failed.length ? (
                <span className="text-xs text-muted-foreground">
                  كل طلب نُفّذ وحده: ما نجح بقي، وما تعذّر لم يتغيّر.
                </span>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="إغلاق النتيجة"
              onClick={() => setResult(null)}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
          {messages.length ? (
            <div className="flex flex-col gap-2 rounded-xl bg-gold/10 p-3">
              <b className="text-sm">رسائل واتساب للعملاء — {messages.length - sent.size} بانتظار الإرسال</b>
              <ul className="flex flex-col gap-1.5">
                {messages.map((m) => (
                  <li key={m.orderId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      <bdi dir="ltr">{m.number}</bdi> · {m.customerName}
                    </span>
                    <a
                      href={m.href}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => {
                        setSent((s) => new Set(s).add(m.orderId));
                        void logOrderMessageAction(m.orderId, m.key);
                      }}
                      className={cn(
                        "inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 font-semibold",
                        sent.has(m.orderId)
                          ? "border border-border text-muted-foreground"
                          : "bg-primary text-primary-foreground",
                      )}
                    >
                      {sent.has(m.orderId) ? (
                        <Check aria-hidden className="size-4" />
                      ) : (
                        <MessageCircle aria-hidden className="size-4" />
                      )}
                      {sent.has(m.orderId) ? "فُتحت" : m.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {action && eligible.length ? (
        <label className="flex min-h-11 items-center gap-3 px-3 text-sm">
          <input
            type="checkbox"
            checked={all}
            ref={(el) => {
              if (el) el.indeterminate = chosen.length > 0 && !all;
            }}
            onChange={() => setSelected(all ? new Set() : new Set(eligible.map((r) => r.id)))}
            className="size-5 accent-forest"
          />
          <span>
            <b>تحديد الكل</b>
            {chosen.length ? ` · المحددة: ${chosen.length} من ${eligible.length}` : ` (${eligible.length})`}
          </span>
        </label>
      ) : null}

      {rows.length ? null : empty}
      <ul className="flex flex-col gap-2">
        {rows.map((o) => {
          const on = selected.has(o.id) && o.eligible;
          return (
            <li
              key={o.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border bg-card ps-3",
                on ? "border-sage bg-sage/5" : "border-border",
              )}
            >
              {action ? (
                o.eligible ? (
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(o.id)}
                    aria-label={`تحديد ${o.number}`}
                    className="size-5 shrink-0 accent-forest"
                  />
                ) : (
                  <span
                    title={o.ineligibleHint}
                    className="size-5 shrink-0 rounded border-2 border-dashed border-border"
                    aria-hidden
                  />
                )
              ) : null}
              <Link
                href={`/admin/orders/${o.id}`}
                className="flex min-h-16 min-w-0 flex-1 flex-wrap items-center justify-between gap-2 py-3 pe-3 hover:text-primary"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold">
                    <bdi dir="ltr">{o.number}</bdi> · {o.customerName}
                  </span>
                  <span className="text-sm text-muted-foreground">{o.sub}</span>
                  {o.due ? <span className="text-sm text-muted-foreground">{o.due}</span> : null}
                  {action && !o.eligible && o.ineligibleHint ? (
                    <span className="text-xs text-muted-foreground">{o.ineligibleHint}</span>
                  ) : null}
                </span>
                <span className="flex items-center gap-2">
                  <Badge variant={o.statusVariant}>{o.statusLabel}</Badge>
                  <bdi dir="ltr" className="font-bold tabular-nums">
                    {sdg(o.totalSdg)}
                  </bdi>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {action && chosen.length ? (
        <div className="fixed inset-x-3 bottom-20 z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl bg-forest p-3 text-ivory shadow-2xl md:bottom-6 md:ps-5">
          <span className="flex flex-col">
            <b>
              {chosen.length} {chosen.length === 1 ? "طلب محدد" : "طلبات محددة"}
            </b>
            <span className="text-xs text-ivory/80 tabular-nums">الإجمالي {sdg(total)}</span>
          </span>
          {action.courierRef ? (
            <input
              value={courierRef}
              onChange={(e) => setCourierRef(e.target.value)}
              maxLength={60}
              placeholder="مرجع شركة التوصيل (اختياري)"
              aria-label="مرجع شركة التوصيل"
              className="min-h-11 min-w-0 flex-1 rounded-xl bg-ivory/12 px-3 text-sm text-ivory placeholder:text-ivory/60 md:max-w-60"
            />
          ) : (
            <span className="hidden flex-1 md:block" />
          )}
          <button
            type="button"
            disabled={pending}
            onClick={run}
            className={cn(
              "min-h-11 rounded-xl px-4 text-sm font-bold disabled:opacity-60",
              confirming ? "bg-gold text-forest" : "bg-ivory text-forest hover:bg-sand",
            )}
          >
            {pending
              ? "جارٍ التنفيذ…"
              : confirming
                ? `تأكيد: ${action.label} لـ ${chosen.length} بإجمالي ${sdg(total)}`
                : `${action.label} ←`}
          </button>
          <button
            type="button"
            onClick={() => {
              setSelected(new Set());
              setConfirming(false);
            }}
            className="min-h-11 px-2 text-sm underline"
          >
            {confirming ? "تراجع" : "إلغاء التحديد"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
