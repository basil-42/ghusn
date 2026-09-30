import { dec } from "@ghusn/core";
import { Badge } from "@/components/ui/badge";
import { formatAmount } from "@/lib/format";

/** الرصيد بصيغة يفهمها الجميع: «علينا» / «لنا» / «مسدَّد». */
export function BalanceBadge({ balance, symbol, decimals }: { balance: string; symbol: string; decimals: number }) {
  const d = dec(balance);
  if (d.isZero()) return <Badge variant="success">مسدَّد</Badge>;
  const text = `${formatAmount(balance.replace("-", ""), decimals)} ${symbol}`;
  return d.gt(0) ? (
    <Badge variant="warning">
      علينا <bdi dir="ltr">{text}</bdi>
    </Badge>
  ) : (
    <Badge>
      لنا <bdi dir="ltr">{text}</bdi>
    </Badge>
  );
}
