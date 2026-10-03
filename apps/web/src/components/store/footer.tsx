import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getReceiptSettings } from "@/lib/settings";
import { whatsappLink } from "@/lib/site";
import { listStoreCategories } from "@/lib/storefront";

/** التذييل: الشعار الكامل (≥ 220px — brand-identity §1) على أخضر الغابة، والأقسام والعبارة. */
export async function StoreFooter() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations();
  const [categories, receipt] = await Promise.all([listStoreCategories(locale), getReceiptSettings()]);
  const whatsapp = whatsappLink(receipt.whatsapp, t("footer.whatsappText"));
  return (
    <footer className="mt-16 bg-forest text-ivory">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Image src="/brand/logo-horizontal-cream.svg" alt="غصن GHUSN" width={240} height={122} />
          <p className="font-display text-xl">{t("home.tagline")}</p>
          <ul className="flex flex-wrap gap-x-4">
            <li>
              <Link href="/track" className="inline-flex min-h-11 items-center hover:underline">
                {t("footer.track")}
              </Link>
            </li>
            {whatsapp ? (
              <li>
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center hover:underline"
                >
                  {t("footer.whatsapp")}
                </a>
              </li>
            ) : null}
          </ul>
        </div>
        {categories.length ? (
          <nav aria-label={t("footer.categories")}>
            <p className="mb-2 font-semibold">{t("footer.categories")}</p>
            <ul className="grid grid-cols-2 gap-1">
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link href={`/c/${c.slug}`} className="inline-flex min-h-11 items-center hover:underline">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </div>
      <p className="border-t border-ivory/15 px-4 py-4 text-center text-sm text-ivory/80">
        {t("footer.rights", { year: new Date().getFullYear() })}
      </p>
    </footer>
  );
}
