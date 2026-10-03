import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TrackForm } from "./track-form";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "track" });
  return { title: t("title"), robots: { index: false } };
}

/** «تتبّع طلبك» (D-93): لمن فقد رابط المتابعة. */
export default async function TrackPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("track");
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-10">
      <h1 className="font-display text-4xl font-bold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("intro")}</p>
      <TrackForm />
    </div>
  );
}
