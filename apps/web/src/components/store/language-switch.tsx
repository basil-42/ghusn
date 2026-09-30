"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";

/** زر تبديل اللغة (brand-identity §7: `EN` / `ع`) — نفس الصفحة باللغة الأخرى. */
export function LanguageSwitch() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const query = Object.fromEntries(useSearchParams());
  return (
    <Link
      href={{ pathname, query }}
      locale={locale === "ar" ? "en" : "ar"}
      aria-label={t("switchLanguage")}
      className="flex size-11 items-center justify-center rounded-full border border-line font-semibold hover:bg-muted"
    >
      {t("switchLanguageShort")}
    </Link>
  );
}
