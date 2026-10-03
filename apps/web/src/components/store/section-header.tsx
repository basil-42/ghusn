import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";

/** عنوان قسم موحّد في المتجر (D-95)، مع رابط «عرض الكل» اختياري. */
export function SectionHeader({
  title,
  href,
  linkLabel,
  locale,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  locale: string;
}) {
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;
  return (
    <div className="flex items-end justify-between gap-4">
      <h2 className="font-display text-3xl font-bold">{title}</h2>
      {href && linkLabel ? (
        <Link href={href} className="flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold hover:underline">
          {linkLabel}
          <Arrow aria-hidden className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}
