import { Amiri, Cormorant_Garamond, IBM_Plex_Sans_Arabic } from "next/font/google";

// خطوط الهوية (brand-identity §3) — مشتركة بين قوالب الجذر (التشغيل والمتجر)
export const plex = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
});
export const amiri = Amiri({ subsets: ["arabic", "latin"], weight: ["400", "700"], variable: "--font-amiri" });
export const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-cormorant",
});
export const fontVariables = `${plex.variable} ${amiri.variable} ${cormorant.variable}`;
