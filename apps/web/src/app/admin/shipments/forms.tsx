"use client";

import { Plus, Search, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Field, SelectField } from "@/components/form-field";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addCostAction,
  createShipmentAction,
  saveLinesAction,
  searchVariantsAction,
  transitionAction,
  updateDetailsAction,
  voidCostAction,
  type FormState,
} from "./actions";

type Option = { value: string; label: string };

function Messages({ state }: { state: FormState }) {
  return (
    <>
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      {state.success ? <Alert variant="success">{state.success}</Alert> : null}
    </>
  );
}

export function NewShipmentForm({ suppliers }: { suppliers: Option[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createShipmentAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <Messages state={state} />
      <SelectField label="المورد" name="supplierId" defaultValue="" required>
        <option value="" disabled>
          اختاري المورد
        </option>
        {suppliers.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </SelectField>
      <div>
        <Button type="submit" disabled={pending}>
          إنشاء الشحنة (مسودة)
        </Button>
      </div>
    </form>
  );
}

export function StatusActions({ id, next }: { id: string; next: Option[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(transitionAction, {});
  return (
    <div className="flex flex-col gap-3">
      <Messages state={state} />
      <div className="flex flex-wrap gap-2">
        {next.map((n) => (
          <form
            key={n.value}
            action={action}
            onSubmit={(e) => {
              if (n.value === "CANCELLED" && !window.confirm("إلغاء الشحنة؟ تُلغى قيمتها من حساب المورد."))
                e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="to" value={n.value} />
            <Button
              type="submit"
              disabled={pending}
              variant={n.value === "CANCELLED" ? "outline" : n.value === "PURCHASED" ? "default" : "outline"}
              className={n.value === "CANCELLED" ? "text-destructive" : ""}
            >
              {n.label}
            </Button>
          </form>
        ))}
      </div>
    </div>
  );
}

export function DetailsForm({
  id,
  isDraft,
  purchasedAt,
  dueDate,
  origin,
  notes,
  countries,
  today,
  disabled,
}: {
  id: string;
  isDraft: boolean;
  purchasedAt: string;
  dueDate: string;
  origin: string;
  notes: string;
  countries: Option[];
  today: string;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateDetailsAction, {});
  return (
    <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-3 sm:col-span-2">
        <Messages state={state} />
      </div>
      <input type="hidden" name="id" value={id} />
      <fieldset disabled={disabled} className="contents">
        <Field
          label="تاريخ الشراء (سعر صرفه يحدد التكلفة)"
          name={isDraft ? "purchasedAt" : undefined}
          id="purchasedAt"
          type="date"
          dir="ltr"
          max={today}
          defaultValue={purchasedAt}
          disabled={!isDraft}
          hint={isDraft ? undefined : "ثابت بعد تأكيد الشراء"}
        />
        <Field
          label="تاريخ الاستحقاق (للأقساط — اختياري)"
          name="dueDate"
          id="dueDate"
          type="date"
          dir="ltr"
          defaultValue={dueDate}
        />
        <SelectField label="بلد المصدر" name="origin" id="origin" defaultValue={origin}>
          {countries.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </SelectField>
        <Field label="ملاحظات" name="notes" id="notes" defaultValue={notes} />
        <div className="sm:col-span-2">
          <Button type="submit" variant="outline" disabled={pending}>
            حفظ البيانات
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

type LineRow = {
  key: string;
  variantId: string;
  label: string;
  sku: string;
  unit: string;
  qty: string;
  unitPrice: string;
};
type Hit = { variantId: string; label: string; sku: string; unit: string };

const UNIT_LABEL: Record<string, string> = { PIECE: "حبة", METER: "متر", SHEET: "ورقة" };

export function LinesEditor({
  id,
  initial,
  currencySymbol,
  disabled,
}: {
  id: string;
  initial: Omit<LineRow, "key">[];
  currencySymbol: string;
  disabled: boolean;
}) {
  const [state, action] = useActionState<FormState, unknown>(saveLinesAction.bind(null, id), {});
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<LineRow[]>(() => initial.map((l, i) => ({ ...l, key: `l${i}` })));
  const [query, setQuery] = useState("");
  // النتائج مربوطة بالبحث الذي أنتجها — لا تُعرض نتائج بحث سابق أثناء انتظار الجديد
  const [hits, setHits] = useState<{ query: string; items: Hit[] }>({ query: "", items: [] });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) return;
    let current = true; // تجاهل نتائج بحث قديمة إن كتبت المستخدمة بسرعة
    const t = setTimeout(() => {
      void searchVariantsAction(query).then((items) => {
        if (current) setHits({ query, items });
      });
    }, 250);
    return () => {
      current = false;
      clearTimeout(t);
    };
  }, [query]);
  const visibleHits = query.trim().length >= 2 && hits.query === query ? hits.items : [];

  const update = (key: string, patch: Partial<LineRow>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  function add(hit: Hit) {
    if (rows.some((r) => r.variantId === hit.variantId)) return;
    setRows((rs) => [...rs, { ...hit, key: `n${Date.now()}`, qty: "1", unitPrice: "" }]);
    setQuery("");
    setDirty(true);
  }

  function save() {
    startTransition(() => {
      action(rows.map(({ variantId, qty, unitPrice }) => ({ variantId, qty, unitPrice })));
      setDirty(false);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Messages state={state} />
      {!disabled ? (
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="أضيفي منتجاً: ابحثي بالاسم أو الباركود أو SKU"
            aria-label="بحث عن منتج"
            className="ps-11"
          />
          {visibleHits.length ? (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-auto rounded-xl border border-border bg-card shadow-lg">
              {visibleHits.map((h) => (
                <li key={h.variantId}>
                  <button
                    type="button"
                    onClick={() => add(h)}
                    className="flex min-h-11 w-full items-center justify-between gap-2 px-4 text-start hover:bg-muted"
                  >
                    <span>{h.label}</span>
                    <bdi dir="ltr" className="text-sm text-muted-foreground">
                      {h.sku}
                    </bdi>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
          لا توجد بنود بعد.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li
              key={r.key}
              className="grid grid-cols-2 items-end gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1fr_8rem_10rem_auto]"
            >
              <div className="col-span-2 min-w-0 sm:col-span-1">
                <p className="truncate font-semibold">{r.label}</p>
                <bdi dir="ltr" className="text-xs text-muted-foreground">
                  {r.sku}
                </bdi>
              </div>
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-xs font-semibold">الكمية ({UNIT_LABEL[r.unit] ?? r.unit})</span>
                <Input
                  value={r.qty}
                  inputMode="decimal"
                  dir="ltr"
                  disabled={disabled}
                  onChange={(e) => update(r.key, { qty: e.target.value })}
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-xs font-semibold">سعر الوحدة ({currencySymbol})</span>
                <Input
                  value={r.unitPrice}
                  inputMode="decimal"
                  dir="ltr"
                  disabled={disabled}
                  onChange={(e) => update(r.key, { unitPrice: e.target.value })}
                />
              </label>
              {!disabled ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="حذف البند"
                  className="col-span-2 justify-self-end text-destructive sm:col-span-1"
                  onClick={() => {
                    setRows((rs) => rs.filter((x) => x.key !== r.key));
                    setDirty(true);
                  }}
                >
                  <Trash2 aria-hidden />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!disabled ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={save} disabled={pending || !dirty}>
            {pending ? "جارٍ الحفظ…" : "حفظ البنود"}
          </Button>
          {dirty ? <span className="text-sm text-warning">تعديلات غير محفوظة</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export function CostForm({
  id,
  wallets,
  kinds,
  today,
}: {
  id: string;
  wallets: Option[];
  kinds: Option[];
  today: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(addCostAction, {});
  return (
    <form action={action} key={state.success} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-3 sm:col-span-2">
        <Messages state={state} />
      </div>
      <input type="hidden" name="id" value={id} />
      <SelectField label="البند" name="kind" id="cost-kind" defaultValue="SHIPPING">
        {kinds.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </SelectField>
      <SelectField label="دُفع من محفظة (بعملتها)" name="walletId" id="cost-wallet" defaultValue={wallets[0]?.value}>
        {wallets.map((w) => (
          <option key={w.value} value={w.value}>
            {w.label}
          </option>
        ))}
      </SelectField>
      <Field label="المبلغ" name="amount" id="cost-amount" inputMode="decimal" dir="ltr" required />
      <Field
        label="تاريخ الدفع"
        name="paidAt"
        id="cost-date"
        type="date"
        dir="ltr"
        max={today}
        defaultValue={today}
        required
      />
      <div className="sm:col-span-2">
        <Field label="ملاحظة (اختياري)" name="note" id="cost-note" />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" variant="outline" disabled={pending}>
          <Plus aria-hidden /> إضافة التكلفة
        </Button>
      </div>
    </form>
  );
}

export function VoidCostForm({ id, costId }: { id: string; costId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(voidCostAction, {});
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setOpen(true)}>
        إلغاء
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="costId" value={costId} />
      <input
        name="reason"
        required
        minLength={3}
        placeholder="سبب الإلغاء"
        aria-label="سبب الإلغاء"
        className="min-h-11 min-w-0 rounded-xl border border-input bg-card px-3"
      />
      <div className="flex gap-2">
        <Button type="submit" variant="outline" size="sm" className="text-destructive" disabled={pending}>
          تأكيد الإلغاء
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          تراجع
        </Button>
      </div>
      {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
    </form>
  );
}
