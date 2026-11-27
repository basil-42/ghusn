import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { bankakAccount } from "@/lib/settings";
import { listStoreWrapStyles } from "@/lib/wrapping";
import { CheckoutForm } from "./checkout-form";

// خيار بنكك يتبع الضبط الحالي (رقم الحساب) — لا يُبنى مسبقاً
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout" });
  return { title: t("title"), robots: { index: false } };
}

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("checkout");
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-4 px-4 pt-6 pb-10 md:px-6">
      {/* «العودة للسلة» في رأس الصفحة المختصر (D-159) */}
      <h1 className="text-2xl font-bold md:text-[26px]">{t("title")}</h1>
      <CheckoutForm bankakEnabled={!!(await bankakAccount())} wrapStyles={await listStoreWrapStyles(locale)} />
    </div>
  );
}
