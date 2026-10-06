"use client";

import { adjustmentNoteRequired, dec, MANUAL_ADJUSTMENT_REASONS, type AdjustmentReason } from "@ghusn/core";
import { Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { ImageInput } from "@/components/image-input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { approveAdjustmentAction, createAdjustmentAction, rejectAdjustmentAction, type FormState } from "./actions";

const LABELS: Record<(typeof MANUAL_ADJUSTMENT_REASONS)[number], string> = {
  DAMAGED: "تالف",
  EXPIRED: "منتهي الصلاحية",
  LOST: "مفقود",
  INTERNAL_USE: "استخدام داخلي / عيّنة",
  FOUND: "زيادة وُجدت",
};
const UNIT_LABEL: Record<string, string> = { PIECE: "حبة", METER: "متر", SHEET: "ورقة" };

function parseQty(v: string): ReturnType<typeof dec> | null {
  const t = v.trim().replace("٫", ".");
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(t)) return null;
  return dec(t);
}

/**
 * تسجيل تسوية لصنف واحد (D-111): السبب، الكمية، ملاحظة، وصورة اختيارية. من تملك اعتماد قيمتها
 * تُعتمد فوراً؛ غيرها تنتظر المديرة أو المالك.
 */
export function AdjustmentForm({
  variant,
  seesCost,
  approver,
}: {
  variant: { variantId: string; label: string; unit: string; qty: string; hasCost?: boolean };
  seesCost: boolean;
  approver: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [reason, setReason] = useState<AdjustmentReason>("DAMAGED");
  const [qty, setQty] = useState("1");
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, data) => {
    const result = await createAdjustmentAction(prev, data);
    if (result.success) {
      formRef.current?.reset();
      setQty("1");
    }
    return result;
  }, {});
  const unit = UNIT_LABEL[variant.unit] ?? variant.unit;
  const step = variant.unit === "PIECE" ? 1 : 0.5;
  const q = parseQty(qty);
  const after = q ? dec(variant.qty).plus(reason === "FOUND" ? q : q.neg()) : null;
  const needsCost = seesCost && reason === "FOUND" && variant.hasCost === false;
  const noteRequired = adjustmentNoteRequired(reason);

  const bump = (delta: number) => {
    const next = (q ?? dec(0)).plus(delta);
    setQty(next.lt(step) ? String(step) : next.toFixed());
  };

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="success">{state.success}</Alert>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/admin/stock/adjustments/new">تسوية صنف آخر</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/stock/adjustments">التسويات</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/admin/stock/${variant.variantId}`}>حركات الصنف</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-5">
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      <input type="hidden" name="variantId" value={variant.variantId} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold">السبب</legend>
        <div className="grid grid-cols-2 gap-2">
          {MANUAL_ADJUSTMENT_REASONS.map((r) => (
            <label
              key={r}
              className={cn(
                "flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-3 text-center font-semibold has-focus-visible:ring-2 has-focus-visible:ring-ring/50",
                r === "FOUND" && "col-span-2",
                reason === r ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
              )}
            >
              <input
                type="radio"
                name="reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
                className="sr-only"
              />
              {r === "FOUND" ? `${LABELS[r]} (إضافة للرصيد)` : LABELS[r]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor="adj-qty" className="font-semibold">
          {reason === "FOUND" ? "الكمية الزائدة" : "الكمية الناقصة"}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="icon" aria-label="إنقاص" onClick={() => bump(-step)}>
            <Minus aria-hidden />
          </Button>
          <Input
            id="adj-qty"
            name="qty"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="decimal"
            dir="ltr"
            className="w-24 text-center text-lg font-bold"
            required
          />
          <Button type="button" variant="outline" size="icon" aria-label="زيادة" onClick={() => bump(step)}>
            <Plus aria-hidden />
          </Button>
          <span className="text-sm text-muted-foreground">
            الرصيد الآن {dec(variant.qty).toFixed()} {unit}
            {after ? ` · بعدها ${after.toFixed()} ${unit}` : ""}
          </span>
        </div>
        {after && after.lt(0) ? (
          <span className="text-sm text-destructive">أكثر من الرصيد في النظام — لا يمكن إنقاص ما ليس مسجّلاً.</span>
        ) : null}
      </div>

      {needsCost ? (
        <label className="flex flex-col gap-1">
          <span className="font-semibold">تكلفة الوحدة ($)</span>
          <Input name="unitCostUsd" inputMode="decimal" dir="ltr" className="max-w-40" required />
          <span className="text-xs text-muted-foreground">
            هذا الصنف ليس له تكلفة في النظام — لا تدخل بضاعة بقيمة صفر (D-111).
          </span>
        </label>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="font-semibold">
          ملاحظة <span className="font-normal text-muted-foreground">{noteRequired ? "(مطلوبة)" : "(اختيارية)"}</span>
        </span>
        <Input
          name="note"
          maxLength={300}
          required={noteRequired}
          placeholder={reason === "LOST" ? "متى وأين لاحظتِ النقص؟" : "مثال: تمزّق في الخياطة عند الرف"}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-semibold">صورة (اختيارية)</span>
        <ImageInput
          name="photo"
          accept="image/*"
          capture="environment"
          className="min-h-11 rounded-xl border border-input bg-card p-2 text-sm"
        />
      </label>

      <div className="flex flex-col gap-2">
        <Button type="submit" disabled={pending} className="min-h-12 text-lg">
          {pending ? "جارٍ الحفظ…" : approver ? "حفظ التسوية" : "إرسال للاعتماد"}
        </Button>
        <span className="text-center text-xs text-muted-foreground">
          {approver
            ? "تُعتمد فوراً إن كانت ضمن حد اعتمادك، وإلا تذهب للمالك."
            : "لا يتغير الرصيد حتى تعتمدها المديرة — ويصلها إشعار الآن."}
        </span>
      </div>
    </form>
  );
}

/** اعتماد تسوية منتظرة؛ صنف بلا تكلفة يحتاج إدخالها. */
export function ApproveAdjustmentForm({ id, needsCost }: { id: string; needsCost: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(approveAdjustmentAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      {needsCost ? (
        <Input
          name="unitCostUsd"
          inputMode="decimal"
          dir="ltr"
          placeholder="تكلفة الوحدة $"
          aria-label="تكلفة الوحدة بالدولار"
          className="w-32"
          required
        />
      ) : null}
      <Button type="submit" size="sm" disabled={pending}>
        اعتماد
      </Button>
      {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
    </form>
  );
}

export function RejectAdjustmentForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(rejectAdjustmentAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Input name="reason" placeholder="سبب الرفض" aria-label="سبب الرفض" className="w-40" required minLength={3} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        رفض
      </Button>
      {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
    </form>
  );
}
