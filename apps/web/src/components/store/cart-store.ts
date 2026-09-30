"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * السلة في متصفح العميل (localStorage): المعرّف والكمية فقط. الأسعار والتوفر من الخادم دائماً
 * (quoteCart)، والطلب يُعاد حسابه كاملاً عند الإرسال.
 */
export type CartItem = { variantId: string; qty: number };

const KEY = "ghusn-cart-v1";
const EVENT = "ghusn-cart";
export const MAX_QTY = 20;

const snapshot = () => {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
};

function parse(raw: string): CartItem[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is CartItem => typeof x?.variantId === "string" && Number.isInteger(x?.qty) && x.qty > 0)
      .slice(0, 30);
  } catch {
    return [];
  }
}

const read = (): CartItem[] => parse(snapshot());

function write(items: CartItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // وضع التصفح الخاص أو امتلاء التخزين — السلة تعمل حتى إعادة التحميل فقط
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useCart(): CartItem[] {
  // أثناء الـ hydration تُستخدم لقطة الخادم («[]») ثم القيمة الحقيقية — لا اختلاف بين الخادم والمتصفح
  const raw = useSyncExternalStore(subscribe, snapshot, () => "[]");
  return useMemo(() => parse(raw), [raw]);
}

export function addToCart(variantId: string, qty: number) {
  const items = read();
  const found = items.find((i) => i.variantId === variantId);
  if (found) found.qty = Math.min(MAX_QTY, found.qty + qty);
  else items.push({ variantId, qty: Math.min(MAX_QTY, qty) });
  write(items);
}

export function setCartQty(variantId: string, qty: number) {
  write(
    read()
      .map((i) => (i.variantId === variantId ? { ...i, qty: Math.max(1, Math.min(MAX_QTY, qty)) } : i))
      .filter((i) => i.qty > 0),
  );
}

export function removeFromCart(variantId: string) {
  write(read().filter((i) => i.variantId !== variantId));
}

/** يبقي في السلة ما يعرضه المتجر فقط (أصناف أُخفيت أو حُذفت تُسقط). */
export function keepOnly(variantIds: string[]) {
  const keep = new Set(variantIds);
  const items = read();
  const next = items.filter((i) => keep.has(i.variantId));
  if (next.length !== items.length) write(next);
}

export function clearCart() {
  write([]);
}

const noop = () => () => {};
/** صحيحة بعد الـ hydration فقط — لعرض «جارٍ التحميل» بدل «السلة فارغة» قبل قراءة السلة. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
