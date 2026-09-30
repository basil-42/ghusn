"use client";

import { normalizeArabic, searchTerms } from "@ghusn/core";
import Dexie, { type EntityTable } from "dexie";
import type { ReceiptData } from "@/components/receipt";
import type { PosItem } from "@/lib/sales";
import type { ReceiptSettings } from "@/lib/settings";

/**
 * قاعدة الجهاز لنقطة البيع دون اتصال (D-82): نسخة من الكتالوج (بلا تكلفة) وطابور الفواتير
 * التي لم تصل الخادم بعد. كل ما فيها يخص الجهاز فقط ويُمسح بتسجيل الخروج.
 */

export type CatalogItem = PosItem & { searchText: string };

export interface OutboxSale {
  id: string;
  localNumber: string;
  createdAt: string;
  cashierId: string;
  /** جسم الطلب كما يُرسل إلى /api/v1/pos/sync. */
  payload: Record<string, unknown>;
  /** للإيصال المحلي. */
  receipt: ReceiptData;
  status: "pending" | "synced" | "failed";
  serverNumber?: string;
  error?: string;
  attempts: number;
}

interface Meta {
  key: string;
  value: unknown;
}

class PosDb extends Dexie {
  catalog!: EntityTable<CatalogItem, "variantId">;
  outbox!: EntityTable<OutboxSale, "id">;
  meta!: EntityTable<Meta, "key">;

  constructor() {
    super("ghusn-pos");
    this.version(1).stores({
      catalog: "variantId, barcode, sku",
      outbox: "id, status, createdAt",
      meta: "key",
    });
  }
}

export const posDb = new PosDb();

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await posDb.meta.get(key))?.value as T | undefined;
}
export async function setMeta(key: string, value: unknown): Promise<void> {
  await posDb.meta.put({ key, value });
}

export interface CatalogSnapshot {
  generatedAt: string;
  cashier: { id: string; name: string };
  maxDiscountPercent: number;
  receipt: ReceiptSettings;
  items: CatalogItem[];
}

/** تحديث نسخة الكتالوج من الخادم (عند الاتصال). */
export async function refreshCatalog(): Promise<CatalogSnapshot | null> {
  try {
    const res = await fetch("/api/v1/pos/catalog", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as CatalogSnapshot;
    await posDb.transaction("rw", posDb.catalog, posDb.meta, async () => {
      await posDb.catalog.clear();
      await posDb.catalog.bulkPut(data.items);
      await posDb.meta.bulkPut([
        { key: "catalogAt", value: data.generatedAt },
        { key: "cashier", value: data.cashier },
        { key: "maxDiscountPercent", value: data.maxDiscountPercent },
        { key: "receipt", value: data.receipt },
      ]);
    });
    return data;
  } catch {
    return null; // دون اتصال: تبقى النسخة السابقة
  }
}

/** بحث محلي: باركود أو SKU مطابق، وإلا بالاسم (بنفس توحيد الخادم للعربية). */
export async function searchCatalog(query: string): Promise<PosItem[]> {
  const q = query.trim();
  if (!q) return [];
  const exact =
    (await posDb.catalog.where("barcode").equals(q).first()) ??
    (await posDb.catalog.where("sku").equals(q.toUpperCase()).first());
  if (exact) return [exact];
  const terms = searchTerms(q);
  if (terms.length === 0) return [];
  const hits = await posDb.catalog
    .filter((item) => {
      const text = item.searchText || normalizeArabic(item.label);
      return terms.every((t) => text.includes(t));
    })
    .limit(12)
    .toArray();
  return hits;
}

/** رقم مؤقت للفاتورة دون اتصال: OFF-رمز الجهاز-تسلسل. */
export async function nextLocalNumber(): Promise<string> {
  return posDb.transaction("rw", posDb.meta, async () => {
    let device = await getMeta<string>("deviceCode");
    if (!device) {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      device = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => chars[b % chars.length]).join("");
      await setMeta("deviceCode", device);
    }
    const seq = ((await getMeta<number>("localSeq")) ?? 0) + 1;
    await setMeta("localSeq", seq);
    return `OFF-${device}-${String(seq).padStart(4, "0")}`;
  });
}

/** فواتير البائعة الحالية التي لم تصل الخادم (جهاز مشترك: فواتير غيرها تُرسل حين تدخل). */
export async function pendingCount(): Promise<number> {
  const cashier = await getMeta<{ id: string }>("cashier");
  if (!cashier) return 0;
  return posDb.outbox
    .where("status")
    .anyOf("pending", "failed")
    .filter((i) => i.cashierId === cashier.id)
    .count();
}

/**
 * إرسال الطابور بالترتيب. نفس المعرّف لا يتكرر على الخادم، فإعادة الإرسال آمنة.
 * يعيد عدد ما أُرسل، أو "auth" إن انتهت الجلسة.
 */
export async function flushOutbox(): Promise<number | "auth"> {
  // فواتير البائعة الحالية فقط: الخادم ينسب البيع لصاحبة الجلسة
  const cashier = await getMeta<{ id: string }>("cashier");
  if (!cashier) return 0;
  const items = (await posDb.outbox.where("status").anyOf("pending", "failed").sortBy("createdAt")).filter(
    (i) => i.cashierId === cashier.id,
  );
  let sent = 0;
  for (const item of items) {
    let res: Response;
    try {
      res = await fetch("/api/v1/pos/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload),
      });
    } catch {
      return sent; // انقطع الاتصال — نكمل لاحقاً
    }
    if (res.status === 401) return "auth";
    const body = (await res.json().catch(() => ({}))) as { number?: string; error?: string };
    if (res.ok && body.number) {
      await posDb.outbox.update(item.id, { status: "synced", serverNumber: body.number, error: undefined });
      sent += 1;
    } else {
      await posDb.outbox.update(item.id, {
        status: "failed",
        error: body.error ?? `HTTP ${res.status}`,
        attempts: item.attempts + 1,
      });
    }
  }
  // الاحتفاظ بآخر 50 فاتورة مُرسلة فقط (لإعادة طباعة الإيصال)
  const synced = await posDb.outbox.where("status").equals("synced").sortBy("createdAt");
  if (synced.length > 50) await posDb.outbox.bulkDelete(synced.slice(0, synced.length - 50).map((s) => s.id));
  return sent;
}
