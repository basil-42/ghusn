"use client";

import { useEffect } from "react";

/** تسجيل عامل الخدمة: يحفظ صفحة نقطة البيع وملفاتها لتفتح دون اتصال (D-82). */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // المتصفح لا يدعم أو الموقع ليس HTTPS — نقطة البيع تعمل متصلة فقط
    });
  }, []);
  return null;
}
