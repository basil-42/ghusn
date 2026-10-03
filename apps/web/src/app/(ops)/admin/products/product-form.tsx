"use client";

import { Plus, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProductInput } from "@/lib/catalog";
import { saveProduct, type ProductFormState } from "./actions";

type Variant = ProductInput["variants"][number] & { key: string; sku?: string; currentBarcode?: string };

export interface ProductFormProps {
  productId: string | null;
  categories: { id: string; nameAr: string }[];
  /** المناسبات (D-92) — المتوقفة تظهر فقط إن كان المنتج مربوطاً بها. */
  occasions: { id: string; nameAr: string; isActive: boolean }[];
  typeLabels: Record<ProductInput["type"], string>;
  unitLabels: Record<ProductInput["unit"], string>;
  initial?: Omit<ProductInput, "variants"> & { variants: (Variant & { sku: string })[] };
  canEdit: boolean;
  /** رسالة أولية (مثل «تمت إضافة المنتج») تختفي عند أول حفظ. */
  notice?: string;
}

let counter = 0;
const newVariant = (): Variant => ({
  key: `new-${++counter}`,
  size: null,
  color: null,
  volume: null,
  barcode: null,
  isActive: true,
});

export function ProductForm({
  productId,
  categories,
  occasions,
  typeLabels,
  unitLabels,
  initial,
  canEdit,
  notice,
}: ProductFormProps) {
  const [state, action] = useActionState<ProductFormState, unknown>(saveProduct.bind(null, productId), {});
  const [pending, startTransition] = useTransition();

  const [fields, setFields] = useState(() => ({
    nameAr: initial?.nameAr ?? "",
    nameEn: initial?.nameEn ?? "",
    descriptionAr: initial?.descriptionAr ?? "",
    categoryId: initial?.categoryId ?? "",
    type: initial?.type ?? ("STOCK" as ProductInput["type"]),
    unit: initial?.unit ?? ("PIECE" as ProductInput["unit"]),
    trackExpiry: initial?.trackExpiry ?? false,
    isActive: initial?.isActive ?? true,
    isWebVisible: initial?.isWebVisible ?? false,
  }));
  const [variants, setVariants] = useState<Variant[]>(() =>
    initial?.variants.length
      ? initial.variants.map((v) => ({ ...v, barcode: null, currentBarcode: v.barcode ?? undefined }))
      : [newVariant()],
  );
  const [occasionIds, setOccasionIds] = useState<string[]>(() => initial?.occasionIds ?? []);
  const [multi, setMulti] = useState(variants.length > 1 || variants.some((v) => v.size || v.color || v.volume));

  const set = <K extends keyof typeof fields>(k: K, v: (typeof fields)[K]) => setFields((f) => ({ ...f, [k]: v }));
  const setVariant = (key: string, patch: Partial<Variant>) =>
    setVariants((vs) => vs.map((v) => (v.key === key ? { ...v, ...patch } : v)));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const list = multi ? variants : variants.slice(0, 1).map((v) => ({ ...v, size: null, color: null, volume: null }));
    const payload: ProductInput = {
      ...fields,
      nameEn: fields.nameEn || null,
      descriptionAr: fields.descriptionAr || null,
      descriptionEn: initial?.descriptionEn ?? null,
      occasionIds,
      variants: list.map(({ id, size, color, volume, barcode, isActive }) => ({
        id,
        size,
        color,
        volume,
        barcode,
        isActive,
      })),
    };
    startTransition(() => action(payload));
  }

  const isMaterial = fields.type === "MATERIAL";

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      {state.success || (notice && !state.error) ? <Alert variant="success">{state.success ?? notice}</Alert> : null}

      <fieldset disabled={!canEdit || pending} className="contents">
        <section className="grid grid-cols-1 gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="nameAr">اسم المنتج (عربي)</Label>
            <Input id="nameAr" value={fields.nameAr} onChange={(e) => set("nameAr", e.target.value)} required />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="nameEn">الاسم بالإنجليزي (اختياري — للمتجر)</Label>
            <Input id="nameEn" dir="ltr" value={fields.nameEn} onChange={(e) => set("nameEn", e.target.value)} />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="categoryId">القسم</Label>
            <NativeSelect
              id="categoryId"
              value={fields.categoryId}
              onChange={(e) => set("categoryId", e.target.value)}
              required
            >
              <option value="" disabled>
                اختاري القسم
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameAr}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="type">النوع</Label>
            <NativeSelect
              id="type"
              value={fields.type}
              onChange={(e) => set("type", e.target.value as ProductInput["type"])}
            >
              {Object.entries(typeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </div>
          {isMaterial ? (
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="unit">وحدة القياس</Label>
              <NativeSelect
                id="unit"
                value={fields.unit}
                onChange={(e) => set("unit", e.target.value as ProductInput["unit"])}
              >
                {Object.entries(unitLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : null}
          <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="descriptionAr">الوصف (اختياري)</Label>
            <textarea
              id="descriptionAr"
              rows={3}
              value={fields.descriptionAr}
              onChange={(e) => set("descriptionAr", e.target.value)}
              className="w-full min-w-0 rounded-xl border border-input bg-card px-4 py-3 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>
          <div className="flex flex-col gap-3 sm:col-span-2">
            <Check checked={fields.trackExpiry} onChange={(v) => set("trackExpiry", v)}>
              له تاريخ صلاحية (عطور، تجميل)
            </Check>
            {!isMaterial ? (
              <Check checked={fields.isWebVisible} onChange={(v) => set("isWebVisible", v)}>
                يظهر في المتجر الإلكتروني
              </Check>
            ) : null}
            <Check checked={fields.isActive} onChange={(v) => set("isActive", v)}>
              نشط (يُباع ويظهر في القوائم)
            </Check>
          </div>
          {!isMaterial && occasions.length ? (
            <fieldset className="flex flex-col gap-2 sm:col-span-2">
              <legend className="mb-1 text-sm font-semibold">المناسبات (يظهر المنتج في صفحاتها بالمتجر)</legend>
              <div className="flex flex-wrap gap-2">
                {occasions
                  .filter((o) => o.isActive || occasionIds.includes(o.id))
                  .map((o) => {
                    const on = occasionIds.includes(o.id);
                    return (
                      <label
                        key={o.id}
                        className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold ${
                          on ? "border-forest bg-forest text-ivory" : "border-line bg-card"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) =>
                            setOccasionIds((ids) => (e.target.checked ? [...ids, o.id] : ids.filter((x) => x !== o.id)))
                          }
                          className="sr-only"
                        />
                        {o.nameAr}
                      </label>
                    );
                  })}
              </div>
            </fieldset>
          ) : null}
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-bold">الباركود والمتغيرات</h2>
            <p className="text-sm text-muted-foreground">
              امسحي باركود المصنع أو اكتبيه. اتركيه فارغاً ليولّد النظام باركوداً داخلياً يُطبع على الملصق.
            </p>
          </div>
          <Check checked={multi} onChange={setMulti} disabled={multi && variants.length > 1}>
            للمنتج عدة مقاسات أو ألوان أو أحجام
            {multi && variants.length > 1 ? (
              <span className="block text-xs text-muted-foreground">لإلغائه احذفي المتغيرات الزائدة أولاً</span>
            ) : null}
          </Check>

          {(multi ? variants : variants.slice(0, 1)).map((v, i) => (
            <div key={v.key} className="grid grid-cols-1 gap-3 rounded-xl border border-border p-4 sm:grid-cols-4">
              {multi ? (
                <>
                  <p className="font-semibold sm:col-span-4">
                    المتغيّر {i + 1}
                    {v.sku ? (
                      <bdi dir="ltr" className="ms-3 text-sm font-normal text-muted-foreground">
                        {v.sku}
                      </bdi>
                    ) : null}
                  </p>
                  <SmallField
                    label="الحجم"
                    value={v.volume}
                    placeholder="100ml"
                    onChange={(x) => setVariant(v.key, { volume: x })}
                  />
                  <SmallField
                    label="اللون"
                    value={v.color}
                    placeholder="أحمر"
                    onChange={(x) => setVariant(v.key, { color: x })}
                  />
                  <SmallField
                    label="المقاس"
                    value={v.size}
                    placeholder="L"
                    onChange={(x) => setVariant(v.key, { size: x })}
                  />
                </>
              ) : v.sku ? (
                <p className="text-sm text-muted-foreground sm:col-span-4">SKU: {v.sku}</p>
              ) : null}
              <SmallField
                label="الباركود"
                value={v.barcode}
                placeholder={v.currentBarcode ?? "يُولَّد تلقائياً"}
                dir="ltr"
                inputMode="numeric"
                hint={v.currentBarcode ? "اتركيه فارغاً للإبقاء على الحالي" : undefined}
                onChange={(x) => setVariant(v.key, { barcode: x })}
                className={multi ? "" : "sm:col-span-2"}
              />
              {multi && variants.length > 1 ? (
                <div className="flex items-end sm:col-span-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setVariants((vs) => vs.filter((x) => x.key !== v.key))}
                  >
                    <Trash2 aria-hidden /> حذف هذا المتغيّر
                  </Button>
                </div>
              ) : null}
            </div>
          ))}

          {multi ? (
            <Button type="button" variant="outline" onClick={() => setVariants((vs) => [...vs, newVariant()])}>
              <Plus aria-hidden /> إضافة متغيّر
            </Button>
          ) : null}
        </section>

        {canEdit ? (
          <div>
            <Button type="submit" disabled={pending} className="w-full sm:w-auto">
              {pending ? "جارٍ الحفظ…" : productId ? "حفظ التعديلات" : "إضافة المنتج"}
            </Button>
          </div>
        ) : null}
      </fieldset>
    </form>
  );
}

function Check({
  checked,
  onChange,
  disabled,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-h-11 items-center gap-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 shrink-0 accent-forest"
      />
      <span>{children}</span>
    </label>
  );
}

function SmallField({
  label,
  value,
  onChange,
  hint,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange"> & {
  label: string;
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  hint?: string;
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className ?? ""}`}>
      <span className="text-sm font-semibold">{label}</span>
      <Input value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} {...props} />
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}
