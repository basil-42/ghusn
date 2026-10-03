"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { MAX_QTY, addToCart } from "./cart-store";
import type { StoreVariant } from "@/lib/storefront";
import { Price } from "./price";

/**
 * اختيار المتغيّر (الحجم/المقاس/اللون) وسعره، والكمية، والإضافة للسلة.
 * المتغيّرات المعروضة متوفرة فقط (الخادم يصفّيها).
 */
export function VariantPicker({ variants }: { variants: StoreVariant[] }) {
  const t = useTranslations("product");
  const locale = useLocale();
  const [selectedId, setSelectedId] = useState(variants[0]?.id);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];
  if (!selected) return null;
  const kind = variants.every((v) => v.volume)
    ? t("volume")
    : variants.every((v) => v.size)
      ? t("size")
      : variants.every((v) => v.color)
        ? t("color")
        : t("option");

  const addRow = (withLabel: boolean) => (
    <>
      <label className="flex flex-col gap-1">
        <span className={withLabel ? "text-sm font-semibold" : "sr-only"}>{t("qty")}</span>
        <select
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          className="min-h-12 rounded-xl border border-input bg-card px-3 tabular-nums"
        >
          {Array.from({ length: MAX_QTY }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => {
          addToCart(selected.id, qty);
          setAdded(true);
        }}
        className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary/90"
      >
        {t("addToCart")}
      </button>
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-2xl font-bold">
        <Price value={selected.priceSdg} locale={locale} />
      </p>
      {variants.length > 1 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-semibold">
            {kind}: <span className="font-normal">{selected.label}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => (
              <label
                key={v.id}
                className={`flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
                  v.id === selected.id ? "border-forest bg-forest text-ivory" : "border-line bg-card hover:bg-muted"
                }`}
              >
                <input
                  type="radio"
                  name="variant"
                  value={v.id}
                  checked={v.id === selected.id}
                  onChange={() => {
                    setSelectedId(v.id);
                    setAdded(false);
                  }}
                  className="sr-only"
                />
                {v.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <p className="text-sm font-semibold">
        <span aria-hidden className="text-sage">
          ●
        </span>{" "}
        {t("available")}
      </p>
      {/* الكمية والزر: صف عادي على الشاشات المتوسطة فما فوق، وشريط مثبّت أسفل الشاشة على الجوال فقط.
          عنصران منفصلان بدل عنصر واحد يتبدّل بين fixed وstatic — Safari لم يُعِده للتدفّق العادي (D-95) */}
      <div className="hidden flex-wrap items-end gap-3 md:flex">{addRow(true)}</div>
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-end gap-3 border-t border-line bg-card p-3 shadow-[0_-4px_12px_rgb(0_0_0/0.06)] md:hidden">
        {addRow(false)}
      </div>
      <div aria-hidden className="h-16 md:hidden" />
      {added ? (
        <p role="status" className="flex flex-wrap items-center gap-2 rounded-xl bg-muted p-3 text-sm">
          {t("added")}
          <Link href="/cart" className="font-semibold underline">
            {t("viewCart")}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
