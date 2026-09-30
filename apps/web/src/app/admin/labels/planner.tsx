"use client";

import { Minus, Plus, Printer, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LabelItem } from "@/lib/stock";
import { searchLabelVariantsAction } from "./actions";

type Hit = Omit<LabelItem, "count">;
export const MAX_LABELS = 1000;

export function LabelPlanner({ initial }: { initial: LabelItem[] }) {
  const [items, setItems] = useState(initial);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ query: string; items: Hit[] }>({ query: "", items: [] });

  useEffect(() => {
    if (query.trim().length < 2) return;
    let current = true;
    const t = setTimeout(() => {
      void searchLabelVariantsAction(query).then((found) => {
        if (current) setHits({ query, items: found });
      });
    }, 250);
    return () => {
      current = false;
      clearTimeout(t);
    };
  }, [query]);
  const visibleHits = query.trim().length >= 2 && hits.query === query ? hits.items : [];

  const setCount = (variantId: string, count: number) =>
    setItems((xs) =>
      xs.map((x) => (x.variantId === variantId ? { ...x, count: Math.max(0, Math.min(MAX_LABELS, count)) } : x)),
    );

  function add(hit: Hit) {
    setQuery("");
    if (items.some((x) => x.variantId === hit.variantId)) return;
    setItems((xs) => [...xs, { ...hit, count: 1 }]);
  }

  const total = items.reduce((n, x) => n + x.count, 0);
  const printable = items.filter((x) => x.count > 0);
  const href = `/print/labels?items=${printable.map((x) => `${x.variantId}:${x.count}`).join(",")}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="أضيفي منتجاً: ابحثي بالاسم أو الباركود أو SKU"
          aria-label="بحث عن منتج"
          className="ps-11"
        />
        {visibleHits.length ? (
          <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-auto rounded-xl border border-border bg-card shadow-lg">
            {visibleHits.map((h) => (
              <li key={h.variantId}>
                <button
                  type="button"
                  onClick={() => add(h)}
                  className="flex min-h-11 w-full items-center justify-between gap-2 px-4 text-start hover:bg-muted"
                >
                  <span>{[h.name, h.variant].filter(Boolean).join(" · ")}</span>
                  <bdi dir="ltr" className="text-sm text-muted-foreground">
                    {h.barcode}
                  </bdi>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
          ابحثي عن منتج لإضافته.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((x) => (
            <li
              key={x.variantId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{[x.name, x.variant].filter(Boolean).join(" · ")}</p>
                <bdi dir="ltr" className="text-xs text-muted-foreground">
                  {x.barcode} · {x.sku}
                </bdi>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="إنقاص"
                  onClick={() => setCount(x.variantId, x.count - 1)}
                >
                  <Minus aria-hidden />
                </Button>
                <Input
                  value={String(x.count)}
                  inputMode="numeric"
                  dir="ltr"
                  aria-label="عدد الملصقات"
                  className="w-20 text-center tabular-nums"
                  onChange={(e) => setCount(x.variantId, Number(e.target.value.replace(/\D/g, "")) || 0)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="زيادة"
                  onClick={() => setCount(x.variantId, x.count + 1)}
                >
                  <Plus aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="حذف"
                  className="text-destructive"
                  onClick={() => setItems((xs) => xs.filter((y) => y.variantId !== x.variantId))}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {total > 0 && total <= MAX_LABELS ? (
          <Button asChild>
            <a href={href} target="_blank" rel="noopener">
              <Printer aria-hidden /> معاينة وطباعة {total} ملصق
            </a>
          </Button>
        ) : (
          <Button type="button" disabled>
            <Printer aria-hidden /> {total > MAX_LABELS ? `الحد ${MAX_LABELS} ملصق في المرة` : "لا ملصقات للطباعة"}
          </Button>
        )}
      </div>
    </div>
  );
}
