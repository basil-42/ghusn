import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/** زر تنزيل ملف Excel (D-117) — رابط عادي، فيعمل بلا جافاسكربت. */
export function ExportLink({ href, label = "تصدير Excel" }: { href: string; label?: string }) {
  return (
    <Button asChild variant="outline">
      <a href={href} download>
        <Download aria-hidden /> {label}
      </a>
    </Button>
  );
}

/** تصدير لفترة: من/إلى بأيام المحل ثم تنزيل. */
export function ExportRangeForm({ action, from, to }: { action: string; from: string; to: string }) {
  return (
    <form action={action} method="get" className="flex flex-wrap items-end gap-2" aria-label="تصدير لفترة">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">من</span>
        <input
          type="date"
          name="from"
          defaultValue={from}
          required
          className="min-h-11 rounded-xl border border-input bg-card px-3"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">إلى</span>
        <input
          type="date"
          name="to"
          defaultValue={to}
          required
          className="min-h-11 rounded-xl border border-input bg-card px-3"
        />
      </label>
      <Button type="submit" variant="outline">
        <Download aria-hidden /> تصدير Excel
      </Button>
    </form>
  );
}
