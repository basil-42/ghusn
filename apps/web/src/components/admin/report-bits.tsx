import { Lightbulb } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** شرائح اختيار بروابط (تعمل بلا جافاسكربت) — تختفي في الطباعة. */
export function ChipNav({
  label,
  items,
}: {
  label: string;
  items: { href: string; label: string; active: boolean }[];
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2 print:hidden">
      {items.map((x) => (
        <Link
          key={x.href}
          href={x.href}
          aria-current={x.active ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold",
            x.active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
          )}
        >
          {x.label}
        </Link>
      ))}
    </nav>
  );
}

/** صندوق الملاحظات التلقائية للتقارير. */
export function ReportNotes({ notes, empty }: { notes: React.ReactNode[]; empty: string }) {
  return (
    <section aria-labelledby="notes" className="rounded-2xl border border-gold/40 bg-gold/10 p-5">
      <h2 id="notes" className="mb-3 flex items-center gap-2 font-bold">
        <Lightbulb aria-hidden className="size-5 text-warning" /> ملاحظات
      </h2>
      {notes.length ? (
        <ul className="flex list-disc flex-col gap-1.5 ps-5 text-sm">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

/** شريط نسبة صغير (بيع منها). */
export function RatioBar({ value }: { value: string | null }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, Number(value) * 100));
  return (
    <span aria-hidden className="inline-block h-1.5 w-16 overflow-hidden rounded-full bg-muted align-middle">
      <span className="block h-full rounded-full bg-sage" style={{ width: `${pct}%` }} />
    </span>
  );
}
