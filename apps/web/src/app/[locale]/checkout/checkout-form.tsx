"use client";

import { CARD_MESSAGE_MAX } from "@ghusn/core";
import { createId } from "@paralleldrive/cuid2";
import { Check, ChevronDown, Plus } from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { clearCart, useCart, useHydrated } from "@/components/store/cart-store";
import { Price } from "@/components/store/price";
import { useQuote, type Quote } from "@/components/store/use-quote";
import { Link, useRouter } from "@/i18n/navigation";
import type { StoreWrapStyle } from "@/lib/wrapping";
import { createOrderAction } from "../store-actions";

const CITIES = ["KHARTOUM", "BAHRI", "OMDURMAN"] as const;
const input =
  "h-[46px] w-full rounded-[10px] border border-input bg-card px-3 text-sm focus-visible:border-sage focus-visible:outline-2 focus-visible:outline-sage";
const area = `${input} h-auto py-2.5 leading-relaxed`;
const field = "flex min-w-0 flex-col gap-1.5";
const label = "text-[13px] font-semibold";
const hint = "text-xs text-muted-foreground";
// بطاقة اختيار: الإطار يغمق عند الاختيار (has-checked) — الزر نفسه مخفي بصرياً ويبقى للوحة المفاتيح
const choice =
  "relative flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-card p-3.5 has-checked:border-forest has-checked:shadow-[inset_0_0_0_1px_var(--color-forest)] has-focus-visible:outline-2 has-focus-visible:outline-sage";
const dot =
  "mt-0.5 size-[18px] shrink-0 rounded-full border-[1.5px] border-input peer-checked:border-[5px] peer-checked:border-forest";

