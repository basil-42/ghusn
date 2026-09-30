"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { MAX_QTY, removeFromCart, setCartQty, useCart, useHydrated } from "@/components/store/cart-store";
import { Price } from "@/components/store/price";
import { useQuote } from "@/components/store/use-quote";
import { Link } from "@/i18n/navigation";

export function CartView() {
  const t = useTranslations("cart");
  const locale = useLocale();
  const items = useCart();
  const hydrated = useHydrated();
  const { quote, loading } = useQuote(items);

  if (!hydrated) return <p className="text-muted-foreground">{t("loading")}</p>;
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-2xl border border-line bg-card p-6">
        <p className="text-muted-foreground">{t("empty")}</p>
        <Link href="/" className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground">
          {t("browse")}
        </Link>
      </div>
    );
  }
  if (!quote) return <p className="text-muted-foreground">{t("loading")}</p>;

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_20rem]">
      <ul className="flex flex-col gap-3">
        {quote.lines.map((l) => (
          <li key={l.variantId} className="flex gap-3 rounded-2xl border border-line bg-card p-3">
            <Link href={`/p/${l.productId}`} className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-muted">
              {l.imageUrl ? (
                <Image src={l.imageUrl} alt="" fill sizes="80px" className="object-cover" unoptimized />
              ) : (
                <Image src="/brand/mark-sage.svg" alt="" width={32} height={32} className="m-auto mt-6 opacity-40" />
              )}
            </Link>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Link href={`/p/${l.productId}`} className="font-semibold hover:underline">
                {l.name}
              </Link>
              {l.option ? <span className="text-sm text-muted-foreground">{l.option}</span> : null}
              <Price value={l.unitPriceSdg} locale={locale} className="text-sm" />
              {!l.available ? <p className="text-sm font-semibold text-destructive">{t("unavailable")}</p> : null}
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  aria-label={t("decrease")}
                  disabled={l.qty <= 1}
                  onClick={() => setCartQty(l.variantId, l.qty - 1)}
                  className="flex size-11 items-center justify-center rounded-full border border-line disabled:opacity-40"
                >
                  <Minus aria-hidden className="size-4" />
                </button>
                <span className="min-w-6 text-center font-semibold tabular-nums">{l.qty}</span>
                <button
                  type="button"
                  aria-label={t("increase")}
                  disabled={l.qty >= MAX_QTY}
                  onClick={() => setCartQty(l.variantId, l.qty + 1)}
                  className="flex size-11 items-center justify-center rounded-full border border-line disabled:opacity-40"
                >
                  <Plus aria-hidden className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={t("remove")}
                  onClick={() => removeFromCart(l.variantId)}
                  className="ms-auto flex size-11 items-center justify-center rounded-full text-destructive hover:bg-muted"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </div>
            </div>
            <Price value={l.lineTotalSdg} locale={locale} className="shrink-0 font-bold" />
          </li>
        ))}
      </ul>
      <aside className="flex h-fit flex-col gap-3 rounded-2xl border border-line bg-card p-4">
        <p className="flex justify-between text-lg font-bold">
          <span>{t("total")}</span>
          <Price value={quote.totalSdg} locale={locale} />
        </p>
        <p className="text-sm text-muted-foreground">{t("deliveryNote")}</p>
        {quote.allAvailable && !loading ? (
          <Link
            href="/checkout"
            className="flex min-h-12 items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground"
          >
            {t("checkout")}
          </Link>
        ) : (
          <span className="flex min-h-12 items-center justify-center rounded-xl bg-muted font-semibold text-muted-foreground">
            {loading ? t("loading") : t("checkout")}
          </span>
        )}
      </aside>
    </div>
  );
}
