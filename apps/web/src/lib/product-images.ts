import { createHash } from "node:crypto";
import { prisma } from "@ghusn/db";
import sharp, { type OutputInfo } from "sharp";
import { storage } from "./storage";
import { MAX_UPLOAD_BYTES } from "./client-image";

export const MAX_IMAGES_PER_PRODUCT = 12;
export { MAX_UPLOAD_BYTES };
const MAX_PIXELS = 50_000_000; // حماية من صور ضخمة مصمَّمة لاستهلاك الذاكرة

/** مقاسات WebP المولَّدة: كبيرة للعرض والمتجر، وصغيرة للقوائم (§2.2: صفحات خفيفة على 3G). */
export const IMAGE_SIZES = { full: 1200, thumb: 400 } as const;
export type ImageSize = keyof typeof IMAGE_SIZES;

export const imageFileKey = (key: string, size: ImageSize) => `${key}-${IMAGE_SIZES[size]}.webp`;
export const imageUrl = (key: string, size: ImageSize) => `/media/${imageFileKey(key, size)}`;

export class ImageError extends Error {}

/** WebP بمقاسين (1200/400) بعد تصحيح الاتجاه وحذف البيانات الوصفية، ثم الحفظ تحت المفتاح. */
async function renderAndStore(input: Buffer, key: string): Promise<{ width: number; height: number }> {
  let full: { data: Buffer; info: OutputInfo };
  let thumb: Buffer;
  try {
    const base = sharp(input, { limitInputPixels: MAX_PIXELS, failOn: "error" }).rotate();
    full = await base
      .clone()
      .resize({ width: IMAGE_SIZES.full, height: IMAGE_SIZES.full, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    thumb = await base
      .clone()
      .resize({ width: IMAGE_SIZES.thumb, height: IMAGE_SIZES.thumb, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
  } catch {
    throw new ImageError("تعذّرت قراءة الصورة. استخدمي صورة JPG أو PNG أو WebP.");
  }
  await storage.put(imageFileKey(key, "full"), full.data, "image/webp");
  await storage.put(imageFileKey(key, "thumb"), thumb, "image/webp");
  return { width: full.info.width, height: full.info.height };
}

/** صورة عامة لغير المنتجات (مثل المناسبات) بنفس المعالجة؛ المفتاح من المحتوى. */
export async function savePublicImage(file: File, prefix: string): Promise<string> {
  if (file.size === 0) throw new ImageError("الملف فارغ.");
  if (file.size > MAX_UPLOAD_BYTES) throw new ImageError("الصورة أكبر من 10 ميغابايت.");
  const input = Buffer.from(await file.arrayBuffer());
  const key = `${prefix}/${createHash("sha256").update(input).digest("hex").slice(0, 20)}`;
  await renderAndStore(input, key);
  return key;
}

/**
 * يعالج صورة مرفوعة: يصحّح الاتجاه (EXIF)، يزيل البيانات الوصفية (الموقع…)، ويحوّلها لـ WebP بمقاسين.
 * المفتاح مشتق من محتوى الملف ← نفس الصورة مرتين لا تُكرَّر، والروابط قابلة للتخزين المؤقت للأبد.
 */
export async function addProductImage(productId: string, file: File): Promise<void> {
  if (file.size === 0) throw new ImageError("الملف فارغ.");
  if (file.size > MAX_UPLOAD_BYTES) throw new ImageError("الصورة أكبر من 10 ميغابايت.");

  const count = await prisma.productImage.count({ where: { productId } });
  if (count >= MAX_IMAGES_PER_PRODUCT) throw new ImageError(`الحد الأقصى ${MAX_IMAGES_PER_PRODUCT} صورة للمنتج.`);

  const input = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(input).digest("hex").slice(0, 20);
  const key = `products/${productId}/${hash}`;
  if (await prisma.productImage.findUnique({ where: { key } })) throw new ImageError("هذه الصورة مضافة من قبل.");

  const full = await renderAndStore(input, key);
  try {
    await prisma.productImage.create({
      data: { productId, key, width: full.width, height: full.height, sortOrder: count },
    });
  } catch (error) {
    await deleteFiles(key);
    throw error;
  }
}

async function deleteFiles(key: string) {
  await Promise.all([storage.delete(imageFileKey(key, "full")), storage.delete(imageFileKey(key, "thumb"))]);
}

export async function deleteProductImage(productId: string, imageId: string): Promise<void> {
  const image = await prisma.productImage.findFirst({ where: { id: imageId, productId } });
  if (!image) return;
  await prisma.productImage.delete({ where: { id: image.id } });
  await deleteFiles(image.key);
  await normalizeOrder(productId);
}

/** يجعل الصورة رئيسية (الأولى) ويعيد ترقيم البقية. */
export async function makeMainImage(productId: string, imageId: string): Promise<void> {
  const images = await prisma.productImage.findMany({ where: { productId }, orderBy: { sortOrder: "asc" } });
  const ordered = [...images.filter((i) => i.id === imageId), ...images.filter((i) => i.id !== imageId)];
  await prisma.$transaction(
    ordered.map((img, i) => prisma.productImage.update({ where: { id: img.id }, data: { sortOrder: i } })),
  );
}

async function normalizeOrder(productId: string) {
  const images = await prisma.productImage.findMany({ where: { productId }, orderBy: { sortOrder: "asc" } });
  await prisma.$transaction(
    images.map((img, i) => prisma.productImage.update({ where: { id: img.id }, data: { sortOrder: i } })),
  );
}
