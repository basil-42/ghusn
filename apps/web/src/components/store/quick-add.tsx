"use client";

import { Check, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { track } from "./analytics";
import { addToCart } from "./cart-store";

/** زر «+» في بطاقة المنتج (D-96): يضيف قطعة من المتغيّر الوحيد مباشرة للسلة. */
export function QuickAdd({ variantId, name }: { variantId: string; name: string }) {
  const t = useTranslations("product");
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={`${t("addToCart")}: ${name}`}
      onClick={(e) => {
        e.preventDefault();
        addToCart(variantId, 1);
        track("add_to_cart", { source: "card" });
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-primary text-primary-foreground hover:bg-primary/90"
    >
      {done ? (
        <Check aria-hidden className="size-[18px]" />
      ) : (
        <Plus aria-hidden className="size-[18px]" strokeWidth={2} />
      )}
    </button>
  );
}
