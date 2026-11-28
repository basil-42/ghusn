"use client";

import { CARD_FROM_MAX, CARD_MESSAGE_MAX } from "@ghusn/core";
import { Check } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { CardFace } from "@/components/card-face";
import { Price } from "@/components/store/price";
import type { Quote } from "@/components/store/use-quote";
import { formatAmount } from "@/lib/format";
import type { StoreCardDesign, StoreWrapTier } from "@/lib/wrapping";

export type Tier = "REGULAR" | "PREMIUM";

export interface CardState {
  on: boolean;
  designId: string | null;
  message: string;
  from: string;
}

const option =
  "flex w-full cursor-pointer items-center gap-3 rounded-xl border border-line bg-card p-3 text-start has-checked:border-forest has-checked:shadow-[inset_0_0_0_1px_var(--color-forest)] has-focus-visible:outline-2 has-focus-visible:outline-sage has-disabled:cursor-not-allowed has-disabled:opacity-55";
const dot =
  "size-[18px] shrink-0 rounded-full border-[1.5px] border-input peer-checked:border-[5px] peer-checked:border-forest";

/**
 * التغليف والبطاقة (D-165): بدون/عادي/فاخر بسعر محسوب من قطع السلة (من الخادم) وتفصيله، ثم بطاقة
 * مجانية بمفتاح: الشكل والرسالة و«من» ومعاينة هي نفسها ما يُطبع.
 */
