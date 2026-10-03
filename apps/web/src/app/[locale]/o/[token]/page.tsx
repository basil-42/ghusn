import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Price } from "@/components/store/price";
import { Link } from "@/i18n/navigation";
import { formatDateTime } from "@/lib/format";
import { approveOverduePhotos, expireUnpaidOrders, getOrderByToken } from "@/lib/orders";
import { bankakAccount, getReceiptSettings } from "@/lib/settings";
import { whatsappLink } from "@/lib/site";
import { PaymentProofForm } from "./payment-proof-form";
import { PhotoDecision } from "./photo-decision";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string; token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, token } = await params;
  const o = await getOrderByToken(token, locale);
  const t = await getTranslations({ locale, namespace: "order" });
  // رابط خاص بالعميل: لا يُفهرس ولا يُرسل في Referer
  return {
    title: o ? t("title", { number: o.number }) : undefined,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

const STEPS = ["NEW", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"] as const;

/** متابعة الطلب برابطه السرّي (ضيف — D-88). */
export default async function OrderStatusPage({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  let o = await getOrderByToken(token, locale);
  if (!o) notFound();
  if (o.status === "AWAITING_PAYMENT" && o.paymentDueAt && o.paymentDueAt <= new Date()) {
    await expireUnpaidOrders();
    o = (await getOrderByToken(token, locale)) ?? o;
  }
  if (o.status === "AWAITING_PHOTO_APPROVAL" && o.photoDueAt && o.photoDueAt <= new Date()) {
    await approveOverduePhotos();
    o = (await getOrderByToken(token, locale)) ?? o;
  }
  const account = o.status === "AWAITING_PAYMENT" ? await bankakAccount() : null;
  const t = await getTranslations("order");
  const contact = whatsappLink((await getReceiptSettings()).whatsapp, t("whatsappText", { number: o.number }));
  const tc = await getTranslations("checkout");
  const steps = STEPS.filter((s) => o.fulfillment === "DELIVERY" || s !== "OUT_FOR_DELIVERY");
  const reached = o.status === "CANCELLED" ? -1 : steps.findIndex((s) => s === o.status);
  const current = reached >= 0 ? reached : o.status === "AWAITING_PHOTO_APPROVAL" ? steps.indexOf("PREPARING") : 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-4xl font-bold">
          {t("title", { number: "" })}
          <bdi dir="ltr">{o.number}</bdi>
        </h1>
        {o.status === "NEW" ? <p className="text-lg">{t("thanks")}</p> : null}
        <p className="text-sm text-muted-foreground">
          {formatDateTime(o.createdAt)} · {t("save")}
        </p>
      </header>

      <section className="rounded-2xl border border-line bg-card p-4">
        <h2 className="mb-3 font-semibold">{t("status")}</h2>
        <p className={`mb-4 text-xl font-bold ${o.status === "CANCELLED" ? "text-destructive" : ""}`}>
          {t(`statuses.${o.status}`)}
        </p>
        {o.unpaidExpired ? <p className="mb-2 text-sm">{t("unpaidExpired")}</p> : null}
        {o.status === "PAYMENT_REVIEW" ? <p className="mb-4 text-sm">{t("reviewing")}</p> : null}
        {o.status !== "CANCELLED" ? (
          <ol className="flex gap-1" aria-hidden>
            {steps.map((s, i) => (
              <li key={s} className={`h-2 flex-1 rounded-full ${i <= current ? "bg-sage" : "bg-muted"}`} />
            ))}
          </ol>
        ) : null}
        {/* الخط الزمني (D-93): كل مرحلة ووقتها، الأحدث في الأسفل */}
        <ol className="mt-5 flex flex-col gap-3 border-s-2 border-line ps-4">
          {o.timeline.map((h, i) => (
            <li key={h.id} className="relative">
              <span
                aria-hidden
                className={`absolute -start-[1.4rem] top-1.5 size-3 rounded-full ${
                  i === o.timeline.length - 1 ? (o.status === "CANCELLED" ? "bg-danger" : "bg-forest") : "bg-sage"
                }`}
              />
              <span className="block font-semibold">{t(`statuses.${h.status}`)}</span>
              <span className="text-sm text-muted-foreground">{formatDateTime(h.at)}</span>
            </li>
          ))}
        </ol>
        {contact ? (
          <a
            href={contact}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-forest px-4 font-semibold text-forest hover:bg-muted"
          >
            {t("whatsapp")}
          </a>
        ) : null}
      </section>

      {o.status === "AWAITING_PAYMENT" ? (
        <section className="flex flex-col gap-4 rounded-2xl border-2 border-gold bg-card p-4">
          <h2 className="font-display text-2xl font-bold">{t("payTitle")}</h2>
          {o.proofRejection !== null ? (
            <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">
              {t("proofRejected", { reason: o.proofRejection })}
            </p>
          ) : null}
          <p className="text-sm">{t("payIntro")}</p>
          {account ? (
            <dl className="grid gap-2 rounded-xl bg-muted p-3 sm:grid-cols-3">
              {account.name ? (
                <div>
                  <dt className="text-xs text-muted-foreground">{t("accountName")}</dt>
                  <dd className="font-semibold">{account.name}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-muted-foreground">{t("accountNumber")}</dt>
                <dd dir="ltr" className="select-all text-start text-lg font-bold tabular-nums">
                  {account.number}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("amount")}</dt>
                <dd className="text-lg font-bold">
                  <Price value={o.totalSdg} locale={locale} />
                </dd>
              </div>
            </dl>
          ) : null}
          {account?.note ? <p className="text-sm text-muted-foreground">{account.note}</p> : null}
          {o.paymentDueAt ? (
            <p className="text-sm font-semibold">{t("dueBy", { time: formatDateTime(o.paymentDueAt) })}</p>
          ) : null}
          <PaymentProofForm token={token} />
        </section>
      ) : null}

      {o.photo && o.status !== "CANCELLED" ? (
        <section
          className={`flex flex-col gap-4 rounded-2xl bg-card p-4 ${o.photo.pending ? "border-2 border-gold" : "border border-line"}`}
        >
          <h2 className="font-display text-2xl font-bold">{t("photoTitle")}</h2>
          {/* eslint-disable-next-line @next/next/no-img-element -- صورة خاصة برابط الطلب */}
          <img
            src={`/api/v1/gift-photo/${token}/${o.photo.id}`}
            alt={t("photoTitle")}
            className="max-h-[28rem] w-full rounded-xl object-contain"
          />
          {o.photo.pending ? (
            <>
              <p className="text-sm">{t("photoIntro")}</p>
              {o.photoDueAt ? (
                <p className="text-sm font-semibold">{t("photoDue", { time: formatDateTime(o.photoDueAt) })}</p>
              ) : null}
              <PhotoDecision token={token} photoId={o.photo.id} />
            </>
          ) : null}
        </section>
      ) : null}

      <section className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-4">
        <h2 className="font-semibold">{t("items")}</h2>
        <ul className="flex flex-col gap-2">
          {o.lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-2">
              <span>
                {l.name}
                {l.option ? ` · ${l.option}` : ""} <bdi dir="ltr">× {l.qty}</bdi>
              </span>
              <Price value={l.lineTotalSdg} locale={locale} className="shrink-0" />
            </li>
          ))}
        </ul>
        {o.wrap ? (
          <p className="flex justify-between gap-2">
            <span>
              {t("wrap")}: {o.wrap.name}
            </span>
            <Price value={o.wrap.priceSdg} locale={locale} className="shrink-0" />
          </p>
        ) : null}
        {o.cardMessage ? (
          <p className="whitespace-pre-line rounded-xl bg-muted p-3 font-display text-lg">
            <span className="block text-xs text-muted-foreground">{t("card")}</span>
            {o.cardMessage}
          </p>
        ) : null}
        <p className="flex justify-between border-t border-line pt-2 text-lg font-bold">
          <span>{t("total")}</span>
          <Price value={o.totalSdg} locale={locale} />
        </p>
        <p className="text-sm text-muted-foreground">
          {o.paymentMethod === "COD" ? t("payCod") : o.paymentMethod === "BANKAK" ? t("payBankak") : t("payShop")}
        </p>
      </section>

      <section className="rounded-2xl border border-line bg-card p-4 text-sm">
        {o.fulfillment === "DELIVERY" ? (
          <p>
            <span className="font-semibold">{t("deliveryTo")}: </span>
            {o.recipientName ? `${o.recipientName} — ` : ""}
            {o.city ? tc(`cities.${o.city}`) : ""}
            {o.address ? `، ${o.address}` : ""}
          </p>
        ) : (
          <p className="font-semibold">{t("pickup")}</p>
        )}
      </section>

      <Link href="/" className="self-start rounded-xl border border-line px-5 py-3 font-semibold hover:bg-muted">
        {t("continue")}
      </Link>
    </div>
  );
}
