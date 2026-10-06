"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { approveCountAction, cancelCountAction, recountAction, startCountAction, type FormState } from "./actions";

type Scope = "FULL" | "CATEGORY" | "QUICK";
const SCOPES: { value: Scope; label: string; hint: string }[] = [
  { value: "CATEGORY", label: "قسم", hint: "قسم واحد — الأنسب أسبوعياً بالتناوب" },
  { value: "QUICK", label: "عدّ سريع", hint: "الأصناف ذات الرصيد السالب وأغلى 10 أصناف" },
  { value: "FULL", label: "المحل كله", hint: "كل الأصناف — كل 3 أشهر، ويُفضَّل صباح يوم هادئ" },
];

/** بدء جرد (المديرة والمالك). الاقتراح يأتي من تذكير الجرد الأسبوعي. */
export function StartCountForm({
  categories,
  suggest,
}: {
  categories: { id: string; nameAr: string }[];
  suggest: { scope: Scope; categoryId: string | null } | null;
}) {
  const [scope, setScope] = useState<Scope>(suggest?.scope ?? "CATEGORY");
  const [state, action, pending] = useActionState<FormState, FormData>(startCountAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <legend className="mb-2 font-semibold">ماذا ستجردين؟</legend>
        {SCOPES.map((s) => (
          <label
            key={s.value}
            className={cn(
              "flex min-h-16 cursor-pointer flex-col justify-center rounded-xl border px-4 py-2 has-focus-visible:ring-2 has-focus-visible:ring-ring/50",
              scope === s.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
            )}
          >
            <input
              type="radio"
              name="scope"
              value={s.value}
              checked={scope === s.value}
              onChange={() => setScope(s.value)}
              className="sr-only"
            />
            <b>{s.label}</b>
            <span className={cn("text-xs", scope === s.value ? "opacity-85" : "text-muted-foreground")}>{s.hint}</span>
          </label>
        ))}
      </fieldset>
      {scope === "CATEGORY" ? (
        <label className="flex flex-col gap-1">
          <span className="font-semibold">القسم</span>
          <NativeSelect name="categoryId" defaultValue={suggest?.categoryId ?? ""} required>
            <option value="" disabled>
              اختاري القسم
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameAr}
              </option>
            ))}
          </NativeSelect>
        </label>
      ) : null}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "جارٍ التجهيز…" : "بدء الجرد"}
      </Button>
    </form>
  );
}

export function RecountButton({ countId, lineId }: { countId: string; lineId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(recountAction, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="countId" value={countId} />
      <input type="hidden" name="lineId" value={lineId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        إعادة عدّ
      </Button>
      {state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
    </form>
  );
}

/** اعتماد الفروقات — مع حقل تكلفة لكل زيادة في صنف بلا تكلفة (D-111). */
export function ApproveCountForm({
  countId,
  costLines,
  disabled,
}: {
  countId: string;
  costLines: { lineId: string; label: string }[];
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(approveCountAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={countId} />
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      {state.success ? <Alert variant="success">{state.success}</Alert> : null}
      {costLines.length ? (
        <div className="flex flex-col gap-2 rounded-xl border border-sand p-3">
          <b className="text-sm">أصناف زائدة بلا تكلفة — أدخلي تكلفة الوحدة ($)</b>
          {costLines.map((l) => (
            <label key={l.lineId} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">{l.label}</span>
              <Input name={`cost:${l.lineId}`} inputMode="decimal" dir="ltr" className="w-32" required />
            </label>
          ))}
        </div>
      ) : null}
      <Button type="submit" disabled={pending || disabled} className="self-start">
        {pending ? "جارٍ الاعتماد…" : "اعتماد الفروقات"}
      </Button>
    </form>
  );
}

export function CancelCountForm({ countId }: { countId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(cancelCountAction, {});
  return (
    <form
      action={action}
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        if (!window.confirm("إلغاء هذا الجرد؟ لن تتغير الأرصدة.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={countId} />
      <Input name="reason" placeholder="سبب الإلغاء" aria-label="سبب الإلغاء" className="w-44" required minLength={3} />
      <Button type="submit" variant="outline" disabled={pending}>
        إلغاء الجرد
      </Button>
      {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
      {state.success ? <span className="text-sm">{state.success}</span> : null}
    </form>
  );
}
