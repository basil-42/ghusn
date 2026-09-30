import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Price } from "@/components/store/price";
import { Link } from "@/i18n/navigation";
import { formatDateTime } from "@/lib/format";
import { getOrderByToken } from "@/lib/orders";

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
  const o = await getOrderByToken(token, locale);
  if (!o) notFound();
  const t = await getTranslations("order");
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
        {o.status !== "CANCELLED" ? (
          <ol className="flex gap-1" aria-hidden>
            {steps.map((s, i) => (
              <li key={s} className={`h-2 flex-1 rounded-full ${i <= current ? "bg-sage" : "bg-muted"}`} />
            ))}
          </ol>
        ) : null}
      </section>

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
        <p className="flex justify-between border-t border-line pt-2 text-lg font-bold">
          <span>{t("total")}</span>
          <Price value={o.totalSdg} locale={locale} />
        </p>
        <p className="text-sm text-muted-foreground">{o.paymentMethod === "COD" ? t("payCod") : t("payShop")}</p>
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
