"use server";

import { requirePermission } from "@/lib/auth/session";
import { searchVariants } from "@/lib/shipments";
import { labelVariants } from "@/lib/stock";

export async function searchLabelVariantsAction(query: string) {
  await requirePermission({ product: ["read"] });
  const hits = await searchVariants(String(query).slice(0, 80));
  const details = await labelVariants(hits.map((h) => h.variantId));
  return hits.flatMap((h) => {
    const d = details.get(h.variantId);
    return d ? [{ variantId: h.variantId, ...d }] : [];
  });
}
