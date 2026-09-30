"use client";

import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import { quoteCartAction } from "@/app/[locale]/store-actions";
import { keepOnly, type CartItem } from "./cart-store";

export type Quote = Awaited<ReturnType<typeof quoteCartAction>>;

const EMPTY: Quote = { lines: [], totalSdg: "0", allAvailable: false };

/**
 * أسعار وتوفر السلة من الخادم، تُحدَّث عند تغيّر السلة أو اللغة. الأصناف التي لم تعد معروضة تُسقط.
 * أثناء التحديث يبقى العرض السابق و`loading` صحيحة (زر الإتمام معطّل).
 */
export function useQuote(items: CartItem[]) {
  const locale = useLocale();
  const key = `${locale}|${JSON.stringify(items)}`;
  const [state, setState] = useState<{ key: string; quote: Quote } | null>(null);

  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    quoteCartAction(locale, items)
      .then((quote) => {
        if (cancelled) return;
        setState({ key, quote });
        keepOnly(quote.lines.map((l) => l.variantId));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key يمثل items واللغة
  }, [key]);

  if (items.length === 0) return { quote: EMPTY, loading: false };
  return { quote: state?.quote ?? null, loading: state?.key !== key };
}
