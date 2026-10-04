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
      className="relative flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 hover:bg-muted"
    >
      <ShoppingBag aria-hidden className="size-5" strokeWidth={1.8} />
      {count ? (
        <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gold px-1 text-[11px] font-bold text-card tabular-nums">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
