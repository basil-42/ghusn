import { isSafeKey, storage } from "@/lib/storage";

/**
 * يقدّم الصور المخزّنة محلياً. المفاتيح مشتقة من محتوى الملف، لذلك تُخزَّن مؤقتاً للأبد.
 * عند النشر تُقدَّم من R2 عبر media.ghusn.store بدل هذا المسار.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const key = (await params).path.join("/");
  // «private/» (صور فواتير المصاريف) لا تُقدَّم من هنا — لها مسار يفحص الصلاحية
  if (!isSafeKey(key) || !key.endsWith(".webp") || key.startsWith("private/")) {
    return new Response("Not found", { status: 404 });
  }
  // المقاس المتوسط (D-101) يُولَّد للبانرات المرفوعة بعده فقط؛ صورة أقدم تُقدَّم بمقاسها الكبير
  const body =
    (await storage.get(key)) ??
    (key.endsWith("-800.webp") ? await storage.get(key.replace(/-800\.webp$/, "-1200.webp")) : null);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
