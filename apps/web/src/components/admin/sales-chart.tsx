"use client";

import { useState } from "react";

export interface ChartPoint {
  key: string;
  /** اسم العمود كاملاً للتلميح والجدول (الثلاثاء 13 أكتوبر، أكتوبر 2026). */
  label: string;
  /** اسم تحت المحور بسطرين (13 / أكتوبر)، أو "" لإخفائه (لا يتسع لكل الأعمدة). */
  tick: string;
  tickSub: string;
  shop: string;
  store: string;
  total: string;
  /** القيمة مختصرة فوق العمود (1.5م، 750 ألف). */
  short: string;
  /** القيمة كنسبة من أعلى خط في المحور (0–1) — محسوبة في الخادم. */
  ratio: number;
  /** اليوم/الشهر الحالي يُبرز بلون الغابة. */
  current: boolean;
  /** في الرسم المكدّس: حصة الجزء الأول (السفلي) من العمود (0–1). */
  split?: number;
}

const H = 200;
const W = 600;

/**
 * رسم المبيعات (D-134): عمود لكل يوم (أو شهر في السنة) بالمريمية، والجاري بلون الغابة، بلا مقارنة —
 * النمو في البطاقات فوقه. خطوط المحور بأرقام مختصرة، والقيمة فوق العمود حين تكون الأعمدة قليلة.
 * التفصيل (المحل/المتجر) في التلميح والجدول. الزمن من اليمين لليسار (واجهة عربية).
 */
export function SalesChart({
  points,
  gridlines,
  ariaLabel,
  parts = ["المحل", "المتجر"],
  stacked = false,
}: {
  points: ChartPoint[];
  /** خطوط المحور: موضعها (0–1) واسمها المختصر. */
  gridlines: { ratio: number; label: string }[];
  ariaLabel: string;
  /** اسما الجزأين (shop/store) في التلميح والجدول — المنصرفات: التشغيل/المشتريات (D-137). */
  parts?: [string, string];
  /** عمود مكدّس: الجزء الأول بلون الغابة أسفل، والثاني رملي فوقه، مع مفتاح ألوان. */
  stacked?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  const step = W / n;
  const barW = Math.min(step * 0.62, 56);
  const showValues = n <= 12;
  const pos = (i: number) => ((n - 1 - i + 0.5) / n) * 100; // مركز العمود % من اليسار
  const active = hover === null ? null : points[hover];

  return (
    <div className="flex flex-col gap-2">
      <div className="relative ps-12">
        {/* أرقام المحور: HTML فوق الرسم فلا تتمطط مع preserveAspectRatio */}
        {gridlines.map((g) => (
          <span
            key={g.ratio}
            className="pointer-events-none absolute start-0 w-11 -translate-y-1/2 text-xs text-muted-foreground tabular-nums"
            style={{ top: `${(1 - g.ratio) * 100}%` }}
          >
            {g.label}
          </span>
        ))}
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-56 w-full overflow-visible"
            preserveAspectRatio="none"
            role="img"
            aria-label={ariaLabel}
            onMouseLeave={() => setHover(null)}
          >
            {gridlines.map((g) => (
              <line
                key={g.ratio}
                x1="0"
                x2={W}
                y1={H - g.ratio * H}
                y2={H - g.ratio * H}
                className="stroke-line"
                strokeDasharray={g.ratio === 0 ? undefined : "4 4"}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {points.map((p, i) => {
              const h = p.ratio > 0 ? Math.max(p.ratio * H, 3) : 0;
              const x = (n - 1 - i) * step;
              return (
                <g key={p.key}>
                  {h > 0 && stacked ? (
                    <g opacity={hover === null || hover === i ? 1 : 0.55}>
                      <rect
                        x={x + (step - barW) / 2}
                        y={H - h}
                        width={barW}
                        height={h}
                        rx={Math.min(5, barW / 3)}
                        className="fill-sand"
                      />
                      {(p.split ?? 0) > 0 ? (
                        <rect
                          x={x + (step - barW) / 2}
                          y={H - h * (p.split ?? 0)}
                          width={barW}
                          height={h * (p.split ?? 0)}
                          rx={(p.split ?? 0) === 1 ? Math.min(5, barW / 3) : 0}
                          className="fill-forest"
                        />
                      ) : null}
                    </g>
                  ) : h > 0 ? (
                    <rect
                      x={x + (step - barW) / 2}
                      y={H - h}
                      width={barW}
                      height={h}
                      rx={Math.min(5, barW / 3)}
                      className={p.current || hover === i ? "fill-forest" : "fill-sage"}
                    />
                  ) : null}
                  {/* منطقة لمس أكبر من العمود */}
                  <rect
                    x={x}
                    y={0}
                    width={step}
                    height={H}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onTouchStart={() => setHover(i)}
                  />
                </g>
              );
            })}
          </svg>
          {showValues
            ? points.map((p, i) =>
                p.ratio > 0 ? (
                  <span
                    key={p.key}
                    className={`pointer-events-none absolute -translate-x-1/2 text-xs font-semibold whitespace-nowrap tabular-nums ${
                      p.current ? "text-forest" : "text-muted-foreground"
                    }`}
                    style={{ left: `${pos(i)}%`, bottom: `calc(${p.ratio * 100}% + 4px)` }}
                  >
                    {p.short}
                  </span>
                ) : null,
              )
            : null}
          {active && hover !== null ? (
            <div
              className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 rounded-lg bg-forest px-3 py-2 text-xs text-ivory shadow-md"
              style={{ left: `${Math.min(Math.max(pos(hover), 15), 85)}%` }}
            >
              <p className="font-semibold">{active.label}</p>
              <p className="text-sm font-bold tabular-nums">{active.total} ج.س</p>
              <p className="tabular-nums opacity-80">
                {parts[0]} {active.shop} · {parts[1]} {active.store}
              </p>
            </div>
          ) : null}
        </div>
      </div>
      <div
        aria-hidden
        className="ms-12 grid text-center text-xs text-muted-foreground tabular-nums"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {points.map((p) => (
          <span
            key={p.key}
            className={`flex flex-col leading-tight whitespace-nowrap ${p.current ? "font-bold text-forest" : ""}`}
          >
            {p.tick}
            <span className="text-[10px] opacity-75">{p.tickSub}</span>
          </span>
        ))}
      </div>
      {stacked ? (
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <i className="inline-block size-2.5 rounded-sm bg-forest" />
            {parts[0]}
          </span>
          <span className="flex items-center gap-1.5">
            <i className="inline-block size-2.5 rounded-sm bg-sand" />
            {parts[1]}
          </span>
        </div>
      ) : null}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">عرض كجدول</summary>
        <table className="mt-2 w-full text-start tabular-nums">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 text-start font-normal">الفترة</th>
              <th className="py-1 text-start font-normal">{parts[0]}</th>
              <th className="py-1 text-start font-normal">{parts[1]}</th>
              <th className="py-1 text-start font-normal">المجموع</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.key} className="border-t border-line">
                <td className="py-1">{p.label}</td>
                <td className="py-1">{p.shop}</td>
                <td className="py-1">{p.store}</td>
                <td className="py-1 font-semibold">{p.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
