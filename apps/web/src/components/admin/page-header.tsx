import { ArrowRight } from "lucide-react";
import Link from "next/link";

/**
 * رأس الصفحة الموحّد (D-125): (رجوع) ← العنوان ← سطر الوصف أو المعلومات، والأزرار في الجهة الأخرى.
 * على الجوال: العنوان أصغر قليلاً والأزرار تنزل تحته وتملأ العرض.
 */
export function PageHeader({
  title,
  description,
  back,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-2">
      {back ? (
        <Link
          href={back.href}
          className="inline-flex min-h-9 items-center gap-1.5 self-start text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowRight aria-hidden className="size-4" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-2xl leading-tight font-bold md:text-3xl">{title}</h1>
          {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 max-sm:*:flex-1 sm:shrink-0">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
