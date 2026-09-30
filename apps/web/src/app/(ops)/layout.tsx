import type { Metadata } from "next";
import { DevServiceWorkerCleanup } from "@/components/dev-sw-cleanup";
import { fontVariables } from "@/lib/fonts";
import "../globals.css";

export const metadata: Metadata = {
  title: "غصن | GHUSN",
  description: "هدايا تُصنع لتُذكر",
  robots: { index: false, follow: false },
};

/** قالب التشغيل (الإدارة، نقطة البيع، الدخول، الطباعة): عربي دائماً. المتجر له قالبه في [locale]. */
export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={fontVariables}>
      <body className="font-sans antialiased">
        <DevServiceWorkerCleanup />
        {children}
      </body>
    </html>
  );
}