export function WrapCard({
  quote,
  tiers,
  designs,
  tier,
  onTier,
  card,
  onCard,
  locale,
  inputClass,
}: {
  quote: Quote | null;
  tiers: StoreWrapTier[];
  designs: StoreCardDesign[];
  tier: Tier | null;
  onTier: (t: Tier | null) => void;
  card: CardState;
  onCard: (c: CardState) => void;
  locale: string;
  inputClass: string;
}) {
  const t = useTranslations("checkout");
  const options = quote?.wrapOptions ?? [];
  // لا شيء يُغلّف في السلة (ورود فقط مثلاً) ← لا يظهر قسم التغليف
  const wrappable = options.some((o) => o.available);
  const selected = options.find((o) => o.tier === tier && o.available) ?? null;
  const design = designs.find((d) => d.id === card.designId) ?? null;
  const fmt = (v: string) => formatAmount(v, 0);

  return (
    <>
      {tiers.length > 0 && (wrappable || !quote) ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[13px] font-semibold">{t("wrapHow")}</legend>
          <label className={option}>
            <input
              type="radio"
              name="wrapTier"
              checked={!selected}
              onChange={() => onTier(null)}
              className="peer sr-only"
            />
            <span aria-hidden className={dot} />
            <span
              aria-hidden
              className="size-11 shrink-0 rounded-lg bg-muted bg-[repeating-linear-gradient(45deg,transparent_0_7px,var(--color-line)_7px_14px)]"
            />
            <span className="min-w-0 flex-1 leading-snug">
              <b className="block text-sm">{t("noWrap")}</b>
              <span className="text-xs text-muted-foreground">{t("noWrapHint")}</span>
            </span>
            <span className="shrink-0 text-sm font-bold">{t("wrapFree")}</span>
          </label>
          {tiers.map((m) => {
            const o = options.find((x) => x.tier === m.tier);
            const disabled = !!quote && !o?.available;
            return (
              <label key={m.tier} className={option}>
                <input
                  type="radio"
                  name="wrapTier"
                  checked={selected?.tier === m.tier}
                  disabled={disabled}
                  onChange={() => onTier(m.tier)}
                  className="peer sr-only"
                />
                <span aria-hidden className={dot} />
                <span className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-sage/30">
                  {m.imageUrl ? (
                    <Image src={m.imageUrl} alt="" fill sizes="88px" className="object-cover" unoptimized />
                  ) : (
                    <span
                      aria-hidden
                      className="absolute inset-0 bg-[url('/brand/pattern-sage.svg')] bg-[length:60px]"
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1 leading-snug">
                  <b className="block text-sm">{m.name}</b>
                  <span className="text-xs text-muted-foreground">
                    {disabled ? t("wrapUnavailable") : m.description}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums">
                  {o?.available ? <Price value={o.priceSdg} locale={locale} /> : quote ? "—" : "…"}
                </span>
              </label>
            );
          })}
          {selected ? (
            <p className="rounded-lg bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              {selected.parts.map((p) => `${p.name}${p.qty > 1 ? ` ×${p.qty}` : ""} ${fmt(p.priceSdg)}`).join(" + ")}
              {selected.skipped.length ? ` · ${t("wrapSkipped", { items: selected.skipped.join("، ") })}` : ""}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <button
        type="button"
        role="switch"
        aria-checked={card.on}
        onClick={() => onCard({ ...card, on: !card.on })}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-dashed border-sage px-3 py-2.5 text-start aria-checked:border-solid aria-checked:border-forest"
      >
        <span className="min-w-0 flex-1 leading-snug">
          <b className="block text-sm">{t("cardAdd")}</b>
          <span className="text-xs text-muted-foreground">{t("cardFree")}</span>
        </span>
        <span
          aria-hidden
          className={`relative h-6 w-[42px] shrink-0 rounded-full transition-colors after:absolute after:top-[3px] after:size-[18px] after:rounded-full after:bg-card after:transition-[inset-inline-start] ${card.on ? "bg-forest after:start-[21px]" : "bg-input after:start-[3px]"}`}
        />
      </button>

      {card.on ? (
        <div className="flex flex-col gap-3">
          {designs.length ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-[13px] font-semibold">{t("cardDesign")}</legend>
              <div className="-m-1 flex gap-2.5 overflow-x-auto p-1">
                {[null, ...designs].map((d) => (
                  <label
                    key={d?.id ?? "ghusn"}
                    className="relative w-[60px] shrink-0 cursor-pointer rounded-md has-checked:outline-2 has-checked:outline-offset-2 has-checked:outline-forest has-focus-visible:outline-2 has-focus-visible:outline-sage"
                  >
                    <input
                      type="radio"
                      name="cardDesign"
                      checked={card.designId === (d?.id ?? null)}
                      onChange={() => onCard({ ...card, designId: d?.id ?? null })}
                      className="peer sr-only"
                    />
                    <span className="sr-only">{d?.name ?? t("cardDesignDefault")}</span>
                    {d ? (
                      <span className="relative block aspect-[2/3] overflow-hidden rounded-md border border-line">
                        <Image src={d.imageUrl} alt="" fill sizes="120px" className="object-cover" unoptimized />
                      </span>
                    ) : (
                      <span className="relative block aspect-[2/3] overflow-hidden rounded-md border border-line bg-ivory">
                        {/* eslint-disable-next-line @next/next/no-img-element -- رمز الهوية كما هو */}
                        <img
                          src="/brand/mark-gold.svg"
                          alt=""
                          className="absolute left-1/2 top-2 w-4 -translate-x-1/2"
                        />
                      </span>
                    )}
                    <span
                      aria-hidden
                      className="absolute -end-1.5 -top-1.5 hidden size-5 items-center justify-center rounded-full bg-forest text-ivory peer-checked:flex"
                    >
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">{t("cardMessage")}</span>
            <textarea
              name="cardMessage"
              maxLength={CARD_MESSAGE_MAX}
              rows={3}
              value={card.message}
              onChange={(e) => onCard({ ...card, message: e.target.value })}
              placeholder={t("cardPlaceholder")}
              className={`${inputClass} h-auto py-2.5 leading-relaxed`}
            />
            <span dir="ltr" className="text-start text-xs text-muted-foreground tabular-nums rtl:text-end">
              {t("cardCount", { used: card.message.length, max: CARD_MESSAGE_MAX })}
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">{t("cardFrom")}</span>
            <input
              name="cardFrom"
              maxLength={CARD_FROM_MAX}
              value={card.from}
              onChange={(e) => onCard({ ...card, from: e.target.value })}
              placeholder={t("cardFromPlaceholder")}
              className={inputClass}
            />
          </label>
          <figure className="flex flex-col items-center gap-1.5 py-1">
            <CardFace
              message={card.message.trim() || t("cardPreviewEmpty")}
              from={card.from.trim() || null}
              design={design}
              className="w-[180px] rounded-md shadow-[0_6px_18px_color-mix(in_srgb,var(--color-forest)_18%,transparent)]"
            />
            <figcaption className="text-xs text-muted-foreground">{t("cardPreview")}</figcaption>
          </figure>
        </div>
      ) : null}
    </>
  );
}
