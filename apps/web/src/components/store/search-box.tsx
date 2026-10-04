"use client";

import { Search } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import type { SearchSuggestions } from "@/lib/storefront";
import { Price } from "./price";

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

type Option = { key: string; href: string };

/**
 * خانة البحث (D-92): نموذج GET يعمل دون JavaScript، وEnter يفتح صفحة النتائج. مع JavaScript تظهر
 * اقتراحات أثناء الكتابة (D-100): منتجات وأقسام ومناسبات، بالأسهم وEsc. Safari يفرض شكله على
 * type=search ويتجاهل الهوامش — نلغي المظهر الافتراضي وزر المسح (D-95).
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
  const t = useTranslations("search");
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [result, setResult] = useState<{ q: string; data: SearchSuggestions } | null>(null);
  const cache = useRef(new Map<string, SearchSuggestions>());

  const term = q.trim();
  const ready = term.length >= MIN_CHARS;

  useEffect(() => {
    if (!ready) return;
    const key = `${locale}|${term}`;
    const hit = cache.current.get(key);
    if (hit) {
      setResult({ q: term, data: hit });
      return;
    }
    // انتظار قصير بعد آخر حرف، وإلغاء الطلب السابق — خفيف على الخادم وعلى بيانات الجوال
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/v1/search/suggest?${new URLSearchParams({ q: term, locale })}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<SearchSuggestions>) : null))
        .then((data) => {
          if (!data) return;
          cache.current.set(key, data);
          setResult({ q: term, data });
        })
        .catch(() => {});
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [term, ready, locale]);

  const data = ready && result?.q === term ? result.data : null;
  const options: Option[] = data
    ? [
        ...data.products.map((p) => ({ key: `p-${p.id}`, href: `/p/${p.id}` })),
        ...data.categories.map((c) => ({ key: `c-${c.slug}`, href: `/c/${c.slug}` })),
        ...data.occasions.map((o) => ({ key: `o-${o.slug}`, href: `/occasion/${o.slug}` })),
        { key: "all", href: `/search?${new URLSearchParams({ q: term })}` },
      ]
    : [];
  const visible = open && !!data;
  const optionId = (i: number) => `${listId}-${i}`;
  const indexOf = (key: string) => options.findIndex((o) => o.key === key);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!visible) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      // -1 = الخانة نفسها؛ الأسهم تدور بين الاقتراحات ثم تعود للخانة
      setActive((i) => {
        const next = i + step;
        return next < -1 ? options.length - 1 : next >= options.length ? -1 : next;
      });
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      setOpen(false);
      router.push(options[active].href);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  };

  const optionClass = (key: string) =>
    `flex min-h-11 items-center gap-3 px-3 py-2 text-sm ${indexOf(key) === active ? "bg-muted" : "hover:bg-muted"}`;
  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  return (
    <form
      action={locale === "en" ? "/en/search" : "/search"}
      method="get"
      role="search"
      onSubmit={close}
      className={`relative flex h-11 min-w-0 items-center gap-2 rounded-[10px] border border-input bg-background ps-3.5 pe-1 focus-within:border-forest focus-within:bg-card ${className}`}
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
        autoComplete="off"
        placeholder={placeholder}
        role="combobox"
        aria-expanded={visible}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={visible && active >= 0 ? optionId(active) : undefined}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onKeyDown={onKeyDown}
        className="h-full w-full min-w-0 appearance-none bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
      />
      <button type="submit" className="sr-only">
        {label}
      </button>

      {visible ? (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          // الضغط على اقتراح لا يُفقد الخانة التركيز قبل فتح الرابط
          onMouseDown={(e) => e.preventDefault()}
          className="absolute inset-x-0 top-full z-50 mt-1.5 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-card py-1.5 shadow-lg"
        >
          {data.products.length === 0 && data.categories.length === 0 && data.occasions.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">{t("suggestNone", { q: term })}</p>
          ) : null}
          {data.products.length ? <Heading>{t("products")}</Heading> : null}
          {data.products.map((p) => (
            <Link
              key={p.id}
              id={optionId(indexOf(`p-${p.id}`))}
              role="option"
              aria-selected={indexOf(`p-${p.id}`) === active}
              href={`/p/${p.id}`}
              onClick={close}
              className={optionClass(`p-${p.id}`)}
            >
              <span className="relative size-10 shrink-0 overflow-hidden rounded-lg border border-line bg-muted">
                {p.imageUrl ? (
                  <Image src={p.imageUrl} alt="" fill sizes="40px" className="object-cover" unoptimized />
                ) : (
                  <Image
                    src="/brand/mark-sage.svg"
                    alt=""
                    width={20}
                    height={20}
                    className="m-auto mt-2.5 opacity-40"
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{p.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{p.category}</span>
              </span>
              <Price value={p.priceSdg} locale={locale} className="shrink-0 text-[13px] font-semibold" />
            </Link>
          ))}
          {data.categories.length ? <Heading>{t("categories")}</Heading> : null}
          {data.categories.map((c) => (
            <Link
              key={c.slug}
              id={optionId(indexOf(`c-${c.slug}`))}
              role="option"
              aria-selected={indexOf(`c-${c.slug}`) === active}
              href={`/c/${c.slug}`}
              onClick={close}
              className={optionClass(`c-${c.slug}`)}
            >
              {c.name}
            </Link>
          ))}
          {data.occasions.length ? <Heading>{t("occasions")}</Heading> : null}
          {data.occasions.map((o) => (
            <Link
              key={o.slug}
              id={optionId(indexOf(`o-${o.slug}`))}
              role="option"
              aria-selected={indexOf(`o-${o.slug}`) === active}
              href={`/occasion/${o.slug}`}
              onClick={close}
              className={optionClass(`o-${o.slug}`)}
            >
              {o.name}
            </Link>
          ))}
          <Link
            id={optionId(indexOf("all"))}
            role="option"
            aria-selected={indexOf("all") === active}
            href={{ pathname: "/search", query: { q: term } }}
            onClick={close}
            className={`${optionClass("all")} mt-1 border-t border-line font-semibold text-warning`}
          >
            <Search aria-hidden className="size-4" />
            {t("viewAll", { q: term })}
          </Link>
        </div>
      ) : null}
    </form>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <p className="px-3 pt-2 pb-1 text-[11px] font-semibold text-muted-foreground">{children}</p>;
}
