import { z } from "zod";
import { shareImageResponse, shareTagline, readImage } from "@/lib/share-image";
import { getProductShareInfo } from "@/lib/storefront";

export const dynamic = "force-dynamic";

const locale = z.enum(["ar", "en"]).catch("ar");

/** صورة معاينة رابط المنتج 1200×630 (D-126) — عامة: نفس ما تعرضه صفحة المنتج للزائر. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const l = locale.parse(url.searchParams.get("locale"));
  const p = await getProductShareInfo(l, id.slice(0, 40));
  if (!p) return new Response(null, { status: 404 });
  return shareImageResponse(
    {
      image: await readImage(p.imageFile),
      title: p.name,
      kicker: p.category.name,
      price: p.available ? p.priceLabel : l === "en" ? "Out of stock" : "نفد حالياً",
      tagline: shareTagline(l),
      locale: l,
    },
    url.searchParams.get("v") === p.version,
  );
}
