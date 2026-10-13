"use client";

import { FileDown, LoaderCircle, Printer } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

type Pdf = { blob: Blob; name: string } | "fallback";

/** الخادم يصنع PDF من صفحة التقرير الحالية (D-131)؛ 503 = لا مولّد ← طباعة المتصفح. */
async function fetchPdf(): Promise<Pdf> {
  const path = `${window.location.pathname}${window.location.search}`;
  const res = await fetch(`/admin/pdf?path=${encodeURIComponent(path)}`);
  if (res.status === 503) return "fallback";
  if (!res.ok) throw new Error(String(res.status));
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "ghusn-report.pdf";
  return { blob: await res.blob(), name };
}

/**
 * «تنزيل PDF» و«طباعة» للتقارير (D-131): نفس المحتوى في الاثنين — الخادم يصنع الملف من صفحة التقرير
 * بتنسيق الطباعة نفسه (رأس الشعار والفترة، A4، تذييل الصفحات) الذي تستخدمه طباعة المتصفح. إن تعذّر مولّد
 * الخادم يطبع زر التنزيل أيضاً (D-127).
 */
export function PrintButton() {
  const [pending, setPending] = useState(false);

  async function download() {
    setPending(true);
    try {
      const pdf = await fetchPdf();
      if (pdf === "fallback") return window.print();
      const url = URL.createObjectURL(pdf.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = pdf.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast("تعذّر تجهيز الملف — جرّبي مرة أخرى.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={download} disabled={pending}>
        {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <FileDown aria-hidden />}
        {pending ? "جارٍ التجهيز…" : "تنزيل PDF"}
      </Button>
      <Button type="button" variant="outline" onClick={() => window.print()}>
        <Printer aria-hidden /> طباعة
      </Button>
    </>
  );
}
