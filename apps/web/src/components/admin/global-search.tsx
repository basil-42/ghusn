"use client";

import { ArrowLeft, Clock, Loader2, Search, X, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { type QuickAction, quickActionTitle } from "@/lib/admin-nav-model";
import type { SearchGroup, SearchItem } from "@/lib/global-search";
import { cn } from "@/lib/utils";

const RECENT_KEY = "ghusn_recent_search";
const RECENT_MAX = 6;

type Recent = Pick<SearchItem, "href" | "title" | "sub">;
interface Section {
  key: string;
  label: string;
  items: SearchItem[];
  moreHref?: string;
}

function readRecent(): Recent[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? (v as Recent[]).filter((r) => typeof r?.href === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function saveRecent(item: Recent) {
  try {
    const next = [item, ...readRecent().filter((r) => r.href !== item.href)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // التخزين المحلي غير متاح (نافذة خاصة) — «آخر ما فتحته» ميزة إضافية فقط
  }
}

/**
 * البحث الشامل (D-121): زر في الشريط العلوي (أو Ctrl/⌘+K) يفتح نافذة بحث في كل النظام. النتائج من
 * /api/v1/search/global حسب صلاحية المستخدمة؛ قبل الكتابة: آخر ما فتحته والإجراءات السريعة.
 */
export function GlobalSearch({ quick }: { quick: QuickAction[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [openedAt, setOpenedAt] = useState(pathname);
  // الانتقال لصفحة أخرى يغلق النافذة
  if (open && openedAt !== pathname) {
    setOpen(false);
    setOpenedAt(pathname);
  }
  const show = useCallback(() => {
    setOpenedAt(pathname);
    setOpen(true);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        show();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [show]);

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="hidden h-11 w-full max-w-md items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 text-sm text-muted-foreground hover:border-sage md:flex"
      >
        <span className="flex items-center gap-2">
          <Search aria-hidden className="size-4" />
          ابحث عن منتج، عميل، طلب، فاتورة…
        </span>
        <kbd dir="ltr" className="rounded-md border border-border bg-card px-1.5 text-xs font-sans">
          Ctrl K
        </kbd>
      </button>
      <button
        type="button"
        aria-label="بحث"
        onClick={show}
        className="flex size-11 items-center justify-center rounded-xl border border-border md:hidden"
      >
        <Search aria-hidden className="size-5" />
      </button>
      {open ? <SearchDialog quick={quick} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function SearchDialog({ quick, onClose }: { quick: QuickAction[]; onClose: () => void }) {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<SearchGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [active, setActive] = useState(0);
  const [recent] = useState<Recent[]>(() => readRecent());
  const term = q.trim();

  useEffect(() => {
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // الطلب بعد توقف الكتابة 200ms، ويُلغى السابق
  useEffect(() => {
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/search/global?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { groups: SearchGroup[] };
        setGroups(data.groups);
        setFailed(false);
        setActive(0);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setFailed(true);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [term]);

  // ما يُعرض الآن: النتائج (حسب الفلتر)، أو آخر ما فُتح والإجراءات قبل الكتابة
  const sections = useMemo((): Section[] => {
    if (term.length < 2) {
      const out: Section[] = [];
      if (recent.length)
        out.push({ key: "recent", label: "آخر ما فتحته", items: recent.map((r) => ({ ...r, id: r.href, hl: [] })) });
      if (quick.length) {
        out.push({
          key: "quick",
          label: "إجراءات سريعة",
          items: quick.map((a) => ({ id: a.href, href: a.href, title: quickActionTitle(a.label), hl: [] })),
        });
      }
      return out;
    }
    return (groups ?? []).filter((g) => filter === "all" || g.key === filter);
  }, [term, recent, quick, groups, filter]);
  // أول فهرس لكل قسم في القائمة المسطّحة (للتنقل بالأسهم)
  const starts = sections.map((_, k) => sections.slice(0, k).reduce((n, x) => n + x.items.length, 0));
  const flat = sections.flatMap((s) => s.items);

  function go(item: SearchItem | Recent) {
    saveRecent({ href: item.href, title: item.title, sub: item.sub });
    onClose();
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (flat.length ? (a + 1) % flat.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (flat.length ? (a - 1 + flat.length) % flat.length : 0));
    } else if (e.key === "Enter") {
      const item = flat[active];
      if (item) {
        e.preventDefault();
        go(item);
      }
    }
  }

  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  const total = (groups ?? []).reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="البحث الشامل">
      <button type="button" aria-label="إغلاق البحث" className="absolute inset-0 bg-forest/45" onClick={onClose} />
      <div
        className="absolute inset-0 flex flex-col overflow-hidden bg-card md:inset-x-0 md:top-[10vh] md:bottom-auto md:mx-auto md:max-h-[75vh] md:w-full md:max-w-2xl md:rounded-2xl md:shadow-2xl"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search aria-hidden className="size-5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setFilter("all");
            }}
            placeholder="منتج، عميل، رقم جوال، طلب، فاتورة، باركود…"
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls={listId}
            aria-activedescendant={flat.length ? `${listId}-${active}` : undefined}
            aria-label="بحث في النظام"
            autoComplete="off"
            enterKeyHint="search"
            className="min-h-11 w-full min-w-0 bg-transparent text-lg font-semibold outline-none placeholder:text-base placeholder:font-normal placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
          />
          {loading && term.length >= 2 ? (
            <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-11 shrink-0 items-center rounded-lg px-2 text-sm font-semibold md:hidden"
          >
            إلغاء
          </button>
          <kbd className="hidden shrink-0 rounded-md border border-border px-1.5 text-xs md:inline">Esc</kbd>
        </div>

        {term.length >= 2 && groups && groups.length > 1 ? (
          <div className="flex gap-1.5 overflow-x-auto px-4 pt-3 text-xs" role="tablist" aria-label="نوع النتائج">
            {[
              { key: "all", label: "الكل", n: total, more: false },
              ...groups.map((g) => ({ key: g.key, label: g.label, n: g.items.length, more: g.more })),
            ].map((c) => (
              <button
                key={c.key}
                type="button"
                role="tab"
                aria-selected={filter === c.key}
                onClick={() => {
                  setFilter(c.key);
                  setActive(0);
                  inputRef.current?.focus();
                }}
                className={cn(
                  "flex min-h-8 shrink-0 items-center rounded-lg px-2.5 font-semibold whitespace-nowrap",
                  filter === c.key ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted",
                )}
              >
                {c.label} ·{" "}
                <bdi dir="ltr" className="ms-1 tabular-nums">
                  {c.n}
                  {c.more ? "+" : ""}
                </bdi>
              </button>
            ))}
          </div>
        ) : null}

        <div id={listId} role="listbox" aria-label="النتائج" className="min-h-0 flex-1 overflow-y-auto pb-2">
          {sections.map((s, si) => (
            <div key={s.key} role="group" aria-label={s.label}>
              <p className="flex items-center gap-1.5 px-4 pt-3 pb-1 text-xs font-bold text-muted-foreground">
                {s.key === "recent" ? <Clock aria-hidden className="size-3.5" /> : null}
                {s.key === "quick" ? <Zap aria-hidden className="size-3.5" /> : null}
                {s.label}
              </p>
              {s.items.map((item, k) => {
                const i = (starts[si] ?? 0) + k;
                return (
                  <Link
                    key={`${s.key}-${item.id}`}
                    id={`${listId}-${i}`}
                    href={item.href}
                    role="option"
                    aria-selected={i === active}
                    onMouseMove={() => setActive(i)}
                    onClick={(e) => {
                      e.preventDefault();
                      go(item);
                    }}
                    className={cn(
                      "flex min-h-12 items-center gap-3 px-4 py-2 text-sm",
                      i === active ? "bg-sage/15" : "hover:bg-muted",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        <Highlight text={item.title} ranges={item.hl} />
                      </span>
                      {item.sub ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          <bdi>{item.sub}</bdi>
                        </span>
                      ) : null}
                    </span>
                    {item.meta ? (
                      <span
                        className={cn(
                          "shrink-0 text-xs tabular-nums",
                          item.tone === "danger"
                            ? "font-semibold text-danger"
                            : item.tone === "gold"
                              ? "rounded-md bg-gold/20 px-2 py-0.5 font-semibold"
                              : "text-muted-foreground",
                        )}
                      >
                        {item.meta}
                      </span>
                    ) : null}
                    {i === active ? <ArrowLeft aria-hidden className="size-4 shrink-0 text-muted-foreground" /> : null}
                  </Link>
                );
              })}
              {s.moreHref ? (
                <Link
                  href={s.moreHref}
                  onClick={onClose}
                  className="block px-4 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline"
                >
                  عرض كل نتائج {s.label} ←
                </Link>
              ) : null}
            </div>
          ))}
          {term.length >= 2 && groups && !groups.length && !loading ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">لا نتائج لـ «{term}».</p>
          ) : null}
          {failed ? (
            <p className="px-4 py-3 text-sm text-danger">تعذّر البحث — تأكد من الاتصال ثم أعد المحاولة.</p>
          ) : null}
          {term.length < 2 && !sections.length ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">حرفان على الأقل للبحث.</p>
          ) : null}
        </div>

        <div className="hidden items-center gap-4 border-t border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground md:flex">
          <span>↑↓ للتنقل</span>
          <span>↵ للفتح</span>
          <span>Esc للإغلاق</span>
          <button type="button" onClick={onClose} className="ms-auto flex items-center gap-1 hover:text-foreground">
            <X aria-hidden className="size-3.5" /> إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

function Highlight({ text, ranges }: { text: string; ranges: [number, number][] }) {
  if (!ranges.length) return <>{text}</>;
  const out: React.ReactNode[] = [];
  let at = 0;
  for (const [s, e] of ranges) {
    if (s > at) out.push(text.slice(at, s));
    out.push(
      <mark key={s} className="rounded-sm bg-gold/30 text-inherit">
        {text.slice(s, e)}
      </mark>,
    );
    at = e;
  }
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}
