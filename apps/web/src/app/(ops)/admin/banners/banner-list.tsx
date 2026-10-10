"use client";

import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { reorderBannersAction } from "./actions";

export interface BannerRow {
  id: string;
  titleAr: string;
  sub: string;
  imageUrl: string;
  mobileImageUrl: string | null;
  link: string;
  period: { main: string; sub?: string };
  status: { label: string; tone: "live" | "scheduled" | "warn" | "off"; group: "live" | "scheduled" | "off" };
}

const FILTERS = [
  { key: "all", label: "الكل" },
  { key: "live", label: "ظاهر الآن" },
  { key: "scheduled", label: "مجدول" },
  { key: "off", label: "منتهٍ أو متوقف" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

const TONES: Record<BannerRow["status"]["tone"], string> = {
  live: "bg-sage/20 text-forest",
  scheduled: "bg-gold/20 text-forest",
  warn: "bg-danger/10 text-danger",
  off: "bg-muted text-muted-foreground",
};

const move = (ids: string[], from: number, to: number) => {
  const next = [...ids];
  const [id] = next.splice(from, 1);
  next.splice(to, 0, id!);
  return next;
};

/**
 * قائمة البانرات (D-122): صف لكل بانر بمعاينة الصورتين والوجهة والمدة والحالة. الترتيب بالسحب من المقبض
 * (أو سهمي أعلى/أسفل على الجوال ولوحة المفاتيح) ويُحفظ فوراً؛ الترتيب = ترتيب الظهور في المتجر.
 */
export function BannerList({ rows, max }: { rows: BannerRow[]; max: number }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [order, setOrder] = useState(() => rows.map((r) => r.id));
  const [synced, setSynced] = useState(rows);
  const [dragging, setDragging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // بيانات جديدة من الخادم (حفظ/حذف/ترتيب) تعيد ضبط الترتيب المحلي
  if (synced !== rows) {
    setSynced(rows);
    setOrder(rows.map((r) => r.id));
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = order.map((id) => byId.get(id)).filter((r): r is BannerRow => !!r);
  const shown = filter === "all" ? ordered : ordered.filter((r) => r.status.group === filter);
  const canReorder = filter === "all" && rows.length > 1;

  function save(next: string[]) {
    if (next.join() === rows.map((r) => r.id).join()) return;
    setError(null);
    startTransition(async () => {
      const res = await reorderBannersAction(next);
      if (res.error) {
        setError(res.error);
        setOrder(rows.map((r) => r.id));
      } else if (res.success) toast(res.success);
      router.refresh();
    });
  }

  function step(id: string, by: -1 | 1) {
    const i = order.indexOf(id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = move(order, i, j);
    setOrder(next);
    save(next);
  }

  if (!rows.length) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
        <p className="font-semibold">لا بانرات بعد — يظهر الآن بانر الهوية في رئيسية المتجر.</p>
        <Link
          href="/admin/banners?edit=new"
          scroll={false}
          className="flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
        >
          أضيفي أول بانر
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {FILTERS.map((f) => {
          const n = f.key === "all" ? rows.length : rows.filter((r) => r.status.group === f.key).length;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "flex min-h-10 items-center gap-1 rounded-full border px-4 font-semibold",
                filter === f.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
              )}
            >
              {f.label} · <span className="tabular-nums">{n}</span>
            </button>
          );
        })}
        <span className="ms-auto text-xs text-muted-foreground">
          {canReorder
            ? `يظهر في المتجر حتى ${max} بالترتيب — اسحبي من المقبض لإعادة الترتيب${pending ? " · جارٍ الحفظ…" : ""}`
            : filter !== "all"
              ? "الترتيب من «الكل»"
              : null}
        </span>
      </div>
      {error ? <Alert variant="destructive">{error}</Alert> : null}

      <ul className="flex flex-col gap-2" aria-label="البانرات بترتيب الظهور">
        {shown.map((r) => {
          const i = order.indexOf(r.id);
          return (
            <li
              key={r.id}
              draggable={canReorder}
              onDragStart={(e) => {
                setDragging(r.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", r.id);
              }}
              onDragOver={(e) => {
                if (!dragging || dragging === r.id) return;
                e.preventDefault();
                const from = order.indexOf(dragging);
                if (from >= 0 && i >= 0 && from !== i) setOrder(move(order, from, i));
              }}
              onDrop={(e) => e.preventDefault()}
              onDragEnd={() => {
                setDragging(null);
                save(order);
              }}
              className={cn(
                "grid grid-cols-[auto_auto_1fr_auto] items-center gap-3 rounded-2xl border border-border bg-card p-3 md:grid-cols-[auto_auto_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto_auto]",
                dragging === r.id && "opacity-50 ring-2 ring-sage",
              )}
            >
              {canReorder ? (
                <span className="flex flex-col items-center">
                  <span
                    aria-hidden
                    className="hidden cursor-grab px-1 text-muted-foreground active:cursor-grabbing md:block"
                  >
                    <GripVertical className="size-5" />
                  </span>
                  <span className="flex flex-col md:hidden">
                    <button
                      type="button"
                      aria-label={`تقديم «${r.titleAr}»`}
                      disabled={i === 0 || pending}
                      onClick={() => step(r.id, -1)}
                      className="flex size-9 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-30"
                    >
                      <ArrowUp aria-hidden className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`تأخير «${r.titleAr}»`}
                      disabled={i === order.length - 1 || pending}
                      onClick={() => step(r.id, 1)}
                      className="flex size-9 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-30"
                    >
                      <ArrowDown aria-hidden className="size-4" />
                    </button>
                  </span>
                </span>
              ) : (
                <span />
              )}
              <span className="flex items-end gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- صورة مصغّرة جاهزة (WebP 400) */}
                <img
                  src={r.imageUrl}
                  alt=""
                  className="aspect-[2/1] w-24 rounded-lg border border-border object-cover md:w-28"
                />
                {r.mobileImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- صورة مصغّرة جاهزة
                  <img
                    src={r.mobileImageUrl}
                    alt=""
                    className="hidden aspect-[4/5] w-10 rounded-md border border-border object-cover sm:block"
                  />
                ) : (
                  <span
                    title="بلا صورة جوال — تُقص صورة الكمبيوتر"
                    className="hidden aspect-[4/5] w-10 items-center justify-center rounded-md border border-dashed border-border text-center text-[9px] leading-tight text-muted-foreground sm:flex"
                  >
                    نفس الصورة
                  </span>
                )}
              </span>
              <span className="flex min-w-0 flex-col">
                <b className="truncate">{r.titleAr}</b>
                <span className="truncate text-xs text-muted-foreground">{r.sub}</span>
                <span className="truncate text-xs text-muted-foreground md:hidden">
                  ← {r.link} · {r.period.main}
                </span>
              </span>
              <span className="hidden min-w-0 truncate text-sm md:block">← {r.link}</span>
              <span className="hidden min-w-0 flex-col text-sm md:flex">
                <span className="truncate">{r.period.main}</span>
                {r.period.sub ? <span className="truncate text-xs text-muted-foreground">{r.period.sub}</span> : null}
              </span>
              <span
                className={cn(
                  "hidden rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap md:inline",
                  TONES[r.status.tone],
                )}
              >
                {r.status.label}
              </span>
              <span className="flex flex-col items-end gap-1">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap md:hidden",
                    TONES[r.status.tone],
                  )}
                >
                  {r.status.label}
                </span>
                <Link
                  href={`/admin/banners?edit=${r.id}`}
                  scroll={false}
                  className="flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted"
                >
                  تعديل
                </Link>
              </span>
            </li>
          );
        })}
      </ul>
      {!shown.length ? <p className="text-sm text-muted-foreground">لا بانرات في هذا التصنيف.</p> : null}
    </div>
  );
}
