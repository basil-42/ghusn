import { dec } from "@ghusn/core";
import { formatMonthKey } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TrendBar {
  month: string;
  value: string;
  /** الشهر الجاري (جزئي) يظهر بلون أفتح */
  partial: boolean;
}

const W = 720;
const H = 240;
const TOP = 24;
const BOTTOM = 34;

/**
 * أعمدة الأشهر (D-127): SVG من الخادم بلا مكتبة رسوم. القيم السالبة (خسارة) تنزل تحت خط الصفر بلون
 * التحذير، والشهر الجاري الجزئي بلون أفتح.
 */
export function TrendChart({ bars, format }: { bars: TrendBar[]; format: (v: string) => string }) {
  if (bars.length === 0) return null;
  const values = bars.map((b) => Number(dec(b.value).toFixed(4)));
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const plot = H - TOP - BOTTOM;
  const y = (v: number) => TOP + ((max - v) / span) * plot;
  const zero = y(0);
  const slot = W / bars.length;
  const barW = Math.min(40, slot * 0.6);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="رسم الأشهر" className="h-auto w-full">
      <line x1={0} x2={W} y1={zero} y2={zero} className="stroke-border" strokeWidth={1} />
      {bars.map((b, i) => {
        const v = values[i] ?? 0;
        // من اليمين لليسار: الأقدم يميناً كقراءة العربية
        const cx = W - slot * (i + 0.5);
        const top = Math.min(y(v), zero);
        const height = Math.max(Math.abs(y(v) - zero), v === 0 ? 0 : 2);
        return (
          <g key={b.month}>
            <title>{`${formatMonthKey(b.month)}: ${format(b.value)}`}</title>
            <rect
              x={cx - barW / 2}
              y={top}
              width={barW}
              height={height}
              rx={4}
              className={cn(v < 0 ? "fill-danger" : "fill-sage", b.partial && "opacity-45")}
            />
            <text
              x={cx}
              y={v < 0 ? top + height + 13 : top - 6}
              textAnchor="middle"
              className="fill-foreground text-[10px] font-semibold tabular-nums"
            >
              {/* علامة اتجاه LTR حتى تظهر «-1,547» لا «1,547-» داخل صفحة RTL */}
              {`\u200E${format(b.value)}`}
            </text>
            <text x={cx} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">
              {formatMonthKey(b.month).split(" ")[0]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
