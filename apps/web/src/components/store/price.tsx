import { formatAmount } from "@/lib/format";

/**
 * سعر بالجنيه كما في CLAUDE.md: «185,000 ج.س» بالعربي، «SDG 185,000» بالإنجليزي، أرقام لاتينية.
 * `unitClassName` يصغّر العملة (بطاقات المتجر الضيقة، D-157)؛ بدونه نص واحد كما كان.
 */
export function Price({
  value,
  locale,
  className,
  unitClassName,
}: {
  value: string;
  locale: string;
  className?: string;
  unitClassName?: string;
}) {
  const amount = formatAmount(value, 0);
  const ar = locale === "ar";
  return (
    <bdi dir={ar ? "rtl" : "ltr"} className={`tabular-nums ${className ?? ""}`}>
      {unitClassName ? (
        ar ? (
          <>
            {amount} <span className={unitClassName}>ج.س</span>
          </>
        ) : (
          <>
            <span className={unitClassName}>SDG</span> {amount}
          </>
        )
      ) : ar ? (
        `${amount} ج.س`
      ) : (
        `SDG ${amount}`
      )}
    </bdi>
  );
}
