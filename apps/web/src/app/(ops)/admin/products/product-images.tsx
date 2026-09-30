"use client";

import { ImagePlus, Star, Trash2 } from "lucide-react";
import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteProductImageAction, makeMainImageAction, uploadProductImage } from "./image-actions";

export interface ProductImageView {
  id: string;
  thumbUrl: string;
  fullUrl: string;
}

const MAX_EDGE = 2000;

/**
 * تصغير الصورة في المتصفح قبل الرفع (صورة جوال 5MB ← حوالي 0.5MB) — مهم على شبكات السودان البطيئة.
 * إن فشل (صيغة لا يدعمها المتصفح) تُرفع الأصلية ويعالجها الخادم.
 */
async function shrink(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
    return blob && blob.size < file.size ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

export function ProductImages({
  productId,
  images,
  canEdit,
  max,
}: {
  productId: string;
  images: ProductImageView[];
  canEdit: boolean;
  max: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  async function upload(files: FileList) {
    const list = Array.from(files).slice(0, Math.max(0, max - images.length));
    const failed: string[] = [];
    for (const [i, original] of list.entries()) {
      setProgress(`جارٍ رفع الصورة ${i + 1} من ${list.length}…`);
      const data = new FormData();
      data.append("file", await shrink(original));
      const result = await uploadProductImage(productId, data);
      if (result.error) failed.push(`${original.name}: ${result.error}`);
    }
    if (files.length > list.length) failed.push(`الحد الأقصى ${max} صورة للمنتج.`);
    setErrors(failed);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">الصور</h2>
          <p className="text-sm text-muted-foreground">
            الأولى هي الرئيسية (تظهر في القوائم والمتجر). {images.length} / {max}
          </p>
        </div>
        {canEdit && images.length < max ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              id="product-images"
              onChange={(e) => e.target.files?.length && startTransition(() => upload(e.target.files!))}
            />
            <Button type="button" variant="outline" disabled={pending} onClick={() => inputRef.current?.click()}>
              <ImagePlus aria-hidden /> إضافة صور
            </Button>
          </>
        ) : null}
      </div>

      {progress ? <Alert>{progress}</Alert> : null}
      {errors.length ? (
        <Alert variant="destructive">
          <ul className="flex flex-col gap-1">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {images.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
          لا توجد صور بعد.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((img, i) => (
            <li key={img.id} className="flex flex-col gap-2">
              <a
                href={img.fullUrl}
                target="_blank"
                rel="noreferrer"
                className="relative block overflow-hidden rounded-xl border border-border bg-muted"
              >
                <Image
                  src={img.thumbUrl}
                  alt=""
                  width={400}
                  height={400}
                  unoptimized
                  className="aspect-square w-full object-cover"
                />
                {i === 0 ? (
                  <Badge variant="success" className="absolute start-2 top-2 bg-card">
                    الرئيسية
                  </Badge>
                ) : null}
              </a>
              {canEdit ? (
                <div className="flex gap-1">
                  {i > 0 ? (
                    <form action={makeMainImageAction} className="flex-1">
                      <input type="hidden" name="productId" value={productId} />
                      <input type="hidden" name="imageId" value={img.id} />
                      <Button type="submit" variant="ghost" size="sm" className="w-full" title="اجعليها الرئيسية">
                        <Star aria-hidden /> رئيسية
                      </Button>
                    </form>
                  ) : null}
                  <form
                    action={deleteProductImageAction}
                    className={i > 0 ? "" : "flex-1"}
                    onSubmit={(e) => {
                      if (!window.confirm("حذف هذه الصورة؟")) e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="productId" value={productId} />
                    <input type="hidden" name="imageId" value={img.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      className="w-full text-destructive"
                      aria-label="حذف الصورة"
                    >
                      <Trash2 aria-hidden />
                      {i > 0 ? null : "حذف"}
                    </Button>
                  </form>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
