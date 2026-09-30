"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setMarginsAction, type FormState } from "../pricing/actions";

/** تجاوز هامش القسم لمنتج بعينه (فارغ = هامش القسم). */
export function MarginsForm({
  productId,
  targetMargin,
  minMargin,
  categoryTarget,
  categoryMin,
}: {
  productId: string;
  targetMargin: string;
  minMargin: string;
  categoryTarget: string;
  categoryMin: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(setMarginsAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      {state.success ? <Alert variant="success">{state.success}</Alert> : null}
      <input type="hidden" name="productId" value={productId} />
      <div className="grid grid-cols-2 gap-3">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-semibold">الهامش المستهدف %</span>
          <Input
            name="targetMargin"
            defaultValue={targetMargin}
            placeholder={`القسم: ${categoryTarget}`}
            inputMode="decimal"
            dir="ltr"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-semibold">الحد الأدنى %</span>
          <Input
            name="minMargin"
            defaultValue={minMargin}
            placeholder={`القسم: ${categoryMin}`}
            inputMode="decimal"
            dir="ltr"
          />
        </label>
      </div>
      <p className="text-sm text-muted-foreground">اتركيهما فارغين لاستخدام هامش القسم.</p>
      <Button type="submit" variant="outline" disabled={pending} className="self-start">
        حفظ الهامش
      </Button>
    </form>
  );
}
