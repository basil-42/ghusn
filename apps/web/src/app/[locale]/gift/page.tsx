import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Price } from "@/components/store/price";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { alternates } from "@/lib/site";
import { listStoreWrapStyles } from "@/lib/wrapping";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "gift" });
  return { title: t("title"), description: t("intro"), alternates: alternates(locale, "/gift") };
}

export const dynamic = "force-dynamic";

/** «صمّم هديتك» (D-91، D-96): أنماط التغليف المفعّلة بأسعارها وخطوات الطلب. التخصيص نفسه عند إتمام الطلب. */
export default async function GiftPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations("gift");
  const styles = await listStoreWrapStyles(locale);
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;
  const steps = [t("step1"), t("step2"), t("step3")];
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10">
      <header className="flex max-w-2xl flex-col gap-2">
        <h1 className="font-display text-4xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </header>
      <ol className="grid gap-3 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s} className="flex items-start gap-3 rounded-xl border border-line bg-card p-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-forest text-sm font-bold text-ivory tabular-nums">
              {i + 1}
            </span>
            <span className="text-sm leading-relaxed">{s}</span>
          </li>
        ))}
      </ol>
      {styles.length ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-[22px] font-bold">{t("styles")}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {styles.map((w) => (
              <li key={w.id} className="flex flex-col gap-1 rounded-xl border border-line bg-card p-5">
                <b className="font-display text-2xl">{w.name}</b>
                {w.description ? <span className="text-sm text-muted-foreground">{w.description}</span> : null}
                <span className="mt-2 font-bold">
                  <Price value={w.priceSdg} locale={locale} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <Link
        href="/products"
        className="inline-flex min-h-12 items-center gap-2 self-start rounded-[10px] bg-primary px-6 font-bold text-primary-foreground hover:bg-primary/90"
      >
        {t("cta")} <Arrow aria-hidden className="size-4" />
      </Link>
    </div>
  );
}
