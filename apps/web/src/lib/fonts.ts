import { Amiri, IBM_Plex_Sans_Arabic } from "next/font/google";
import localFont from "next/font/local";

// خطوط الهوية (brand-identity §3) — مشتركة بين قوالب الجذر (التشغيل والمتجر)
export const plex = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
});
export const amiri = Amiri({ subsets: ["arabic", "latin"], weight: ["400", "700"], variable: "--font-amiri" });
// عناوين الإنجليزي: ملفات محلية (OFL، من Fontsource) — تنزيلها من Google أثناء البناء يفشل في CI
export const cormorant = localFont({
  src: [
    { path: "../fonts/cormorant-garamond/cormorant-garamond-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/cormorant-garamond/cormorant-garamond-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../fonts/cormorant-garamond/cormorant-garamond-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-cormorant",
  display: "swap",
});
export const fontVariables = `${plex.variable} ${amiri.variable} ${cormorant.variable}`;
