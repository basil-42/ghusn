import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getReceiptSettings } from "@/lib/settings";
import { whatsappLink } from "@/lib/site";
import { listStoreCategories, listStoreOccasions } from "@/lib/storefront";

const linkClass = "inline-flex min-h-10 items-center text-ivory/85 hover:text-ivory hover:underline";

/**
 * التذييل (D-95): أربعة أعمدة — الشعار الكامل (≥ 220px — brand-identity §1) والعبارة، الأقسام،
 * المناسبات، والمساعدة (التتبّع، واتساب، التوصيل والدفع) — ثم سطر الحقوق.
 */
export async function StoreFooter() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations();
  const [categories, occasions, receipt] = await Promise.all([
    listStoreCategories(locale),
    listStoreOccasions(locale),
    getReceiptSettings(),
  ]);
  const whatsapp = whatsappLink(receipt.whatsapp, t("footer.whatsappText"));
  return (
    <footer className="mt-16 bg-forest text-ivory">
      <div className="mx-auto grid max-w-[1240px] grid-cols-2 gap-x-6 gap-y-10 px-4 md:px-6 py-12 lg:grid-cols-[1.4fr_1fr_1fr_1.4fr]">
        <div className="col-span-2 flex flex-col gap-3 lg:col-span-1">
          <Image src="/brand/logo-horizontal-cream.svg" alt="غصن GHUSN" width={220} height={112} />
          <p className="font-display text-xl">{t("home.tagline")}</p>
        </div>
        {categories.length ? (
          <nav aria-label={t("footer.categories")}>
            <p className="mb-2 font-semibold">{t("footer.categories")}</p>
            <ul>
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link href={`/c/${c.slug}`} className={linkClass}>
                    {c.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/products" className={linkClass}>
                  {t("home.allProducts")}
                </Link>
              </li>
            </ul>
          </nav>
        ) : null}
        {occasions.length ? (
          <nav aria-label={t("footer.occasions")}>
            <p className="mb-2 font-semibold">{t("footer.occasions")}</p>
            <ul>
              {occasions.map((o) => (
                <li key={o.slug}>
                  <Link href={`/occasion/${o.slug}`} className={linkClass}>
                    {o.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        <div className="col-span-2 lg:col-span-1">
          <p className="mb-2 font-semibold">{t("footer.help")}</p>
          <ul>
            <li>
              <Link href="/track" className={linkClass}>
                {t("footer.track")}
              </Link>
            </li>
            {whatsapp ? (
              <li>
                <a href={whatsapp} target="_blank" rel="noreferrer" className={linkClass}>
                  {t("footer.whatsapp")}
                </a>
              </li>
            ) : null}
          </ul>
          <p className="mt-3 text-sm text-ivory/70">{t("footer.deliveryInfo")}</p>
          <p className="mt-1 text-sm text-ivory/70">{t("footer.paymentInfo")}</p>
        </div>
      </div>
      <p className="border-t border-ivory/15 px-4 py-4 text-center text-sm text-ivory/75">
        {t("footer.rights", { year: new Date().getFullYear() })}
      </p>
    </footer>
  );
}
