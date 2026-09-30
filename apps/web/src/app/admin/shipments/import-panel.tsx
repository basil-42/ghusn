"use client";

import { plainNumber } from "@ghusn/core";
import { FileSpreadsheet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { applyImportAction, previewImportAction, type ImportResult } from "./actions";

/**
 * استيراد بنود من Excel (D-85): تنزيل القالب ← رفع ← معاينة (بلا كتابة) ← استيراد.
 * الخادم يعيد قراءة الملف نفسه عند الاستيراد ويتحقق من جديد.
 */
export function ImportPanel({ id, currencySymbol }: { id: string; currencySymbol: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult>({});
  const [pending, startTransition] = useTransition();
  // بعد الاستيراد: حقل ملف جديد فارغ (لا يبقى اسم الملف القديم ظاهراً وزر المعاينة معطّلاً)
  const [inputKey, setInputKey] = useState(0);
  const form = () => {
    const data = new FormData();
    if (file) data.set("file", file);
    return data;
  };
  const preview = result.preview;

  return (
    <details className="rounded-xl border border-border p-3">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold">
        <FileSpreadsheet aria-hidden className="size-5" /> استيراد البنود من Excel
      </summary>
      <div className="flex flex-col gap-3 pt-3">
        <p className="text-sm text-muted-foreground">
          للشحنات الكبيرة: نزّلي القالب، املئي صفاً لكل صنف (الكمية وسعر الشراء بـ {currencySymbol})، ثم ارفعيه. الأصناف
          الجديدة تُنشأ في الكتالوج تلقائياً (غير ظاهرة في المتجر حتى تكمّلي صورها).
        </p>
        <a href="/admin/shipments/import-template" className="self-start text-sm font-semibold underline" download>
          تنزيل القالب
        </a>
        <input
          key={inputKey}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="ملف Excel"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult({});
          }}
          className="min-h-11 rounded-xl border border-input bg-card p-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!file || pending}
            onClick={() => startTransition(async () => setResult(await previewImportAction(id, form())))}
          >
            معاينة
          </Button>
          {preview && preview.errors.length === 0 && preview.lines.length ? (
            <Button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await applyImportAction(id, form());
                  setResult(r);
                  if (r.imported) {
                    setFile(null);
                    setInputKey((k) => k + 1);
                    router.refresh();
                  }
                })
              }
            >
              {pending ? "جارٍ الاستيراد…" : `استيراد ${preview.lines.length} بنداً`}
            </Button>
          ) : null}
        </div>

        {result.error ? <Alert variant="destructive">{result.error}</Alert> : null}
        {result.imported ? <Alert variant="success">تم استيراد {result.imported} بنداً.</Alert> : null}
        {preview ? (
          <div className="flex flex-col gap-2">
            {preview.errors.length ? (
              <Alert variant="destructive">
                <p className="font-semibold">صحّحي الملف ثم عاينيه من جديد — لم يُكتب شيء:</p>
                <ul className="list-disc ps-5">
                  {preview.errors.map((e, i) => (
                    <li key={i}>{e.row ? `الصف ${e.row}: ${e.message}` : e.message}</li>
                  ))}
                </ul>
              </Alert>
            ) : (
              <p className="text-sm font-semibold">
                {preview.lines.length} بنداً — منها {preview.newVariants} صنفاً جديداً في {preview.newProducts} منتجاً.
              </p>
            )}
            {preview.lines.length ? (
              <ul className="max-h-72 overflow-auto rounded-xl border border-border text-sm">
                {preview.lines.map((l) => (
                  <li key={l.row} className="flex justify-between gap-2 border-b border-border px-3 py-2 last:border-0">
                    <span className="min-w-0">
                      <span className="text-muted-foreground">{l.row}.</span> {l.label}
                      {l.isNew ? <span className="ms-1 text-xs font-bold text-primary">جديد</span> : null}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {plainNumber(l.qty)} × {plainNumber(l.unitPrice)} {currencySymbol}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </details>
  );
}
