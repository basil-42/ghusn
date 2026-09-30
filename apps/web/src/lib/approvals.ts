import { normalizePhone } from "@ghusn/core";
import { prisma } from "@ghusn/db";
import { verifyPassword } from "better-auth/crypto";
import { roleCan } from "./auth/permissions";
import { SlidingWindowLimiter } from "./rate-limit";

// محاولات موافقة خاطئة: 5 كل 15 دقيقة لكل رقم (مثل حماية الدخول — D-65)
const failures = new SlidingWindowLimiter(5, 15 * 60_000);

export class ApprovalError extends Error {}

/**
 * موافقة المديرة أو المالك على نفس الجهاز (D-80): رقم الهاتف وكلمة السر، ويجب أن يملك
 * صاحبها صلاحية pos:approve وألا يكون موقوفاً. يعيد معرّف الموافق.
 */
export async function verifyApprover(phoneInput: string, password: string): Promise<string> {
  const phone = normalizePhone(phoneInput);
  if (!phone) throw new ApprovalError("رقم هاتف الموافِق غير صحيح.");
  if (failures.isLimited(phone)) throw new ApprovalError("محاولات كثيرة — انتظري قليلاً.");
  const user = await prisma.user.findUnique({
    where: { phoneNumber: phone },
    include: { accounts: { where: { providerId: "credential" }, select: { password: true } } },
  });
  const hash = user?.accounts[0]?.password;
  const ok = !!hash && !user.banned && (await verifyPassword({ hash, password }));
  if (!ok) {
    failures.hit(phone);
    throw new ApprovalError("بيانات الموافِق غير صحيحة.");
  }
  if (!roleCan(user.role, { pos: ["approve"] })) throw new ApprovalError("هذا الحساب لا يملك صلاحية الموافقة.");
  failures.reset(phone);
  return user.id;
}
