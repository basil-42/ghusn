import Image from "next/image";

export type CardTextColor = "FOREST" | "IVORY" | "GOLD";

const TEXT: Record<CardTextColor, string> = { FOREST: "text-forest", IVORY: "text-ivory", GOLD: "text-gold" };

/**
 * وجه بطاقة الإهداء (D-165) — نفس المكوّن للمعاينة في إتمام الطلب وللطباعة (10×15 سم)، فما يراه العميل
 * هو ما يُطبع. المقاسات بوحدات الحاوية (cqi) فتتناسب مع أي عرض. بلا شكل = قالب غصن (عاجي، الرمز
 * الذهبي، والعبارة في الأسفل)؛ مع شكل: خلفية المصمم ولون النص المختار.
 */
export function CardFace({
  message,
  from,
  design,
  className = "",
}: {
  message: string;
  from: string | null;
  design: { imageUrl: string; textColor: CardTextColor } | null;
  className?: string;
}) {
  const rtl = /[؀-ۿ]/.test(message);
  return (
    <div
      className={`@container relative aspect-[2/3] overflow-hidden ${design ? "" : "bg-ivory"} ${TEXT[design?.textColor ?? "FOREST"]} ${className}`}
    >
      {design ? (
        <Image src={design.imageUrl} alt="" fill sizes="400px" className="object-cover" unoptimized />
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- رمز الهوية كما هو */}
          <img src="/brand/mark-gold.svg" alt="" className="absolute left-1/2 top-[9cqi] w-[17cqi] -translate-x-1/2" />
          <p className="absolute inset-x-0 bottom-[8cqi] text-center font-[family-name:var(--font-amiri)] text-[5cqi] text-gold">
            هدايا تُصنع لتُذكر
          </p>
        </>
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-[12cqi] py-[30cqi] text-center font-[family-name:var(--font-amiri)]">
        <p dir={rtl ? "rtl" : "ltr"} className="whitespace-pre-line break-words text-[6.4cqi] leading-[1.7]">
          {message}
        </p>
        {from ? (
          <p dir="auto" className="mt-[4cqi] text-[5cqi] opacity-85">
            — {from}
          </p>
        ) : null}
      </div>
    </div>
  );
}
