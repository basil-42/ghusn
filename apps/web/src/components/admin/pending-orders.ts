"use client";

import { useSyncExternalStore } from "react";

/** عدّاد «طلبات المتجر» في القائمة (D-109): يحدّثه استطلاع الجرس، وتقرؤه القائمة. */
let pending: number | null = null;
const listeners = new Set<() => void>();

export function setPendingOrders(n: number | null) {
  if (n === pending) return;
  pending = n;
  for (const l of listeners) l();
}

export function usePendingOrders(): number | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => pending,
    () => null,
  );
}
