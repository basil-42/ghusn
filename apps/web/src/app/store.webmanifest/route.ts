/**
 * المتجر كتطبيق على هاتف العميل (D-153): «إضافة إلى الشاشة الرئيسية» تضع أيقونة غصن وتفتح المتجر
 * بملء الشاشة — بلا متجر تطبيقات. منفصل عن تطبيق التشغيل (/pos.webmanifest).
 */
export function GET() {
  return Response.json(
    {
      id: "/",
      name: "غصن | GHUSN",
      short_name: "غصن",
      description: "هدايا تُصنع لتُذكر",
      start_url: "/",
      scope: "/",
      display: "standalone",
      dir: "rtl",
      lang: "ar",
      background_color: "#F5F1E8",
      theme_color: "#2F3B2C",
      icons: [
        { src: "/brand/logo-ar-mark-forest.svg", sizes: "any", type: "image/svg+xml" },
        { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
