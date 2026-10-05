import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { CopyButton } from "@/components/store/copy-button";

/**
 * صفحة الشكر بعد الطلب (D-107): الختم الذهبي، اسم العميل، العبارة، رقم الطلب ورابط المتابعة للنسخ، وواتساب.
 * تظهر فوق صفحة المتابعة عند الوصول من إتمام الطلب فقط (?new=1) وما دام الطلب في أوله.
 */
export async function ThankYou({
  customerName,
  recipientName,
  number,
  trackUrl,
  awaitingPayment,
  whatsapp,
}: {
  customerName: string;
  recipientName: string | null;
  number: string;
  trackUrl: string;
  awaitingPayment: boolean;
  whatsapp: string | null;
}) {
  const t = await getTranslations("order");
  const th = await getTranslations("home");
  const firstName = customerName.trim().split(/\s+/)[0] ?? "";

  return (
    <section className="relative isolate flex flex-col items-center gap-4 overflow-hidden rounded-[18px] bg-forest px-5 pt-9 pb-7 text-center text-ivory motion-safe:animate-fade-up">
      <Image
        src="/brand/pattern-forest.svg"
        alt=""
        fill
        aria-hidden
        className="-z-10 object-cover opacity-25"
        unoptimized
      />
      {/* الختم: رمز غصن الذهبي في دائرة بإطار مزدوج */}
      <span
        aria-hidden
        className="flex size-24 items-center justify-center rounded-full border-2 border-gold p-1.5 shadow-[0_0_0_6px_rgb(176_141_87/0.18)]"
      >
        <span className="flex size-full items-center justify-center rounded-full border border-gold/60 bg-forest">
          <Image src="/brand/mark-gold.svg" alt="" width={46} height={46} unoptimized />
        </span>
      </span>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold text-balance md:text-4xl">
          {firstName ? t("thanksTitle", { name: firstName }) : t("thanksTitleNoName")}
        </h1>
        <p className="font-display text-lg text-sand">{th("tagline")}</p>
      </div>
      <p className="max-w-md text-[15px] leading-relaxed text-ivory/85">
        {awaitingPayment ? t("thanksPay") : recipientName ? t("thanksGift", { name: recipientName }) : t("thanksNew")}
      </p>

      <div className="flex w-full max-w-sm flex-col gap-2 rounded-xl bg-ivory/10 p-3 text-start">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-ivory/75">{t("thanksNumber")}</span>
          <span className="flex items-center gap-2">
            <bdi dir="ltr" className="font-bold tabular-nums">
              {number}
            </bdi>
            <span className="text-forest">
              <CopyButton value={number} label={t("thanksNumber")} />
            </span>
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-ivory/15 pt-2">
          <span className="text-sm text-ivory/75">{t("thanksLink")}</span>
          <span className="text-forest">
            <CopyButton value={trackUrl} label={t("thanksLink")} />
          </span>
        </div>
      </div>

      {whatsapp ? (
        <a
          href={whatsapp}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center rounded-xl bg-ivory px-5 text-sm font-bold text-forest hover:bg-sand"
        >
          {t("whatsapp")}
        </a>
      ) : null}
    </section>
  );
}
