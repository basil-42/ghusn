import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * رموز موقّعة قصيرة للروابط بلا تسجيل دخول (D-130): رابط كشف الشريك على واتساب (7 أيام)، وصفحة
 * إنشاء الـ PDF داخل الخادم (دقائق). المحتوى ليس سرياً (معرّف وتاريخ انتهاء)؛ التوقيع يمنع التزوير.
 */

export interface TokenPayload {
  /** نوع الرابط — رمز نوع لا يصلح لنوع آخر */
  k: string;
  /** المعرّف المقصود */
  id: string;
  /** انتهاء الصلاحية (ms منذ 1970) */
  exp: number;
}

const b64 = (b: Buffer) => b.toString("base64url");
const sign = (body: string, secret: string) => b64(createHmac("sha256", secret).update(body).digest());

export function signToken(payload: TokenPayload, secret: string): string {
  if (secret.length < 16) throw new Error("Signing secret too short");
  const body = b64(Buffer.from(JSON.stringify(payload)));
  return `${body}.${sign(body, secret)}`;
}

/** المحتوى إن كان التوقيع صحيحاً والنوع مطابقاً ولم تنتهِ الصلاحية، وإلا null. */
export function verifyToken(token: string, kind: string, secret: string, now = Date.now()): TokenPayload | null {
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined || token.length > 1000) return null;
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<TokenPayload>;
    if (p.k !== kind || typeof p.id !== "string" || typeof p.exp !== "number" || p.exp < now) return null;
    return { k: p.k, id: p.id, exp: p.exp };
  } catch {
    return null;
  }
}
