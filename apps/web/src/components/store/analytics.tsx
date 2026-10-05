"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { analyticsPath } from "@/lib/analytics";

type UmamiPayload = Record<string, unknown> & { url?: string; title?: string };
declare global {
  interface Window {
    umami?: {
      track: (eventOrProps?: string | ((props: UmamiPayload) => UmamiPayload), data?: Record<string, unknown>) => void;
    };
  }
}

/** حدث في القياس (D-108) — بلا بيانات شخصية. لا يفعل شيئاً إن لم يُحمَّل Umami. */
export function track(event: string, data?: Record<string, string | number>) {
  window.umami?.track(event, data);
}

/**
 * سكربت Umami بتتبّع يدوي: كل صفحة تُرسل برابط منظّف (رمز رابط الطلب مستبدل، بلا query) وبلا عنوان
 * الصفحة (فيه رقم الطلب). يحترم «عدم التتبّع» في المتصفح، ويُحمَّل بعد تفاعل الصفحة فلا يؤخّرها.
 */
export function Analytics({ src, websiteId }: { src: string; websiteId: string }) {
  const pathname = usePathname();
  const ready = useRef(false);

  const pageview = (path: string) =>
    window.umami?.track((props) => ({ ...props, url: analyticsPath(path), title: "" }));

  useEffect(() => {
    if (ready.current) pageview(pathname);
  }, [pathname]);

  return (
    <Script
      src={src}
      strategy="afterInteractive"
      data-website-id={websiteId}
      data-auto-track="false"
      data-do-not-track="true"
      onReady={() => {
        ready.current = true;
        pageview(window.location.pathname);
      }}
    />
  );
}
