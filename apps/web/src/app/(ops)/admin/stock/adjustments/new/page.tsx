import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { roleCan } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { searchVariants } from "@/lib/shipments";
import { adjustmentVariant, findVariantByCode } from "@/lib/stock-adjustments";
import { AdjustmentForm } from "../forms";

export const metadata: Metadata = { title: "تسوية مخزون | غصن" };

/** تسوية جديدة: اختيار الصنف (بحث أو مسح باركود) ثم النموذج — يعمل على الجوال (D-111). */
export default async function NewAdjustmentPage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string; q?: string }>;
}) {
  const session = await requirePermission({ stock: ["adjust"] });
  const { variant: variantId, q = "" } = await searchParams;
  const seesCost = roleCan(session.user.role, { cost: ["read"] });
  const approver = roleCan(session.user.role, { stock: ["approve"] });

  if (!variantId && q.trim()) {
    // مسح باركود كامل يفتح الصنف مباشرة
    const exact = await findVariantByCode(q);
    if (exact) redirect(`/admin/stock/adjustments/new?variant=${exact}`);
  }
  const variant = variantId ? await adjustmentVariant(variantId, seesCost) : null;
  const hits = !variant && q.trim().length >= 2 ? await searchVariants(q) : [];

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/admin/stock/adjustments" className="text-sm text-muted-foreground hover:underline">
          التسويات ›
        </Link>
        <h1 className="font-display text-3xl font-bold">تسوية مخزون</h1>
        <p className="text-muted-foreground">تالف، منتهي الصلاحية، مفقود، استخدام داخلي، أو زيادة وُجدت.</p>
      </header>

      {variant ? (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{variant.label}</CardTitle>
                <CardDescription>
                  <bdi dir="ltr">{variant.sku}</bdi>
                </CardDescription>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/stock/adjustments/new">تغيير</Link>
              </Button>
            </div>
          </CardHeader>
          <AdjustmentForm
            variant={{
              variantId: variant.variantId,
              label: variant.label,
              unit: variant.unit,
              qty: variant.qty,
              ...(seesCost ? { hasCost: variant.hasCost } : {}),
            }}
            seesCost={seesCost}
            approver={approver}
          />
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>اختاري الصنف</CardTitle>
            <CardDescription>امسحي الباركود أو اكتبي جزءاً من الاسم.</CardDescription>
          </CardHeader>
          <form className="grid grid-cols-[1fr_auto] gap-2" role="search">
            <Input
              name="q"
              defaultValue={q}
              placeholder="الاسم أو الباركود أو SKU"
              aria-label="بحث عن صنف"
              autoFocus
              enterKeyHint="search"
            />
            <Button type="submit" variant="outline">
              <Search aria-hidden /> بحث
            </Button>
          </form>
          {q.trim().length >= 2 ? (
            hits.length ? (
              <ul className="divide-y divide-border">
                {hits.map((h) => (
                  <li key={h.variantId}>
                    <Link
                      href={`/admin/stock/adjustments/new?variant=${h.variantId}`}
                      className="flex min-h-12 items-center justify-between gap-3 py-2 hover:underline"
                    >
                      <span>{h.label}</span>
                      <bdi dir="ltr" className="text-sm text-muted-foreground">
                        {h.sku}
                      </bdi>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">لا توجد نتائج.</p>
            )
          ) : null}
        </Card>
      )}
    </div>
  );
}
