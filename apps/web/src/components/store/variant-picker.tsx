"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { StoreVariant } from "@/lib/storefront";
import { Price } from "./price";

/**
 * اختيار المتغيّر (الحجم/المقاس/اللون) وسعره. زر الإضافة للسلة يأتي مع مرحلة السلة.
 * المتغيّرات المعروضة متوفرة فقط (الخادم يصفّيها).
 */
export function VariantPicker({ variants }: { variants: StoreVariant[] }) {
  const t = useTranslations("product");
  const locale = useLocale();
  const [selectedId, setSelectedId] = useState(variants[0]?.id);
  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];
  if (!selected) return null;
  const kind = variants.every((v) => v.volume)
    ? t("volume")
    : variants.every((v) => v.size)
      ? t("size")
      : variants.every((v) => v.color)
        ? t("color")
        : t("option");

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
                  onChange={() => setSelectedId(v.id)}
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
    </div>
  );
}
