import type { Metadata } from "next";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
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
  // «العودة» تشير لبداية السطر: يمين في العربية، يسار في الإنجليزية
  const Back = locale === "ar" ? ArrowRight : ArrowLeft;
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-4 px-4 pt-6 pb-10 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold md:text-[26px]">{t("title")}</h1>
        <Link
          href="/cart"
          className="flex min-h-11 items-center gap-1 text-[13px] font-semibold text-warning hover:underline"
        >
          <Back aria-hidden className="size-3.5" /> {t("back")}
        </Link>
      </div>
      <CheckoutForm bankakEnabled={!!(await bankakAccount())} wrapStyles={await listStoreWrapStyles(locale)} />
    </div>
  );
}
