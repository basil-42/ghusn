"use client";

import { actualMargin, dec, plainNumber, toLatinDigits } from "@ghusn/core";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAmount, formatMargin, formatRate } from "@/lib/format";
import type { PriceRow } from "@/lib/pricing";
import { approvePricesAction, type FormState } from "./actions";

const KIND: Record<PriceRow["kind"], { label: string; variant: "destructive" | "warning" | "default" | "success" }> = {
  LOW: { label: "هامش منخفض", variant: "destructive" },
  NEEDS_PRICE: { label: "بلا سعر", variant: "warning" },
  HIGH: { label: "هامش مرتفع", variant: "warning" },
  NO_COST: { label: "بلا تكلفة بعد", variant: "default" },
  OK: { label: "مناسب", variant: "success" },
};

type Edit = { price: string; note: string; selected: boolean };

const clean = (v: string) => toLatinDigits(v).replace(/[,\s٬]/g, "");
const sdg = (v: string) => `${formatAmount(v, 0)} ج.س`;

/**
 * مراجعة واعتماد الأسعار (D-24): السعر المقترح جاهز في الحقل، ويمكن تعديله. الهامش يُحسب
 * مباشرة بنفس دالة الخادم، والسعر تحت الحد الأدنى يحتاج سبباً. الخادم يعيد كل الفحوص.
 */
