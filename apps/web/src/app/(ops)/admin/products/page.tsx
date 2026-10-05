import { variantLabel } from "@ghusn/core";
import { Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import {
  READINESS_LABELS,
  countIncompleteForStore,
  listCategories,
  listProducts,
  productReadiness,
} from "@/lib/catalog";
import { imageUrl } from "@/lib/product-images";

export const metadata: Metadata = { title: "المنتجات | غصن" };

type SearchParams = Promise<{ q?: string; category?: string; page?: string; archived?: string; incomplete?: string }>;

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requirePermission({ product: ["read"] });
  const { q = "", category = "", page: pageParam, archived, incomplete: incompleteParam } = await searchParams;
  const incomplete = incompleteParam === "1";
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const [categories, { items, total, pages }, incompleteCount] = await Promise.all([
    listCategories(),
    listProducts({ q, categoryId: category || undefined, incomplete, page }),
    countIncompleteForStore(),
  ]);
  const canCreate = roleCan(session.user.role, { product: ["create"] });
  const pageHref = (p: number) =>
    `/admin/products?${new URLSearchParams({ ...(q && { q }), ...(category && { category }), ...(incomplete && { incomplete: "1" }), page: String(p) })}`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">المنتجات</h1>
          <p className="text-muted-foreground">{total.toLocaleString("en-US")} منتج</p>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link href="/admin/products/new">
              <Plus aria-hidden /> إضافة منتج
            </Link>
          </Button>
        ) : null}
      </header>

      {archived ? <Alert variant="success">تمت أرشفة المنتج.</Alert> : null}

      {/* جاهزية المتجر (D-106): رابط يعرض منتجات المتجر التي ينقصها شيء */}
      {incompleteCount > 0 || incomplete ? (
        <Link
          href={incomplete ? "/admin/products" : "/admin/products?incomplete=1"}
          aria-pressed={incomplete}
          className={`flex min-h-11 items-center justify-between gap-3 rounded-2xl border px-4 py-2 text-sm font-semibold ${
            incomplete ? "border-forest bg-forest text-ivory" : "border-sand bg-sand/20 text-forest hover:bg-sand/35"
          }`}
        >
          <span>
            {incomplete
              ? "تعرضين منتجات المتجر الناقصة فقط"
              : `${incompleteCount.toLocaleString("en-US")} منتج في المتجر ينقصه شيء (صورة، اسم أو وصف إنجليزي…)`}
          </span>
          <span className="shrink-0 underline">{incomplete ? "عرض الكل" : "عرضها"}</span>
        </Link>
      ) : null}

      <form className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_14rem_auto]" role="search">
        <Input name="q" defaultValue={q} placeholder="ابحثي بالاسم أو الباركود أو SKU" aria-label="بحث" />
        {incomplete ? <input type="hidden" name="incomplete" value="1" /> : null}
        <NativeSelect name="category" defaultValue={category} aria-label="القسم">
          <option value="">كل الأقسام</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameAr}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline">
          <Search aria-hidden /> بحث
        </Button>
      </form>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
          {incomplete && !q && !category
            ? "كل منتجات المتجر مكتملة."
            : q || category || incomplete
              ? "لا توجد نتائج مطابقة."
              : "لا توجد منتجات بعد."}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((p) => {
            const first = p.variants[0];
            const main = p.images[0];
            const missing = productReadiness(p);
            return (
              <li key={p.id}>
                <Link
                  href={`/admin/products/${p.id}`}
                  className="flex h-full flex-col gap-2 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-sage"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      {main ? (
                        <Image
                          src={imageUrl(main.key, "thumb")}
                          alt=""
                          width={56}
                          height={56}
                          unoptimized
                          className="size-14 shrink-0 rounded-lg border border-border object-cover"
                        />
                      ) : (
                        <div className="size-14 shrink-0 rounded-lg border border-dashed border-border bg-muted" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-bold">{p.nameAr}</p>
                        <p className="text-sm text-muted-foreground">{p.category.nameAr}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {p.type === "MATERIAL" ? <Badge>مادة تغليف</Badge> : null}
                      {!p.isActive ? <Badge variant="warning">غير نشط</Badge> : null}
                      {p.isWebVisible ? <Badge variant="success">في المتجر</Badge> : null}
                    </div>
                  </div>
                  <p className="text-sm">
                    {p.variants.length > 1
                      ? `${p.variants.length} متغيرات: ${p.variants.map(variantLabel).slice(0, 3).join("، ")}${p.variants.length > 3 ? "…" : ""}`
                      : null}
                  </p>
                  {missing?.length ? (
                    <p className="flex flex-wrap items-center gap-1 text-xs">
                      <span className="font-semibold text-warning">ينقصه:</span>
                      {missing.map((k) => (
                        <span key={k} className="rounded-full bg-gold/15 px-2 py-0.5 font-semibold text-warning">
                          {READINESS_LABELS[k]}
                        </span>
                      ))}
                    </p>
                  ) : null}
                  {first ? (
                    <p dir="ltr" className="mt-auto text-end text-sm tabular-nums text-muted-foreground">
                      {first.sku} · {first.barcode}
                    </p>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 ? (
        <nav aria-label="الصفحات" className="flex items-center justify-center gap-3">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(page - 1)}>السابق</Link>
            </Button>
          ) : null}
          <span className="text-sm tabular-nums">
            {page} / {pages}
          </span>
          {page < pages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(page + 1)}>التالي</Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
