import { formatAmount } from "@/lib/format";

/** سعر بالجنيه كما في CLAUDE.md: «185,000 ج.س» بالعربي، «SDG 185,000» بالإنجليزي، أرقام لاتينية. */
export function Price({ value, locale, className }: { value: string; locale: string; className?: string }) {
  const amount = formatAmount(value, 0);
  return (
    <bdi dir={locale === "ar" ? "rtl" : "ltr"} className={`tabular-nums ${className ?? ""}`}>
      {locale === "ar" ? `${amount} ج.س` : `SDG ${amount}`}
    </bdi>
  );
}
