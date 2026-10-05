"use client";

import { useEffect } from "react";
import { markOrderOpenedAction } from "../actions";

/**
 * يسجّل فتح الطلب عند العرض الفعلي فقط — لا عند التحميل المسبق للروابط (D-109).
 */
export function MarkOrderOpened({ orderId }: { orderId: string }) {
  useEffect(() => {
    void markOrderOpenedAction(orderId);
  }, [orderId]);
  return null;
}
