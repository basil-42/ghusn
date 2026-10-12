"use client";

import { FileDown, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/**
 * تنزيل التقرير PDF (D-131): الخادم يصنع الملف من نفس الصفحة وينزّل مباشرة. إن تعذّر مولّد الخادم
 * تُفتح طباعة المتصفح («حفظ كـ PDF») كما كان (D-127).
 */
export function PrintButton({ label = "تنزيل PDF" }: { label?: string }) {
  const [pending, setPending] = useState(false);

  async function download() {
    setPending(true);
    try {
      const path = `${window.location.pathname}${window.location.search}`;
      const res = await fetch(`/admin/pdf?path=${encodeURIComponent(path)}`);
      if (res.status === 503) {
        window.print();
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "ghusn-report.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
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
    <Button type="button" variant="outline" onClick={download} disabled={pending}>
      {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <FileDown aria-hidden />}
      {pending ? "جارٍ تجهيز الملف…" : label}
    </Button>
  );
}
