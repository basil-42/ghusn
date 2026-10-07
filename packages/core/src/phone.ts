import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";

/** الدولة الافتراضية للأرقام المحلية (0912345678 ← +249912345678). */
export const DEFAULT_PHONE_COUNTRY: CountryCode = "SD";

const ARABIC_INDIC = /[٠-٩۰-۹]/g;

/** يحوّل الأرقام العربية الهندية (٠١٢ / ۰۱۲) إلى أرقام لاتينية — لوحة مفاتيح الجوال العربية تكتبها. */
export function toLatinDigits(value: string): string {
  return value.replace(ARABIC_INDIC, (ch) => String((ch.charCodeAt(0) & 0xf) % 10));
}

/**
 * يوحّد رقم الهاتف إلى صيغة E.164 (مثل +249912345678)، أو null إن لم يكن رقماً صالحاً.
 * يقبل: 0912345678، ‎+249 91 234 5678، 00249912345678، ٠٩١٢٣٤٥٦٧٨، وأرقام الدول الأخرى بمفتاحها (+974…).
 * هو المعرّف الوحيد للموظفات عند الدخول، وللعملاء لاحقاً (system-design §4.6).
 */
export function normalizePhone(input: string, defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY): string | null {
  const cleaned = toLatinDigits(input).trim().replace(/^00/, "+");
  const parsed = parsePhoneNumberFromString(cleaned, defaultCountry);
  return parsed?.isValid() ? parsed.number : null;
}

/**
 * Better Auth يشترط بريداً لكل مستخدم. للموظفات بلا بريد نولّد بريداً داخلياً
 * غير قابل للتسليم (نطاق ‎.invalid محجوز) — لا يُرسل إليه شيء أبداً.
 */
export function internalEmailForPhone(phoneE164: string): string {
  return `${phoneE164.replace(/\D/g, "")}@phone.ghusn.invalid`;
}

/** للعرض: «‎+249 91 234 5678» — والنص كما هو إن لم يُفهم. */
export function formatPhone(phoneE164: string): string {
  return parsePhoneNumberFromString(phoneE164)?.formatInternational() ?? phoneE164;
}
