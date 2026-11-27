import { ArrowLeft, ArrowRight } from "lucide-react";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getReceiptSettings } from "@/lib/settings";
import { whatsappLink } from "@/lib/site";

/** رأس إتمام الطلب (D-159): «العودة للسلة» والشعار فقط. */
export async function CheckoutHeader() {
  const locale = await getLocale();
  const t = await getTranslations();
  const Back = locale === "ar" ? ArrowRight : ArrowLeft;
  const logo =
    locale === "ar"
      ? { src: "/brand/logo-ar-mark-forest.svg", width: 62 }
      : { src: "/brand/logo-en-mark-forest.svg", width: 86 };
  return (
    <header className="border-b border-line bg-card">
      <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between px-4 md:px-6">
        <Link
          href="/cart"
          className="-ms-2 flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold transition-colors hover:bg-muted active:bg-muted"
        >
          <Back aria-hidden className="size-4" /> {t("checkout.back")}
        </Link>
        <Image src={logo.src} alt={locale === "ar" ? "غصن" : "GHUSN"} width={logo.width} height={32} priority />
      </div>
    </header>
  );
}

/** تذييل إتمام الطلب (D-159): سطر مساعدة واحد بدل التذييل الكامل. */
export async function CheckoutFooter() {
  const t = await getTranslations();
  const receipt = await getReceiptSettings();
  const whatsapp = whatsappLink(receipt.whatsapp, t("footer.whatsappText"));
  const link = "inline-flex min-h-11 items-center font-semibold text-foreground hover:underline";
  return (
    <footer className="mt-6 border-t border-line px-4 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] text-center text-[13px] text-muted-foreground">
      <p className="flex flex-wrap items-center justify-center gap-x-2">
        <span>{t("checkout.needHelp")}</span>
        {whatsapp ? (
          <>
            <a href={whatsapp} target="_blank" rel="noreferrer" className={link}>
              {t("checkout.whatsapp")}
            </a>
            <span aria-hidden>·</span>
          </>
        ) : null}
        <Link href="/track" className={link}>
          {t("footer.track")}
        </Link>
      </p>
      <p>{t("footer.rights", { year: new Date().getFullYear() })}</p>
    </footer>
  );
}
