"use client";

import { useState } from "react";

export interface ChartPoint {
  day: string;
  label: string;
  shop: string;
  store: string;
  total: string;
  /** القيمة كنسبة من أعلى يوم (0–1) — محسوبة في الخادم. */
  ratio: number;
}

const H = 160;
const W = 600;

/**
 * المبيعات اليومية (D-94): سلسلة واحدة (المجموع) بالمريمية — لونان من الهوية لا يتمايزان كفاية لعمى
 * الألوان، فالتفصيل (المحل/المتجر) في التلميح والجدول. الزمن من اليمين لليسار (واجهة عربية).
 */
export function SalesChart({ points, maxLabel }: { points: ChartPoint[]; maxLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  const step = W / n;
  const barW = Math.max(step - 2, 2); // فجوة 2px بين الأعمدة
  const x = (i: number) => (n - 1 - i) * step + (step - barW) / 2;
  const active = hover === null ? null : points[hover];

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H + 1}`}
          className="h-44 w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label="المبيعات اليومية لآخر 30 يوماً"
          onMouseLeave={() => setHover(null)}
        >
          <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="stroke-line" strokeDasharray="4 4" />
          <line x1="0" x2={W} y1={H} y2={H} className="stroke-line" />
          {points.map((p, i) => {
            const h = p.ratio > 0 ? Math.max(p.ratio * (H - 8), 3) : 0;
            return (
              <g key={p.day}>
                {h > 0 ? (
                  <rect
                    x={x(i)}
                    y={H - h}
                    width={barW}
                    height={h}
                    rx={Math.min(4, barW / 2)}
                    className={hover === i ? "fill-forest" : "fill-sage"}
                  />
                ) : null}
                {/* منطقة لمس أكبر من العمود */}
                <rect
                  x={(n - 1 - i) * step}
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
        <span className="pointer-events-none absolute start-0 top-0 text-xs text-muted-foreground tabular-nums">
          {maxLabel}
        </span>
        {active && hover !== null ? (
          <div
            className="pointer-events-none absolute top-6 z-10 -translate-x-1/2 rounded-lg border border-line bg-card px-3 py-2 text-xs shadow-sm"
            style={{ left: `${Math.min(Math.max(((n - 1 - hover + 0.5) / n) * 100, 15), 85)}%` }}
          >
            <p className="font-semibold">{active.label}</p>
            <p className="tabular-nums">المجموع: {active.total} ج.س</p>
            <p className="text-muted-foreground tabular-nums">
              المحل {active.shop} · المتجر {active.store}
            </p>
          </div>
        ) : null}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{points[0]?.label}</span>
        <span>{points[n - 1]?.label}</span>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">عرض كجدول</summary>
        <table className="mt-2 w-full text-start tabular-nums">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 text-start font-normal">اليوم</th>
              <th className="py-1 text-start font-normal">المحل</th>
              <th className="py-1 text-start font-normal">المتجر</th>
              <th className="py-1 text-start font-normal">المجموع</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.day} className="border-t border-line">
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
