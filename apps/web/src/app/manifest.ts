import type { MetadataRoute } from "next";

/** تطبيق نقطة البيع المثبّت على الجوال والتابلت (D-82). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "غصن — نقطة البيع",
    short_name: "غصن",
    description: "هدايا تُصنع لتُذكر",
    start_url: "/pos",
    scope: "/",
    display: "standalone",
    dir: "rtl",
    lang: "ar",
    background_color: "#F5F1E8",
    theme_color: "#2F3B2C",
    icons: [
      { src: "/brand/logo-ar-mark-forest.svg", sizes: "any", type: "image/svg+xml" },
      // PNG للشاشة الرئيسية وإشعارات الجوال (D-109) — رمز الهوية العاجي على أخضر الغابة
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
