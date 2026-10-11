import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// صفحات المتجر الخاصة بالعميل (بالعربية وتحت /en) — لا تُفهرس
const STORE_PRIVATE = ["/o/", "/cart", "/checkout", "/search", "/track"];

/** المتجر يُفهرس؛ الإدارة ونقطة البيع والطلبات والسلة والبحث لا (D-93). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // صور معاينة الروابط (D-126): زواحف فيسبوك وغيرها تحترم robots — مسموحة رغم منع /api/
        allow: ["/", "/api/v1/og/"],
        disallow: [
          "/admin",
          "/pos",
          "/print",
          "/login",
          "/api/",
          ...STORE_PRIVATE,
          ...STORE_PRIVATE.map((p) => `/en${p}`),
        ],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
