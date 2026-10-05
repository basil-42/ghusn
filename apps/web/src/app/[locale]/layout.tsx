import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Analytics } from "@/components/store/analytics";
import { StoreFooter } from "@/components/store/footer";
import { StoreHeader } from "@/components/store/header";
import { routing } from "@/i18n/routing";
import { fontVariables } from "@/lib/fonts";
import { analyticsConfig } from "@/lib/analytics";
import { alternates, siteUrl } from "@/lib/site";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    title: { default: t("title"), template: locale === "ar" ? "%s | غصن" : "%s | GHUSN" },
    description: t("description"),
    metadataBase: new URL(siteUrl()),
    alternates: alternates(locale, "/"),
    openGraph: {
      siteName: locale === "ar" ? "غصن" : "GHUSN",
      locale: locale === "ar" ? "ar_SD" : "en_US",
      type: "website",
      images: ["/og-default.png"],
    },
  };
}

/** قالب المتجر: الاتجاه والخطوط حسب اللغة (عربي RTL افتراضياً، إنجليزي LTR). */
export default async function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  // القياس في المتجر فقط — لا في لوحة التحكم ولا نقطة البيع (D-108)
  const analytics = analyticsConfig();
  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} className={fontVariables}>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <NextIntlClientProvider>
          <StoreHeader />
          <main className="flex-1">{children}</main>
          <StoreFooter />
        </NextIntlClientProvider>
        {analytics ? <Analytics src={analytics.src} websiteId={analytics.websiteId} /> : null}
      </body>
    </html>
  );
}
