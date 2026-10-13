"use client";

import { usePathname } from "next/navigation";

/** يخفي محتواه في مسارات بعينها — مثل شريط سعر الجنيه في الرئيسية حيث يظهر شارةً (D-136). */
export function HideOn({ paths, children }: { paths: string[]; children: React.ReactNode }) {
  const pathname = usePathname();
  return paths.includes(pathname) ? null : <>{children}</>;
}
