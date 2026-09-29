/**
 * الباركود: التحقق من باركودات المصانع، وتوليد باركود داخلي للأصناف التي بلا باركود.
 * الداخلي EAN-13 يبدأ بـ 200 — نطاق GS1 المخصص للاستخدام داخل المتجر (لا يتعارض مع باركود مصنع).
 */

export const INTERNAL_BARCODE_PREFIX = "200";
const INTERNAL_SEQ_DIGITS = 9; // 200 + 9 أرقام + رقم تحقق = 13

/** رقم التحقق لـ EAN-8 / UPC-A / EAN-13 (المدخل بدون رقم التحقق). */
export function gtinCheckDigit(body: string): number {
  if (!/^\d+$/.test(body)) throw new Error("Barcode body must be digits");
  let sum = 0;
  // من اليمين: الأوزان 3، 1، 3، 1…
  for (let i = 0; i < body.length; i++) {
    const digit = body.charCodeAt(body.length - 1 - i) - 48;
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** هل الرقم GTIN صحيح (8 أو 12 أو 13 أو 14 رقماً مع رقم تحقق سليم)؟ */
export function isValidGtin(code: string): boolean {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false;
  return gtinCheckDigit(code.slice(0, -1)) === Number(code.at(-1));
}

/** باركود داخلي من رقم تسلسلي (يأتي من تسلسل في قاعدة البيانات). */
export function internalBarcode(sequence: number | bigint): string {
  const seq = BigInt(sequence);
  if (seq < 1n || seq >= 10n ** BigInt(INTERNAL_SEQ_DIGITS)) throw new Error("Internal barcode sequence out of range");
  const body = INTERNAL_BARCODE_PREFIX + seq.toString().padStart(INTERNAL_SEQ_DIGITS, "0");
  return body + gtinCheckDigit(body);
}

export function isInternalBarcode(code: string): boolean {
  return code.length === 13 && code.startsWith(INTERNAL_BARCODE_PREFIX) && isValidGtin(code);
}

export type BarcodeCheck = { ok: true; value: string } | { ok: false; reason: "FORMAT" | "CHECK_DIGIT" };

/**
 * يتحقق من باركود مصنع يُكتب أو يُمسح: أرقام وحروف لاتينية (4–32).
 * الأطوال القياسية (8/12/13/14 رقماً) يُفحص رقم تحققها لاكتشاف أخطاء الكتابة.
 */
export function checkBarcode(input: string): BarcodeCheck {
  const value = input.trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660));
  if (!/^[A-Za-z0-9-]{4,32}$/.test(value)) return { ok: false, reason: "FORMAT" };
  if (/^(\d{8}|\d{12,14})$/.test(value) && !isValidGtin(value)) return { ok: false, reason: "CHECK_DIGIT" };
  return { ok: true, value };
}