/**
 * إتمام الطلب كضيف (D-88) بتصميم D-98: أقسام مرقّمة (بياناتك، الاستلام، التغليف والبطاقة، الدفع) وملخص
 * بالصور يبقى ظاهراً على الكمبيوتر؛ على الجوال الملخص سطر قابل للفتح وشريط ثابت بالإجمالي وزر التأكيد.
 * الخادم يعيد حساب كل شيء؛ الإجمالي المعروض يُرسل للتأكد أن السعر لم يتغيّر.
 */
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
  const [noteOpen, setNoteOpen] = useState(false);
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

  const canSubmit = !pending && !loading && !!quote?.allAvailable;
  const count = items.reduce((n, i) => n + i.qty, 0);
  const alert = error ? (
    <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">
      {error}
    </p>
  ) : null;
  const submitButton = (
    <button
      type="submit"
      disabled={!canSubmit}
      className="flex h-[50px] w-full items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-50"
    >
      {pending ? t("placing") : t("place")}
    </button>
  );
  const summary = <SummaryBody quote={quote} fulfillment={fulfillment} />;

  return (
    <form action={submit} className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_370px]">
      {/* الجوال: الملخص سطر يُفتح عند الحاجة */}
      <details className="group rounded-xl border border-line bg-card lg:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            {t("summaryCount", { count })}
            <span className="flex items-center gap-0.5 text-xs text-warning">
              <span className="group-open:hidden">{t("show")}</span>
              <span className="hidden group-open:inline">{t("hide")}</span>
              <ChevronDown aria-hidden className="size-3.5 transition-transform group-open:rotate-180" />
            </span>
          </span>
          {quote ? <Price value={quote.totalSdg} locale={locale} className="font-bold" /> : null}
        </summary>
        <div className="border-t border-line p-4">{summary}</div>
      </details>

      <div className="flex min-w-0 flex-col gap-3.5">
        <Section n={1} title={t("you")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={field}>
              <span className={label}>{t("name")}</span>
              <input name="customerName" required minLength={2} maxLength={80} autoComplete="name" className={input} />
            </label>
            <label className={field}>
              <span className={label}>{t("phone")}</span>
              <input
                name="phone"
                required
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
                maxLength={20}
                className={`${input} text-end`}
              />
              <span className={hint}>{t("phoneHint")}</span>
            </label>
          </div>
        </Section>

        <Section n={2} title={t("receive")}>
          <fieldset className="grid gap-2.5 sm:grid-cols-2">
            <legend className="sr-only">{t("receive")}</legend>
            {(["DELIVERY", "PICKUP"] as const).map((f) => (
              <label key={f} className={choice}>
                <input
                  type="radio"
                  name="fulfillment"
                  value={f}
                  checked={fulfillment === f}
                  onChange={() => setFulfillment(f)}
                  className="peer sr-only"
                />
                <span aria-hidden className={dot} />
                <span className="min-w-0">
                  <b className="block text-sm">{f === "DELIVERY" ? t("delivery") : t("pickup")}</b>
                  <span className={`${hint} leading-relaxed`}>
                    {f === "DELIVERY" ? t("deliveryHint") : t("pickupHint")}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          {fulfillment === "DELIVERY" ? (
            <>
              <fieldset className={field}>
                <legend className={`${label} mb-1.5`}>{t("city")}</legend>
                <div className="flex flex-wrap gap-2">
                  {CITIES.map((c, i) => (
                    <label
                      key={c}
                      className="relative inline-flex min-h-11 cursor-pointer items-center rounded-full border border-input bg-card px-4 text-sm font-semibold has-checked:border-forest has-checked:bg-forest has-checked:text-ivory has-focus-visible:outline-2 has-focus-visible:outline-sage"
                    >
                      <input type="radio" name="city" value={c} required={i === 0} className="sr-only" />
                      {t(`cities.${c}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className={field}>
                <span className={label}>{t("address")}</span>
                <textarea name="address" required minLength={5} maxLength={300} rows={2} className={area} />
                <span className={hint}>{t("addressHint")}</span>
              </label>
            </>
          ) : null}
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 border-t border-line pt-3.5">
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{t("gift")}</span>
              <span className={hint}>{t("giftHint")}</span>
            </span>
            <input
              type="checkbox"
              checked={gift}
              onChange={(e) => setGift(e.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className="relative h-6 w-[42px] shrink-0 rounded-full bg-input transition-colors after:absolute after:start-[3px] after:top-[3px] after:size-[18px] after:rounded-full after:bg-card after:transition-transform peer-checked:bg-forest peer-checked:after:translate-x-[-18px] peer-focus-visible:outline-2 peer-focus-visible:outline-sage ltr:peer-checked:after:translate-x-[18px]"
            />
          </label>
          {gift ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={field}>
                <span className={label}>{t("recipientName")}</span>
                <input name="recipientName" maxLength={80} className={input} />
              </label>
              <label className={field}>
                <span className={label}>{t("recipientPhone")}</span>
                <input name="recipientPhone" inputMode="tel" dir="ltr" maxLength={20} className={`${input} text-end`} />
              </label>
            </div>
          ) : null}
        </Section>

        <Section n={3} title={t("wrapCard")}>
          {wrapStyles.length ? (
            <fieldset className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <legend className="sr-only">{t("giftTitle")}</legend>
              {[null, ...wrapStyles].map((w) => (
                <label
                  key={w?.id ?? "none"}
                  className="relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-line bg-card has-checked:border-forest has-checked:shadow-[inset_0_0_0_1px_var(--color-forest)] has-focus-visible:outline-2 has-focus-visible:outline-sage"
                >
                  <input
                    type="radio"
                    name="wrapStyle"
                    checked={wrapStyleId === (w?.id ?? null)}
                    onChange={() => setWrapStyleId(w?.id ?? null)}
                    className="peer sr-only"
                  />
                  <span className="relative aspect-[4/3] bg-muted">
                    {w?.imageUrl ? (
                      <Image src={w.imageUrl} alt="" fill sizes="200px" className="object-cover" unoptimized />
                    ) : w ? (
                      <span
                        aria-hidden
                        className="absolute inset-0 bg-sage/30 bg-[url('/brand/pattern-sage.svg')] bg-[length:120px]"
                      />
                    ) : null}
                  </span>
                  <span
                    aria-hidden
                    className="absolute start-1.5 top-1.5 hidden size-[22px] items-center justify-center rounded-full bg-forest text-ivory peer-checked:flex"
                  >
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                  <span className="flex flex-col gap-0.5 px-2.5 py-2">
                    <b className="text-[13px]">{w ? w.name : t("noWrap")}</b>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {w ? <Price value={w.priceSdg} locale={locale} /> : t("wrapFree")}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}
          {wrapStyleId ? <p className={hint}>{t("photoPromise")}</p> : null}
          <label className={field}>
            <span className={label}>{t("card")}</span>
            <textarea
              name="cardMessage"
              maxLength={CARD_MESSAGE_MAX}
              rows={3}
              value={card}
              onChange={(e) => setCard(e.target.value)}
              placeholder={t("cardPlaceholder")}
              className={area}
            />
            <span dir="ltr" className={`${hint} text-start tabular-nums rtl:text-end`}>
              {t("cardCount", { used: card.length, max: CARD_MESSAGE_MAX })}
            </span>
          </label>
          {noteOpen ? (
            <label className={field}>
              <span className={label}>{t("note")}</span>
              <textarea
                name="note"
                maxLength={300}
                rows={2}
                autoFocus
                placeholder={t("notePlaceholder")}
                className={area}
              />
            </label>
          ) : (
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              className="flex min-h-9 items-center gap-1 self-start text-[13px] font-semibold text-warning"
            >
              <Plus aria-hidden className="size-3.5" /> {t("addNote")}
            </button>
          )}
        </Section>

        <Section n={4} title={t("payment")}>
          <fieldset className="grid gap-2.5 sm:grid-cols-2">
            <legend className="sr-only">{t("payment")}</legend>
            {(bankakEnabled ? (["ON_RECEIPT", "BANKAK"] as const) : (["ON_RECEIPT"] as const)).map((m) => (
              <label key={m} className={choice}>
                <input
                  type="radio"
                  name="payment"
                  value={m}
                  checked={bankakEnabled ? payment === m : true}
                  onChange={() => setPayment(m)}
                  className="peer sr-only"
                />
                <span aria-hidden className={dot} />
                <span className="min-w-0">
                  <b className="block text-sm">{m === "BANKAK" ? t("bankak") : t("payOnReceipt")}</b>
                  <span className={`${hint} leading-relaxed`}>
                    {m === "BANKAK" ? t("bankakHint") : fulfillment === "DELIVERY" ? t("codHint") : t("inShopHint")}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        </Section>
      </div>

      {/* الكمبيوتر: الملخص والتأكيد بجانب النموذج ويبقيان ظاهرين */}
      <aside className="sticky top-4 hidden flex-col gap-3.5 rounded-[14px] border border-line bg-card p-5 lg:flex">
        <h2 className="text-[17px] font-bold">{t("summary")}</h2>
        {summary}
        {alert}
        {submitButton}
        <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <Check aria-hidden className="size-3.5 text-sage" /> {t("trustConfirm")}
          </li>
          {wrapStyleId ? (
            <li className="flex items-center gap-1.5">
              <Check aria-hidden className="size-3.5 text-sage" /> {t("trustPhoto")}
            </li>
          ) : null}
        </ul>
      </aside>

      {/* الجوال: شريط بالإجمالي وزر التأكيد يلتصق بأسفل الشاشة ما دام النموذج ظاهراً (لا يغطي التذييل) */}
      <div className="sticky bottom-0 z-30 -mx-4 border-t border-line bg-card px-4 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] md:-mx-6 md:px-6 lg:hidden">
        {alert ? <div className="mb-2">{alert}</div> : null}
        <div className="flex items-center gap-3">
          <span className="flex shrink-0 flex-col text-xs text-muted-foreground">
            {tc("total")}
            {quote ? (
              <Price value={quote.totalSdg} locale={locale} className="text-[17px] font-bold text-forest" />
            ) : null}
          </span>
          <div className="flex-1">{submitButton}</div>
        </div>
      </div>
    </form>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5 rounded-[14px] border border-line bg-card p-4 sm:p-5">
      <h2 className="flex items-center gap-2.5 text-[17px] font-bold">
        <span
          aria-hidden
          className="flex size-6 items-center justify-center rounded-full bg-forest text-xs text-ivory tabular-nums"
        >
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** الأصناف بصورها، ثم المجموع والتغليف والتوصيل، ثم الإجمالي. */
function SummaryBody({ quote, fulfillment }: { quote: Quote | null; fulfillment: "DELIVERY" | "PICKUP" }) {
  const t = useTranslations("checkout");
  const tc = useTranslations("cart");
  const locale = useLocale();
  if (!quote) return <p className="text-sm text-muted-foreground">{tc("loading")}</p>;
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {quote.lines.map((l) => (
          <li key={l.variantId} className="flex items-center gap-2.5">
            <span className="relative size-[52px] shrink-0 rounded-[10px] border border-line bg-muted">
              {l.imageUrl ? (
                <Image src={l.imageUrl} alt="" fill sizes="52px" className="rounded-[10px] object-cover" unoptimized />
              ) : (
                <Image src="/brand/mark-sage.svg" alt="" width={24} height={24} className="m-auto mt-3.5 opacity-40" />
              )}
              <span className="absolute -end-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-forest px-1 text-[11px] text-ivory tabular-nums">
                {l.qty}
              </span>
            </span>
            <span className="min-w-0 flex-1 text-[13px] font-semibold">
              {l.name}
              {l.option ? <span className="block font-normal text-muted-foreground">{l.option}</span> : null}
              {!l.available ? <span className="block font-normal text-destructive">{tc("unavailable")}</span> : null}
            </span>
            <Price value={l.lineTotalSdg} locale={locale} className="shrink-0 text-[13px] font-semibold" />
          </li>
        ))}
      </ul>
      <dl className="flex flex-col gap-2 border-t border-line pt-3 text-[13px]">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t("subtotal")}</dt>
          <dd>
            <Price value={quote.subtotalSdg} locale={locale} />
          </dd>
        </div>
        {quote.wrap ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">
              {t("wrapLine")}: {quote.wrap.name}
            </dt>
            <dd>
              <Price value={quote.wrap.priceSdg} locale={locale} />
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t("deliveryLine")}</dt>
          <dd>{fulfillment === "DELIVERY" ? t("deliveryPaid") : t("pickupLine")}</dd>
        </div>
      </dl>
      <p className="flex items-baseline justify-between border-t border-line pt-3 font-bold">
        <span>{tc("total")}</span>
        <Price value={quote.totalSdg} locale={locale} className="text-[22px]" />
      </p>
    </div>
  );
}
