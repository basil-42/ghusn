"use client";

import { useState } from "react";
import { formatPercent } from "@/lib/format";

export interface ChartPoint {
  key: string;
  /** اسم العمود كاملاً للتلميح والجدول (13 أكتوبر، 14:00، أكتوبر 2026). */
  label: string;
  /** اسم مختصر تحت المحور، أو "" لإخفائه (لا يتسع لكل الأعمدة). */
  tick: string;
  shop: string;
  store: string;
  total: string;
  /** القيمة كنسبة من أعلى عمود في الفترتين (0–1) — محسوبة في الخادم. */
  ratio: number;
  /** نفس العمود من الفترة السابقة، أو null إن لم يوجد مقابل (شهر أقصر). */
  /** change: نسبة التغيّر عن المقابل (0.25 = +25%). */
  prev: { label: string; total: string; ratio: number; change: string | null } | null;
  /** عمود لم يأتِ بعد: فارغ، والخط المنقّط وحده يظهر فوقه. */
  future: boolean;
  /** العمود الجاري (اليوم/الساعة/الشهر الحالي) يُبرز. */
  current: boolean;
}

const H = 180;
const W = 600;

/**
 * رسم المبيعات للفترة (D-94، D-133): عمود لكل ساعة/يوم/شهر بالمريمية، وخط ذهبي منقّط لنفس الأعمدة من
 * الفترة السابقة. التفصيل (المحل/المتجر) في التلميح والجدول — لونان من الهوية لا يتمايزان كفاية لعمى
 * الألوان. الزمن من اليمين لليسار (واجهة عربية).
 */
export function SalesChart({
  points,
  maxLabel,
  prevName,
  ariaLabel,
}: {
  points: ChartPoint[];
  maxLabel: string;
  /** اسم الفترة السابقة في المفتاح (الشهر السابق، أمس…). */
  prevName: string;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  const step = W / n;
  const barW = Math.max(step * 0.7, 2);
  const cx = (i: number) => (n - 1 - i) * step + step / 2;
  const top = (ratio: number) => H - ratio * (H - 10);
  const active = hover === null ? null : points[hover];
  const line = points
    .map((p, i) => (p.prev ? `${cx(i).toFixed(1)},${top(p.prev.ratio).toFixed(1)}` : null))
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H + 1}`}
          className="h-52 w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label={ariaLabel}
          onMouseLeave={() => setHover(null)}
        >
          <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="stroke-line" strokeDasharray="4 4" />
          <line x1="0" x2={W} y1={H} y2={H} className="stroke-line" />
          {points.map((p, i) => {
            const h = p.ratio > 0 ? Math.max(p.ratio * (H - 10), 3) : 0;
            return (
              <g key={p.key}>
                {h > 0 ? (
                  <rect
                    x={cx(i) - barW / 2}
                    y={H - h}
                    width={barW}
                    height={h}
                    rx={Math.min(4, barW / 2)}
                    className={hover === i || p.current ? "fill-forest" : "fill-sage"}
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
          {line ? (
            <polyline
              points={line}
              fill="none"
              className="pointer-events-none stroke-gold"
              strokeWidth={2}
              strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
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
            {active.future ? (
              <p className="text-muted-foreground">لم يأتِ بعد</p>
            ) : (
              <>
                <p className="tabular-nums">المجموع: {active.total} ج.س</p>
                <p className="text-muted-foreground tabular-nums">
                  المحل {active.shop} · المتجر {active.store}
                </p>
              </>
            )}
            {active.prev ? (
              <p className="mt-1 border-t border-line pt-1 text-muted-foreground tabular-nums">
                {active.prev.label}: {active.prev.total}
                {active.prev.change && !active.future ? (
                  <span className={active.prev.change.startsWith("-") ? "text-danger" : "text-forest"}>
                    {" "}
                    · {active.prev.change.startsWith("-") ? "▼" : "▲"}{" "}
                    <bdi dir="ltr">{formatPercent(active.prev.change)}</bdi>
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <div
        aria-hidden
        className="grid text-center text-xs text-muted-foreground tabular-nums"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {points.map((p) => (
          <span
            key={p.key}
            className={`overflow-visible whitespace-nowrap ${p.current ? "font-bold text-forest" : ""}`}
          >
            {p.tick}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2.5 rounded-sm bg-sage" />
          المبيعات (المحل والمتجر)
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block w-4 border-t-2 border-dashed border-gold" />
          {prevName}
        </span>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">عرض كجدول</summary>
        <table className="mt-2 w-full text-start tabular-nums">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 text-start font-normal">الفترة</th>
              <th className="py-1 text-start font-normal">المحل</th>
              <th className="py-1 text-start font-normal">المتجر</th>
              <th className="py-1 text-start font-normal">المجموع</th>
              <th className="py-1 text-start font-normal">{prevName}</th>
            </tr>
          </thead>
          <tbody>
            {points
              .filter((p) => !p.future)
              .map((p) => (
                <tr key={p.key} className="border-t border-line">
                  <td className="py-1">{p.label}</td>
                  <td className="py-1">{p.shop}</td>
                  <td className="py-1">{p.store}</td>
                  <td className="py-1 font-semibold">{p.total}</td>
                  <td className="py-1 text-muted-foreground">{p.prev ? p.prev.total : "—"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
