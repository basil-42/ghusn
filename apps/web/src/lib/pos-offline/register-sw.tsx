"use client";

import { useEffect } from "react";

/**
 * تسجيل عامل الخدمة: يحفظ صفحة نقطة البيع وملفاتها لتفتح دون اتصال (D-82).
 * في التطوير لا يُسجَّل، ويُزال أي عامل سابق وذاكرته: ملفات `/_next/static` هناك بأسماء ثابتة
 * (بلا بصمة محتوى)، فالتخزين «المخزّن أولاً» يُبقي المتصفح على كود قديم بعد كل تعديل.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      void (async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister()));
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.startsWith("ghusn-pos-")).map((k) => caches.delete(k)));
      })().catch(() => {});
      return;
    }
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // المتصفح لا يدعم أو الموقع ليس HTTPS — نقطة البيع تعمل متصلة فقط
    });
  }, []);
  return null;
}
