"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { formatAmount } from "@/lib/format";
import { MAX_LINE_QTY, MAX_ORDER_LINES, OrderError, createWebOrder, quoteCart } from "@/lib/orders";
import { imageUrl } from "@/lib/product-images";
import { SlidingWindowLimiter, clientIp } from "@/lib/rate-limit";

const items = z
  .array(z.object({ variantId: z.string().min(1).max(40), qty: z.number().int().min(1).max(MAX_LINE_QTY) }))
  .max(MAX_ORDER_LINES);

/** أسعار وتوفر السلة الآن (لا تكلفة ولا كميات). */
export async function quoteCartAction(locale: string, input: unknown) {
  const parsed = items.safeParse(input);
  if (!parsed.success) return { lines: [], totalSdg: "0", allAvailable: false };
  const q = await quoteCart(locale, parsed.data);
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
    return { ok: false, code: path === "address" ? "ADDRESS" : path === "customerName" ? "NAME" : "INVALID" };
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