export function PriceTable({
  rows,
  rate,
  showProduct,
  emptyText = "لا توجد أصناف.",
}: {
  rows: PriceRow[];
  rate: string;
  showProduct: boolean;
  emptyText?: string;
}) {
  const [state, action] = useActionState<FormState, unknown>(approvePricesAction, {});
  const [pending, startTransition] = useTransition();
  // التعديلات فقط؛ الصف بلا تعديل يأخذ القيمة الافتراضية من بياناته (تبقى صحيحة بعد تحديث القائمة)
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const byId = new Map(rows.map((r) => [r.variantId, r]));
  const initialEdit = (r: PriceRow): Edit => ({
    price: r.suggestedSdg ?? (r.priceSdg ? plainNumber(r.priceSdg) : ""),
    note: "",
    selected: false,
  });
  const editOf = (r: PriceRow): Edit => edits[r.variantId] ?? initialEdit(r);
  const update = (id: string, patch: Partial<Edit>) =>
    setEdits((e) => {
      const row = byId.get(id);
      if (!row) return e;
      return { ...e, [id]: { ...(e[id] ?? initialEdit(row)), ...patch } };
    });

  const check = (r: PriceRow) => {
    const e = editOf(r);
    const price = clean(e.price);
    if (!/^[1-9]\d{0,11}$/.test(price)) return { valid: false, margin: null, belowMin: false };
    if (dec(r.avgCostUsd).lte(0)) return { valid: true, margin: null, belowMin: false };
    const margin = actualMargin({ priceSdg: price, sdgPerUsd: rate, avgCostUsd: r.avgCostUsd });
    return { valid: true, margin, belowMin: margin.lt(r.minMargin) };
  };

  const selected = rows.filter((r) => editOf(r).selected);
  const blocked = selected.some((r) => {
    const c = check(r);
    return !c.valid || (c.belowMin && !editOf(r).note.trim());
  });

  function approve() {
    startTransition(() => {
      action(selected.map((r) => ({ variantId: r.variantId, priceSdg: editOf(r).price, note: editOf(r).note })));
      // بعد الاعتماد تعود الصفوف لقيمها الجديدة من الخادم
      setEdits({});
    });
  }

  const selectable = rows.filter((r) => r.kind !== "OK" && r.suggestedSdg);

  return (
    <div className="flex flex-col gap-4">
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      {state.success ? <Alert variant="success">{state.success}</Alert> : null}
      {showProduct && selectable.length > 1 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            setEdits((all) => {
              const next = { ...all };
              for (const r of selectable)
                next[r.variantId] = { ...(next[r.variantId] ?? initialEdit(r)), selected: true };
              return next;
            })
          }
        >
          تحديد كل المقترحات ({selectable.length})
        </Button>
      ) : null}
      {/* رسالة النجاح تبقى حتى لو خرج الصف المعتمد من القائمة */}
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
          {emptyText}
        </p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {rows.map((r) => {
          const e = editOf(r);
          const c = check(r);
          const kind = KIND[r.kind];
          return (
            <li
              key={r.variantId}
              className={`flex flex-col gap-3 rounded-xl border p-3 ${e.selected ? "border-primary" : "border-border"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  {showProduct ? (
                    <Link href={`/admin/products/${r.productId}`} className="font-semibold hover:underline">
                      {r.label}
                    </Link>
                  ) : (
                    <p className="font-semibold">{r.label}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    <bdi dir="ltr">{r.sku}</bdi> · الرصيد {formatAmount(r.qty, 0)}
                  </p>
                </div>
                <Badge variant={kind.variant}>{kind.label}</Badge>
              </div>

              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">متوسط التكلفة</dt>
                  <dd className="font-semibold tabular-nums">
                    {dec(r.avgCostUsd).gt(0) ? <bdi dir="ltr">{formatAmount(r.avgCostUsd)} $</bdi> : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">السعر الحالي</dt>
                  <dd className="font-semibold tabular-nums">
                    {r.priceSdg ? sdg(r.priceSdg) : "—"}
                    {r.margin ? <span className="text-muted-foreground"> · {formatMargin(r.margin)}</span> : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">المقترح</dt>
                  <dd className="font-semibold tabular-nums">
                    {r.suggestedSdg ? sdg(r.suggestedSdg) : "—"}
                    {r.suggestedMargin ? (
                      <span className="text-muted-foreground"> · {formatMargin(r.suggestedMargin)}</span>
                    ) : null}
                  </dd>
                </div>
              </dl>

              <div className="flex flex-wrap items-end gap-3">
                <label className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs font-semibold">السعر الجديد (ج.س)</span>
                  <Input
                    value={e.price}
                    inputMode="numeric"
                    dir="ltr"
                    className="w-40 tabular-nums"
                    onChange={(ev) => update(r.variantId, { price: ev.target.value, selected: true })}
                  />
                </label>
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-5 accent-primary"
                    checked={e.selected}
                    onChange={(ev) => update(r.variantId, { selected: ev.target.checked })}
                  />
                  <span className="font-semibold">اعتماد</span>
                </label>
                <span className="text-sm text-muted-foreground">
                  {!c.valid
                    ? "أدخلي رقماً صحيحاً"
                    : c.margin
                      ? `الهامش ${formatMargin(c.margin)} (المستهدف ${formatMargin(r.targetMargin)}، الأدنى ${formatMargin(r.minMargin)})`
                      : "لا تكلفة بعد — الهامش غير معروف"}
                </span>
              </div>
              {e.selected && c.belowMin ? (
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-destructive">
                    الهامش تحت الحد الأدنى — اكتبي السبب (عرض، منافسة…)
                  </span>
                  <Input
                    value={e.note}
                    maxLength={200}
                    onChange={(ev) => update(r.variantId, { note: ev.target.value })}
                  />
                </label>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className={`flex flex-wrap items-center gap-3 ${rows.length === 0 ? "hidden" : ""}`}>
        <Button type="button" onClick={approve} disabled={pending || selected.length === 0 || blocked}>
          {pending ? "جارٍ الاعتماد…" : `اعتماد ${selected.length} سعر`}
        </Button>
        <span className="text-sm text-muted-foreground">
          سعر الجنيه المستخدم:{" "}
          <bdi dir="ltr" className="tabular-nums">
            {formatRate(rate)}
          </bdi>{" "}
          لكل دولار
        </span>
      </div>
    </div>
  );
}
