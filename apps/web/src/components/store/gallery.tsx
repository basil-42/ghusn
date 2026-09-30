"use client";

import Image from "next/image";
import { useState } from "react";

export type GalleryImage = { full: string; thumb: string; width: number; height: number };

/** صور المنتج: الصورة الكبيرة وصور مصغّرة للتبديل. */
export function Gallery({ images, alt, emptyLabel }: { images: GalleryImage[]; alt: string; emptyLabel: string }) {
  const [active, setActive] = useState(0);
  const current = images[active] ?? images[0];
  if (!current) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-2xl bg-muted">
        <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
          <Image src="/brand/mark-sage.svg" alt="" width={72} height={72} className="opacity-40" />
          {emptyLabel}
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
        <Image
          src={current.full}
          alt={alt}
          fill
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-cover"
          priority
          unoptimized
        />
      </div>
      {images.length > 1 ? (
        <ul className="flex gap-2 overflow-x-auto">
          {images.map((img, i) => (
            <li key={img.thumb} className="shrink-0">
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`${alt} ${i + 1}`}
                aria-current={i === active}
                className={`relative block size-16 overflow-hidden rounded-xl border-2 ${i === active ? "border-forest" : "border-transparent"}`}
              >
                <Image src={img.thumb} alt="" fill sizes="64px" className="object-cover" unoptimized />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
