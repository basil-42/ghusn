import type { Metadata } from "next";
import Link from "next/link";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = { title: "الصفحة غير موجودة | غصن" };

/** 404 للروابط التي لا تطابق أي مسار (قالبا التشغيل والمتجر منفصلان). */
export default function GlobalNotFound() {
  return (
    <html lang="ar" dir="rtl" className={fontVariables}>
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center font-sans antialiased">
        <h1 className="font-display text-4xl font-bold">الصفحة غير موجودة</h1>
        <p className="text-muted-foreground">ربما نُقلت أو لم تعد متوفرة.</p>
        <Link href="/" className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground">
          العودة إلى الرئيسية
        </Link>
      </body>
    </html>
  );
}
