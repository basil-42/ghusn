"use client";

import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/** تنزيل التقرير PDF (D-127): طباعة المتصفح، ومنها «حفظ كـ PDF» — نفس الصفحة بتنسيق A4. */
export function PrintButton({ label = "PDF / طباعة" }: { label?: string }) {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()}>
      <FileDown aria-hidden /> {label}
    </Button>
  );
}
