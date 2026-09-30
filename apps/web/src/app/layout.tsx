import type { Metadata } from "next";
import { Amiri, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";

const plex = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
});
const amiri = Amiri({ subsets: ["arabic", "latin"], weight: ["400", "700"], variable: "--font-amiri" });

export const metadata: Metadata = {
  title: "غصن | GHUSN",
  description: "هدايا تُصنع لتُذكر",
};

/**
 * في التطوير فقط: عامل خدمة نقطة البيع (D-82) من نسخة سابقة يقدّم ملفات `/_next/static` القديمة
 * (أسماؤها ثابتة في التطوير) فينكسر العرض قبل أي كود React. هذا السكربت يعمل قبل ملفات التطبيق:
 * إن وُجد عامل يتحكم في الصفحة يُلغى وتُمسح ذاكرته ثم تُعاد الصفحة مرة واحدة.
 */
const DEV_SW_CLEANUP = `(function(){var s=navigator.serviceWorker;if(!s||!s.controller)return;
s.getRegistrations().then(function(r){return Promise.all(r.map(function(x){return x.unregister()}))})
.then(function(){return window.caches?caches.keys():[]})
.then(function(k){return Promise.all(k.filter(function(n){return n.indexOf("ghusn-pos-")===0}).map(function(n){return caches.delete(n)}))})
.then(function(){location.reload()});})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${plex.variable} ${amiri.variable}`}>
      <body className="font-sans antialiased">
        {process.env.NODE_ENV !== "production" ? <script dangerouslySetInnerHTML={{ __html: DEV_SW_CLEANUP }} /> : null}
        {children}
      </body>
    </html>
  );
}
