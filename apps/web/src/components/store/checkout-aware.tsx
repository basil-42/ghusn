"use client";

import { usePathname } from "@/i18n/navigation";

/**
 * صفحة إتمام الطلب بلا مشتتات (D-159): الرأس والتذييل الكاملان (البحث، الأقسام، القائمة، الروابط) يُستبدلان
 * بنسخة مختصرة في /checkout فقط — كل رابط فيهما طريق للخروج قبل تأكيد الطلب.
 */
export function CheckoutAware({ checkout, children }: { checkout: React.ReactNode; children: React.ReactNode }) {
  return usePathname() === "/checkout" ? checkout : children;
}
