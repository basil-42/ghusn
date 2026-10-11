"use client";

import { Copy, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/**
 * رابط المنتج في المتجر للموظفة (D-126): نسخه أو إرساله على واتساب لعميلة تسأل. الرابط يحمل ref=staff
 * فتظهر زياراته في القياس منفصلة عن مشاركة العملاء.
 */
export function StoreLinkActions({ url, name }: { url: string; name: string }) {
  const link = `${url}${url.includes("?") ? "&" : "?"}ref=staff`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast("تم نسخ رابط المتجر.");
    } catch {
      window.prompt("رابط المنتج في المتجر", link);
    }
  }
  return (
    <>
      <Button type="button" variant="outline" onClick={copy}>
        <Copy aria-hidden /> نسخ رابط المتجر
      </Button>
      <Button asChild>
        <a href={`https://wa.me/?text=${encodeURIComponent(`${name}\n${link}`)}`} target="_blank" rel="noreferrer">
          <MessageCircle aria-hidden /> إرسال على واتساب
        </a>
      </Button>
    </>
  );
}
