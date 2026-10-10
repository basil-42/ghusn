import type { LucideIcon } from "lucide-react";
import Link from "next/link";

/**
 * صفحة/قائمة فارغة مفيدة (D-123): ماذا يظهر هنا عادةً، ولماذا هي فارغة، وزر لأول خطوة إن كانت للمستخدمة.
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: { href: string; label: string } | null;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
      <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-sage/15 text-sage">
        <Icon aria-hidden className="size-6" />
      </span>
      <p className="font-semibold">{title}</p>
      {hint ? <p className="max-w-md text-sm text-muted-foreground">{hint}</p> : null}
      {action ? (
        <Link
          href={action.href}
          className="mt-2 flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
