import { formatDateTime } from "@/lib/format";

/** رأس التقرير المطبوع (D-127): يظهر في الطباعة/PDF وحدها — الشعار والعنوان والفترة ومن أصدره ومتى. */
export function PrintHeader({ title, period, issuedBy }: { title: string; period: string; issuedBy: string }) {
  return (
    <div className="mb-2 hidden items-center justify-between gap-4 border-b-2 border-forest pb-3 print:flex">
      <div className="flex flex-col gap-0.5">
        <b className="font-display text-xl">{title}</b>
        <span className="text-sm">{period}</span>
        <span className="text-xs text-muted-foreground">
          صدر في <bdi dir="ltr">{formatDateTime(new Date())}</bdi> — {issuedBy}
        </span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- شعار SVG ثابت للطباعة */}
      <img src="/brand/logo-ar-mark-forest.svg" alt="غصن" width={110} height={56} />
    </div>
  );
}
