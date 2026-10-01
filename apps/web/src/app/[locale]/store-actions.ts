"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { CARD_MESSAGE_MAX } from "@ghusn/core";
import { z } from "zod";
import { formatAmount } from "@/lib/format";
import {
  MAX_LINE_QTY,
  MAX_ORDER_LINES,
  OrderError,
  createWebOrder,
  decideGiftPhoto,
  quoteCart,
  submitPaymentProof,
} from "@/lib/orders";
import { imageUrl } from "@/lib/product-images";
import { SlidingWindowLimiter, clientIp } from "@/lib/rate-limit";

const items = z
  .array(z.object({ variantId: z.string().min(1).max(40), qty: z.number().int().min(1).max(MAX_LINE_QTY) }))
  .max(MAX_ORDER_LINES);

const wrapId = z.string().min(1).max(40).nullable();

/** أسعار وتوفر السلة الآن (لا تكلفة ولا كميات)، مع سعر التغليف المختار إن وُجد. */
export async function quoteCartAction(locale: string, input: unknown, wrapStyleId: unknown = null) {
  const parsed = items.safeParse(input);
  const wrap = wrapId.safeParse(wrapStyleId);
  if (!parsed.success) return { lines: [], subtotalSdg: "0", wrap: null, totalSdg: "0", allAvailable: false };
  const q = await quoteCart(locale, parsed.data, wrap.success ? wrap.data : null);
  return {
    ...q,
    lines: q.lines.map(({ imageKey, ...l }) => ({ ...l, imageUrl: imageKey ? imageUrl(imageKey, "thumb") : null })),
  };
}

const orderSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]{20,32}$/),
    locale: z.enum(["ar", "en"]),
    customerName: z.string().trim().min(2).max(80),
    phone: z.string().trim().min(6).max(20),
    fulfillment: z.enum(["DELIVERY", "PICKUP"]),
    city: z.enum(["KHARTOUM", "BAHRI", "OMDURMAN"]).nullable(),
    address: z.string().trim().max(300).nullable(),
    recipientName: z.string().trim().max(80).nullable(),
    recipientPhone: z.string().trim().max(20).nullable(),
    note: z.string().trim().max(300).nullable(),
    payment: z.enum(["ON_RECEIPT", "BANKAK"]),
    wrapStyleId: wrapId,
    cardMessage: z.string().trim().max(CARD_MESSAGE_MAX).nullable(),
    items,
    expectedTotalSdg: z.string().regex(/^\d{1,12}$/),
  })
  .refine((o) => o.fulfillment === "PICKUP" || (o.city && (o.address?.length ?? 0) >= 5), { path: ["address"] });

export type OrderResult =
  { ok: true; number: string; trackingToken: string } | { ok: false; code: string; params?: Record<string, string> };

// حماية من الإغراق: 5 طلبات لكل عنوان خلال 10 دقائق (خادم واحد — D-31)
const limiter = new SlidingWindowLimiter(5, 10 * 60 * 1000);

export async function createOrderAction(input: unknown): Promise<OrderResult> {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path[0];
    const code =
      path === "address"
        ? "ADDRESS"
        : path === "customerName"
          ? "NAME"
          : path === "cardMessage"
            ? "CARD_TOO_LONG"
            : "INVALID";
    return { ok: false, code };
  }
  const ip = clientIp(await headers());
  if (limiter.isLimited(ip)) return { ok: false, code: "RATE_LIMIT" };
  const blank = (v: string | null) => v || null;
  try {
    const r = await createWebOrder({
      ...parsed.data,
      address: blank(parsed.data.address),
      recipientName: blank(parsed.data.recipientName),
      recipientPhone: blank(parsed.data.recipientPhone),
      note: blank(parsed.data.note),
      cardMessage: blank(parsed.data.cardMessage),
    });
    limiter.hit(ip);
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof OrderError) {
      // المبالغ في الرسائل بفاصل الآلاف (185,000)
      const params = Object.fromEntries(
        Object.entries(e.params).map(([k, v]) => [k, k === "total" || k === "limit" ? formatAmount(v, 0) : v]),
      );
      return { ok: false, code: e.code, params };
    }
    throw e;
  }
}

export type ProofResult = { ok: true } | { ok: false; code: string };

const proofLimiter = new SlidingWindowLimiter(10, 10 * 60 * 1000);

/** إشعار بنكك من صفحة المتابعة (D-90): الرابط السرّي يكفي للتعريف، وحد للإغراق لكل عنوان. */
export async function submitProofAction(_prev: ProofResult | null, formData: FormData): Promise<ProofResult> {
  const token = String(formData.get("token") ?? "");
  const reference = String(formData.get("reference") ?? "");
  const image = formData.get("image");
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return { ok: false, code: "PAYMENT_CLOSED" };
  if (!(image instanceof File) || image.size === 0) return { ok: false, code: "IMAGE_REQUIRED" };
  const ip = clientIp(await headers());
  if (proofLimiter.isLimited(ip)) return { ok: false, code: "RATE_LIMIT" };
  proofLimiter.hit(ip);
  try {
    await submitPaymentProof(token, image, reference);
  } catch (e) {
    if (e instanceof OrderError) return { ok: false, code: e.code };
    throw e;
  }
  revalidatePath("/[locale]/o/[token]", "page");
  return { ok: true };
}

const photoLimiter = new SlidingWindowLimiter(20, 10 * 60 * 1000);

/** قرار العميل على صورة الهدية (D-13): موافقة، أو تعديل بملاحظة. */
export async function decidePhotoAction(_prev: ProofResult | null, formData: FormData): Promise<ProofResult> {
  const token = String(formData.get("token") ?? "");
  const photoId = String(formData.get("photoId") ?? "");
  const approve = formData.get("decision") === "approve";
  const feedback = String(formData.get("feedback") ?? "");
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token) || !/^[a-z0-9]{10,40}$/.test(photoId)) {
    return { ok: false, code: "PHOTO_CLOSED" };
  }
  if (!approve && feedback.trim().length < 2) return { ok: false, code: "FEEDBACK_REQUIRED" };
  const ip = clientIp(await headers());
  if (photoLimiter.isLimited(ip)) return { ok: false, code: "RATE_LIMIT" };
  photoLimiter.hit(ip);
  try {
    await decideGiftPhoto(token, photoId, approve, feedback);
  } catch (e) {
    if (e instanceof OrderError) return { ok: false, code: e.code };
    throw e;
  }
  return { ok: true };
}
