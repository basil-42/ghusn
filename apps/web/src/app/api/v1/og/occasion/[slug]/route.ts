import { z } from "zod";
import { shareImageResponse, shareTagline, readImage } from "@/lib/share-image";
import { getOccasionShareInfo } from "@/lib/storefront";

export const dynamic = "force-dynamic";

const locale = z.enum(["ar", "en"]).catch("ar");

/** صورة معاينة رابط المناسبة (D-126): الغلاف والاسم، بلا سعر. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(request.url);
  const l = locale.parse(url.searchParams.get("locale"));
  const o = await getOccasionShareInfo(l, slug.slice(0, 80));
  if (!o) return new Response(null, { status: 404 });
  return shareImageResponse(
    {
      image: await readImage(o.imageFile),
      title: o.name,
      kicker: l === "en" ? "Gifts for the occasion" : "هدايا المناسبة",
      price: null,
      tagline: shareTagline(l),
      locale: l,
    },
    url.searchParams.get("v") === o.version,
  );
}
