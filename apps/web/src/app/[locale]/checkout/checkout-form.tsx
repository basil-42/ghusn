"use client";

import { CARD_MESSAGE_MAX } from "@ghusn/core";
import { createId } from "@paralleldrive/cuid2";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { clearCart, useCart, useHydrated } from "@/components/store/cart-store";
import { Price } from "@/components/store/price";
import { useQuote } from "@/components/store/use-quote";
import { Link, useRouter } from "@/i18n/navigation";
import type { StoreWrapStyle } from "@/lib/wrapping";
import { createOrderAction } from "../store-actions";

const CITIES = ["KHARTOUM", "BAHRI", "OMDURMAN"] as const;
const input = "min-h-12 w-full rounded-xl border border-input bg-card px-3";
const field = "flex min-w-0 flex-col gap-1";

/** إتمام الطلب كضيف (D-88). الخادم يعيد حساب كل شيء؛ الإجمالي المعروض يُرسل للتأكد أن السعر لم يتغيّر. */
export function CheckoutForm({ bankakEnabled, wrapStyles }: { bankakEnabled: boolean; wrapStyles: StoreWrapStyle[] }) {
  const t = useTranslations("checkout");
  const te = useTranslations("errors");
  const tc = useTranslations("cart");
  const locale = useLocale();
  const router = useRouter();
  const items = useCart();
  const hydrated = useHydrated();
  const [wrapStyleId, setWrapStyleId] = useState<string | null>(null);
  const [card, setCard] = useState("");
  const { quote, loading } = useQuote(items, wrapStyleId);
  // معرّف ثابت لهذه المحاولة: الإرسال مرتين (شبكة ضعيفة) لا ينشئ طلبين
  const [orderId] = useState(() => createId());
  const [fulfillment, setFulfillment] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [payment, setPayment] = useState<"ON_RECEIPT" | "BANKAK">("ON_RECEIPT");
  const [gift, setGift] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!hydrated) return <p className="text-muted-foreground">{tc("loading")}</p>;
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-2xl border border-line bg-card p-6">
        <p className="text-muted-foreground">{tc("empty")}</p>
        <Link href="/" className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground">
          {tc("browse")}
        </Link>
      </div>
    );
  }

  const submit = (form: FormData) => {
    if (!quote) return;
    setError(null);
    const s = (k: string) => String(form.get(k) ?? "").trim() || null;
    start(async () => {
      try {
        const r = await createOrderAction({
          id: orderId,
          locale,
          customerName: s("customerName") ?? "",
          phone: s("phone") ?? "",
          fulfillment,
          city: fulfillment === "DELIVERY" ? s("city") : null,
          address: fulfillment === "DELIVERY" ? s("address") : null,
          recipientName: gift ? s("recipientName") : null,
          recipientPhone: gift ? s("recipientPhone") : null,
          note: s("note"),
          payment: bankakEnabled ? payment : "ON_RECEIPT",
          wrapStyleId,
          cardMessage: card.trim() || null,
          items,
          expectedTotalSdg: quote.totalSdg,
        });
        if (r.ok) {
          clearCart();
          router.push(`/o/${r.trackingToken}`);
          return;
        }
        const known = te.has(r.code) ? r.code : "INVALID";
        setError(te(known as "INVALID", r.params ?? {}));
      } catch {
        setError(te("NETWORK"));
      }
    });
  };

  return (
    <form action={submit} className="grid gap-6 md:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
          <legend className="px-1 font-display text-xl font-bold">{t("you")}</legend>
          <label className={field}>
            <span className="font-semibold">{t("name")}</span>
            <input name="customerName" required minLength={2} maxLength={80} autoComplete="name" className={input} />
          </label>
          <label className={field}>
            <span className="font-semibold">{t("phone")}</span>
            <input
              name="phone"
              required
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              maxLength={20}
              className={input}
            />
            <span className="text-xs text-muted-foreground">{t("phoneHint")}</span>
          </label>
        </fieldset>

        <fieldset className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
          <legend className="px-1 font-display text-xl font-bold">{t("receive")}</legend>
          {(["DELIVERY", "PICKUP"] as const).map((f) => (
            <label
              key={f}
              className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${fulfillment === f ? "border-forest" : "border-line"}`}
            >
              <input
                type="radio"
                name="fulfillment"
                value={f}
                checked={fulfillment === f}
                onChange={() => setFulfillment(f)}
                className="mt-1 size-5 accent-forest"
              />
              <span>
                <span className="block font-semibold">{f === "DELIVERY" ? t("delivery") : t("pickup")}</span>
                <span className="text-sm text-muted-foreground">
                  {f === "DELIVERY" ? t("deliveryHint") : t("pickupHint")}
                </span>
              </span>
            </label>
          ))}
          {fulfillment === "DELIVERY" ? (
            <>
              <label className={field}>
                <span className="font-semibold">{t("city")}</span>
                <select name="city" required defaultValue="" className={input}>
                  <option value="" disabled>
                    {t("chooseCity")}
                  </option>
                  {CITIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`cities.${c}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={field}>
                <span className="font-semibold">{t("address")}</span>
                <textarea name="address" required minLength={5} maxLength={300} rows={3} className={`${input} py-2`} />
                <span className="text-xs text-muted-foreground">{t("addressHint")}</span>
              </label>
            </>
          ) : null}
          <label className="flex min-h-11 cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={gift}
              onChange={(e) => setGift(e.target.checked)}
              className="size-5 accent-forest"
            />
            <span className="font-semibold">{t("gift")}</span>
          </label>
          {gift ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={field}>
                <span className="font-semibold">{t("recipientName")}</span>
                <input name="recipientName" maxLength={80} className={input} />
              </label>
              <label className={field}>
                <span className="font-semibold">{t("recipientPhone")}</span>
                <input name="recipientPhone" inputMode="tel" dir="ltr" maxLength={20} className={input} />
              </label>
            </div>
          ) : null}
        </fieldset>

        <fieldset className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
          <legend className="px-1 font-display text-xl font-bold">{t("giftTitle")}</legend>
          {wrapStyles.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {[null, ...wrapStyles].map((w) => (
                <label
                  key={w?.id ?? "none"}
                  className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${wrapStyleId === (w?.id ?? null) ? "border-forest" : "border-line"}`}
                >
                  <input
                    type="radio"
                    name="wrapStyle"
                    checked={wrapStyleId === (w?.id ?? null)}
                    onChange={() => setWrapStyleId(w?.id ?? null)}
                    className="mt-1 size-5 shrink-0 accent-forest"
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap justify-between gap-2 font-semibold">
                      {w ? w.name : t("noWrap")}
                      {w ? <Price value={w.priceSdg} locale={locale} className="text-sm" /> : null}
                    </span>
                    {w?.description ? <span className="text-sm text-muted-foreground">{w.description}</span> : null}
                  </span>
                </label>
              ))}
            </div>
          ) : null}
          {wrapStyleId ? <p className="text-sm text-muted-foreground">{t("photoPromise")}</p> : null}
          <label className={field}>
            <span className="font-semibold">{t("card")}</span>
            <textarea
              name="cardMessage"
              maxLength={CARD_MESSAGE_MAX}
              rows={3}
              value={card}
              onChange={(e) => setCard(e.target.value)}
              placeholder={t("cardPlaceholder")}
              className={`${input} py-2`}
            />
            <span className="text-xs text-muted-foreground tabular-nums">
              {t("cardCount", { used: card.length, max: CARD_MESSAGE_MAX })}
            </span>
          </label>
        </fieldset>

        <fieldset className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
          <label className={field}>
            <span className="font-semibold">{t("note")}</span>
            <textarea
              name="note"
              maxLength={300}
              rows={2}
              placeholder={t("notePlaceholder")}
              className={`${input} py-2`}
            />
          </label>
        </fieldset>
      </div>

      <aside className="flex h-fit flex-col gap-3 rounded-2xl border border-line bg-card p-4">
        <h2 className="font-display text-xl font-bold">{t("summary")}</h2>
        {quote ? (
          <ul className="flex flex-col gap-2 text-sm">
            {quote.lines.map((l) => (
              <li key={l.variantId} className="flex justify-between gap-2">
                <span className="min-w-0">
                  {l.name}
                  {l.option ? ` · ${l.option}` : ""} <bdi dir="ltr">× {l.qty}</bdi>
                  {!l.available ? <span className="block text-destructive">{tc("unavailable")}</span> : null}
                </span>
                <Price value={l.lineTotalSdg} locale={locale} className="shrink-0" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{tc("loading")}</p>
        )}
        {quote?.wrap ? (
          <p className="flex justify-between gap-2 text-sm">
            <span>
              {t("wrapLine")}: {quote.wrap.name}
            </span>
            <Price value={quote.wrap.priceSdg} locale={locale} className="shrink-0" />
          </p>
        ) : null}
        <p className="flex justify-between border-t border-line pt-3 text-lg font-bold">
          <span>{tc("total")}</span>
          {quote ? <Price value={quote.totalSdg} locale={locale} /> : null}
        </p>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">{t("payment")}</legend>
          {(bankakEnabled ? (["ON_RECEIPT", "BANKAK"] as const) : (["ON_RECEIPT"] as const)).map((m) => (
            <label
              key={m}
              className={`flex cursor-pointer gap-2 rounded-xl border p-3 text-sm ${payment === m || !bankakEnabled ? "border-forest" : "border-line"}`}
            >
              <input
                type="radio"
                name="payment"
                value={m}
                checked={bankakEnabled ? payment === m : true}
                onChange={() => setPayment(m)}
                className="mt-0.5 size-5 shrink-0 accent-forest"
              />
              <span>
                <span className="block font-semibold">
                  {m === "BANKAK" ? t("bankak") : fulfillment === "DELIVERY" ? t("cod") : t("inShop")}
                </span>
                {m === "BANKAK" ? <span className="text-xs text-muted-foreground">{t("bankakHint")}</span> : null}
              </span>
            </label>
          ))}
        </fieldset>
        {fulfillment === "DELIVERY" ? <p className="text-xs text-muted-foreground">{tc("deliveryNote")}</p> : null}
        {error ? (
          <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending || loading || !quote?.allAvailable}
          className="flex min-h-12 items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"
        >
          {pending ? t("placing") : t("place")}
        </button>
      </aside>
    </form>
  );
}
