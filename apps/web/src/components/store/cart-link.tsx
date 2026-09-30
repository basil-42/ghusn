"use client";

import { ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCart } from "./cart-store";

/** زر السلة في الرأس مع العدّاد (ذهبي — brand-identity §2). */
export function CartLink() {
  const t = useTranslations("nav");
  const count = useCart().reduce((n, i) => n + i.qty, 0);
  return (
    <Link
      href="/cart"
      aria-label={count ? `${t("cart")} (${count})` : t("cart")}
      className="relative flex size-11 items-center justify-center rounded-full border border-line hover:bg-muted"
    >
      <ShoppingBag aria-hidden className="size-5" />
      {count ? (
        <span className="absolute -end-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-gold px-1 text-xs font-bold text-forest tabular-nums">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
