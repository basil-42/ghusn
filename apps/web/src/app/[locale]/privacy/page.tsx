import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { getReceiptSettings } from "@/lib/settings";
import { alternates, whatsappLink } from "@/lib/site";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "privacy" });
  return { title: t("title"), description: t("description"), alternates: alternates(locale, "/privacy") };
}

/** تاريخ آخر تحديث للسياسة — يُغيَّر مع كل تعديل في نصها (messages: privacy.*). */
const UPDATED = "2026-11-28";

/**
 * سياسة الخصوصية (D-160): من البيانات التي يجمعها النظام فعلاً (الطلب، المستلم، إشعار بنكك، صورة الهدية،
 * ملاحظات الخدمة). مسودة اعتمدها باسل — ليست استشارة قانونية. الروابط داخل النص بخط تحتها (تُميَّز عن الكلام).
 */
export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("privacy");
  const tf = await getTranslations("footer");
  const receipt = await getReceiptSettings();
  const whatsapp = whatsappLink(receipt.whatsapp, tf("whatsappText"));
  const b = (chunks: ReactNode) => <b className="font-semibold text-foreground">{chunks}</b>;
  const date = new Intl.DateTimeFormat(locale === "ar" ? "ar-SD-u-nu-latn" : "en-GB", {
    dateStyle: "long",
    timeZone: "Africa/Khartoum",
  }).format(new Date(`${UPDATED}T12:00:00Z`));
  const sections: { title: string; body: ReactNode }[] = [
    {
      title: t("collectTitle"),
      body: (
        <ul className="flex list-disc flex-col gap-2 ps-5">
          {(["collect1", "collect2", "collect3", "collect4", "collect5"] as const).map((k) => (
            <li key={k}>{t.rich(k, { b })}</li>
          ))}
        </ul>
      ),
    },
    { title: t("useTitle"), body: <p>{t("use")}</p> },
    {
      title: t("shareTitle"),
      body: (
        <ul className="flex list-disc flex-col gap-2 ps-5">
          {(["share1", "share2", "share3"] as const).map((k) => (
            <li key={k}>{t.rich(k, { b })}</li>
          ))}
        </ul>
      ),
    },
    { title: t("browserTitle"), body: <p>{t("browser")}</p> },
    { title: t("keepTitle"), body: <p>{t("keep")}</p> },
    { title: t("rightsTitle"), body: <p>{t("rights")}</p> },
    { title: t("securityTitle"), body: <p>{t("security")}</p> },
    { title: t("changesTitle"), body: <p>{t("changes")}</p> },
    {
      title: t("contactTitle"),
      body: whatsapp ? (
        <p>
          {t.rich("contact", {
            link: (chunks) => (
              <a
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-forest underline underline-offset-4 hover:text-gold"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
      ) : (
        <p>{t("contactNoWa")}</p>
      ),
    },
  ];
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 md:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-4xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("updated", { date })}</p>
      </header>
      <p className="text-[17px] leading-loose">{t("intro")}</p>
      {sections.map((s) => (
        <section key={s.title} className="flex flex-col gap-2 leading-loose text-foreground/90">
          <h2 className="text-lg font-bold text-foreground">{s.title}</h2>
          {s.body}
        </section>
      ))}
    </article>
  );
}
