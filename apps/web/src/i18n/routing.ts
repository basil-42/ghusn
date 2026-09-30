import { defineRouting } from "next-intl/routing";

/**
 * المتجر بلغتين (CLAUDE.md §3): العربية افتراضية بلا بادئة (/ ، /c/…)، والإنجليزية تحت /en.
 * لا تحويل تلقائي حسب لغة المتصفح — المتجر عربي أولاً، وزر اللغة في الرأس.
 */
export const routing = defineRouting({
  locales: ["ar", "en"],
  defaultLocale: "ar",
  localePrefix: "as-needed",
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
