import { cookies } from "next/headers";
import { FLASH_COOKIE } from "./flash-cookie";

/**
 * رسالة نجاح تعبر الانتقال (D-140): إجراء الخادم الذي ينتهي بـ redirect لا يرجع حالة يعرضها النموذج،
 * فيحفظ الرسالة في cookie قصير العمر، ويعرضها FlashToast في الصفحة التالية ثم يمسحها.
 */
export async function flash(message: string) {
  // Next يرمّز القيمة بنفسه (encodeURIComponent) — FlashToast يفكّها مرة
  (await cookies()).set(FLASH_COOKIE, message.slice(0, 200), {
    path: "/",
    maxAge: 60,
    sameSite: "lax",
  });
}
