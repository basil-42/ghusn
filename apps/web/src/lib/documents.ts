import { documentNumber, shopDay } from "@ghusn/core";
import type { Prisma } from "@ghusn/db";

/** الرقم التالي لمستند (SHP-2026-001، INV-2026-000001) — ذري حتى مع إدخال متزامن. */
export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  prefix: string,
  at: Date,
  digits = 3,
): Promise<string> {
  const year = Number(shopDay(at).slice(0, 4));
  const key = `${prefix}-${year}`;
  const [row] = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "DocumentCounter" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "DocumentCounter"."value" + 1
    RETURNING "value"`;
  if (!row) throw new Error("counter failed");
  return documentNumber(prefix, year, row.value, digits);
}
