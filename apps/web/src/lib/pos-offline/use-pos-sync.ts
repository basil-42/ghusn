"use client";

import { useCallback, useEffect, useState } from "react";
import { flushOutbox, pendingCount, refreshCatalog } from "./db";

/**
 * حالة الاتصال والطابور لنقطة البيع: يحدّث الكتالوج ويرسل الفواتير المعلّقة عند الاتصال،
 * وكل 30 ثانية، وعند عودة الشبكة.
 */
export function usePosSync() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      if (navigator.onLine) {
        // الكتالوج أولاً: يحدّد البائعة الحالية التي تُرسل فواتيرها
        await refreshCatalog();
        const sent = await flushOutbox();
        setNeedsLogin(sent === "auth");
      }
      setPending(await pendingCount());
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void sync();
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const timer = window.setInterval(() => void sync(), 30_000);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.clearInterval(timer);
    };
  }, [sync]);

  return { online, pending, needsLogin, syncing, sync, setPending };
}
