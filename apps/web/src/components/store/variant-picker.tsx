"use client";

import { Minus, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { formatAmount } from "@/lib/format";
import { track } from "./analytics";
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

  const price = <Price value={selected.priceSdg} locale={locale} />;
  const stepBtn =
    "flex size-11 items-center justify-center rounded-[10px] text-forest hover:bg-muted disabled:opacity-35 disabled:hover:bg-transparent";
  // عداد − ١ + بأزرار 44px (D-103)
  const stepper = (
    <div
      role="group"
      aria-label={t("qty")}
      className="flex min-h-12 shrink-0 items-center rounded-xl border border-line bg-card px-0.5"
    >
      <button
        type="button"
        onClick={() => setQty((q) => Math.max(1, q - 1))}
        disabled={qty <= 1}
        aria-label={t("decrease")}
        className={stepBtn}
      >
        <Minus aria-hidden className="size-4" />
      </button>
      <output aria-live="polite" className="min-w-7 text-center font-bold tabular-nums">
        {qty}
      </output>
      <button
        type="button"
        onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))}
        disabled={qty >= MAX_QTY}
        aria-label={t("increase")}
        className={stepBtn}
      >
        <Plus aria-hidden className="size-4" />
      </button>
    </div>
  );
  const addButton = (withPrice: boolean) => (
    <button
      type="button"
      onClick={() => {
        addToCart(selected.id, qty);
        track("add_to_cart", { source: "product", qty });
        setAdded(true);
      }}
      className="flex min-h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 font-semibold whitespace-nowrap text-primary-foreground hover:bg-primary/90"
    >
      {t("addToCart")}
      {/* الجوال: الرقم فقط بجانب النص حتى يبقى الزر سطراً واحداً — العملة ظاهرة في السعر أعلى الصفحة */}
      {withPrice ? <span className="font-bold tabular-nums">· {formatAmount(selected.priceSdg, 0)}</span> : null}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[26px] font-bold">{price}</p>
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
      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full bg-sage" />
          {t("available")}
        </span>
        {selected.limited ? (
          <span className="rounded-full bg-sand/35 px-2.5 py-0.5 text-xs font-bold text-forest">{t("limited")}</span>
        ) : null}
      </p>
      {/* الكمية والزر: صف عادي على الشاشات المتوسطة فما فوق، وشريط مثبّت أسفل الشاشة على الجوال فقط.
          عنصران منفصلان بدل عنصر واحد يتبدّل بين fixed وstatic — Safari لم يُعِده للتدفّق العادي (D-95) */}
      <div className="hidden items-stretch gap-3 md:flex">
        {stepper}
        {addButton(false)}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-stretch gap-2.5 border-t border-line bg-card p-3 shadow-[0_-4px_12px_rgb(0_0_0/0.06)] md:hidden">
        {stepper}
        {addButton(true)}
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
