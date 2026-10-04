import { Search } from "lucide-react";

/**
 * خانة البحث (D-92): نموذج GET يعمل دون JavaScript. Safari يفرض شكله على type=search ويتجاهل
 * الهوامش — نلغي المظهر الافتراضي وزر المسح ونثبّت الهوامش من الجهتين (D-95).
 */
export function SearchBox({
  id,
  locale,
  label,
  placeholder,
  className = "",
}: {
  id: string;
  locale: string;
  label: string;
  placeholder: string;
  className?: string;
}) {
  return (
    <form
      action={locale === "en" ? "/en/search" : "/search"}
      method="get"
      role="search"
      className={`flex h-11 min-w-0 items-center gap-2 rounded-[10px] border border-input bg-background ps-3.5 pe-1 focus-within:border-forest focus-within:bg-card ${className}`}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search aria-hidden className="size-[18px] shrink-0 text-muted-foreground" strokeWidth={1.8} />
      <input
        id={id}
        name="q"
        type="search"
        maxLength={80}
        placeholder={placeholder}
        className="h-full w-full min-w-0 appearance-none bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
      />
      <button type="submit" className="sr-only">
        {label}
      </button>
    </form>
  );
}
