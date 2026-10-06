/**
 * رسائل واتساب للطلبات (D-113): النصوص بمتغيراتها، ومتى تُقترح كل رسالة. نفس القوالب تُرسل اليوم
 * بأزرار wa.me من صفحة الطلب، وغداً عبر WhatsApp Cloud API بلا تغيير في النصوص ولا نقاط الإرسال.
 *
 * قواعد Meta للقوالب: لا يبدأ القالب ولا ينتهي بمتغير (لذلك التوقيع ثابت في آخر كل رسالة)، وبلا
 * ترويج حتى تُعتمد في فئة «خدمة» (Utility). رسائل الهدية تصل للمرسِل فقط — لا شيء للمستلم.
 */

import type { OrderStatus } from "./order";

export const ORDER_MESSAGE_KEYS = [
  "RECEIVED",
  "AWAITING_TRANSFER",
  "PAYMENT_REMINDER",
  "PAYMENT_CONFIRMED",
  "PROOF_REJECTED",
  "READY_PICKUP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERY_FAILED",
  "CANCELLED_UNPAID",
  "CANCELLED",
  "CANCELLED_REFUND",
  "ITEM_UNAVAILABLE",
] as const;
export type OrderMessageKey = (typeof ORDER_MESSAGE_KEYS)[number];

/** اسم الرسالة كما يظهر للموظفة على الزر. */
export const ORDER_MESSAGE_LABELS: Record<OrderMessageKey, string> = {
  RECEIVED: "استلمنا طلبك",
  AWAITING_TRANSFER: "بانتظار تحويل بنكك",
  PAYMENT_REMINDER: "تذكير بالدفع",
  PAYMENT_CONFIRMED: "تم تأكيد الدفع",
  PROOF_REJECTED: "إشعار الدفع يحتاج تصحيحاً",
  READY_PICKUP: "جاهز للاستلام",
  OUT_FOR_DELIVERY: "في الطريق",
  DELIVERED: "تم التسليم",
  DELIVERY_FAILED: "تعذّر التسليم",
  CANCELLED_UNPAID: "إلغاء لعدم الدفع",
  CANCELLED: "إلغاء الطلب",
  CANCELLED_REFUND: "إلغاء مع إرجاع المبلغ",
  ITEM_UNAVAILABLE: "صنف غير متوفر",
};

export interface OrderMessageContext {
  status: OrderStatus;
  fulfillment: "DELIVERY" | "PICKUP";
  paymentMethod: "COD" | "IN_SHOP" | "BANKAK";
  /** آخر إشعار بنكك رُفض والطلب عاد لانتظار الدفع. */
  proofRejected: boolean;
  /** دُفع شيء لم يُرد بعد (للإلغاء: يُذكر إرجاع المبلغ). */
  paid: boolean;
  /** الحالة السابقة (عودة من «مع المندوب» إلى «جاهز» = تعذّر التسليم). */
  previousStatus: OrderStatus | null;
  /** أُلغي تلقائياً لانتهاء مهلة بنكك. */
  autoCancelled: boolean;
}

/** الرسالة المقترحة لحالة الطلب الآن، وباقي ما يناسبها (تختار الموظفة). */
export function suggestedOrderMessages(ctx: OrderMessageContext): {
  primary: OrderMessageKey | null;
  others: OrderMessageKey[];
} {
  const beforePreparing = ["NEW", "AWAITING_PAYMENT", "PAYMENT_REVIEW", "CONFIRMED", "PREPARING"].includes(ctx.status);
  const others: OrderMessageKey[] = [];
  let primary: OrderMessageKey | null = null;
  switch (ctx.status) {
    case "NEW":
      primary = ctx.paymentMethod === "BANKAK" ? "AWAITING_TRANSFER" : "RECEIVED";
      break;
    case "AWAITING_PAYMENT":
      primary = ctx.proofRejected ? "PROOF_REJECTED" : "AWAITING_TRANSFER";
      others.push("PAYMENT_REMINDER");
      break;
    case "CONFIRMED":
      primary = ctx.paymentMethod === "BANKAK" ? "PAYMENT_CONFIRMED" : "RECEIVED";
      break;
    case "READY":
      if (ctx.previousStatus === "OUT_FOR_DELIVERY") primary = "DELIVERY_FAILED";
      else if (ctx.fulfillment === "PICKUP") primary = "READY_PICKUP";
      break;
    case "OUT_FOR_DELIVERY":
      primary = "OUT_FOR_DELIVERY";
      break;
    case "DELIVERED":
      primary = "DELIVERED";
      break;
    case "CANCELLED":
      primary = ctx.autoCancelled ? "CANCELLED_UNPAID" : ctx.paid ? "CANCELLED_REFUND" : "CANCELLED";
      break;
    default:
      break;
  }
  if (beforePreparing) others.push("ITEM_UNAVAILABLE");
  return { primary, others: others.filter((k) => k !== primary) };
}

export interface OrderMessageVars {
  name: string;
  number: string;
  /** المبلغ منسّقاً (185,000). */
  amount: string;
  /** رابط متابعة الطلب. */
  link: string;
  /** التوقيع من «الضبط». */
  signature: string;
  /** موعد انتهاء حجز بنكك منسّقاً. */
  deadline?: string | null;
  /** سبب رفض الإشعار أو الإلغاء. */
  reason?: string | null;
  /** اسم المستلم إن كانت هدية لشخص آخر. */
  recipient?: string | null;
  address?: string | null;
  hours?: string | null;
  /** الصنف غير المتوفر. */
  item?: string | null;
}

type Locale = "ar" | "en";

function lines(...parts: (string | null | false | undefined)[]): string {
  return parts.filter(Boolean).join("\n");
}

/** نص الرسالة جاهزاً للإرسال. المتغيرات الناقصة تُحذف سطورها بدل ظهور فراغ. */
export function renderOrderMessage(key: OrderMessageKey, v: OrderMessageVars, locale: Locale = "ar"): string {
  const sig = v.signature.trim() || (locale === "en" ? "Ghusn" : "غصن");
  const gift = !!v.recipient?.trim();
  if (locale === "en") {
    switch (key) {
      case "RECEIVED":
        return lines(
          `Hello ${v.name} 🌿`,
          `We received your order ${v.number} (${v.amount} SDG) and will start preparing it soon.`,
          `Track your order here: ${v.link}`,
          sig,
        );
      case "AWAITING_TRANSFER":
        return lines(
          `Hello ${v.name} 🌿`,
          `Your order ${v.number} is reserved${v.deadline ? ` until ${v.deadline}` : ""}.`,
          `Amount: ${v.amount} SDG — transfer it via Bankak, then upload the receipt here: ${v.link}`,
          sig,
        );
      case "PAYMENT_REMINDER":
        return lines(
          `Hello ${v.name}, a gentle reminder 🌿`,
          `The reservation for order ${v.number} ends${v.deadline ? ` ${v.deadline}` : " soon"}, and we haven't received the transfer receipt yet.`,
          `Upload it here: ${v.link}`,
          sig,
        );
      case "PAYMENT_CONFIRMED":
        return lines(
          `Thank you ${v.name} 🌿`,
          `We received your transfer and your order ${v.number} is confirmed. We're preparing it now.`,
          sig,
        );
      case "PROOF_REJECTED":
        return lines(
          `Hello ${v.name}`,
          `We reviewed the transfer receipt for order ${v.number} and couldn't match it${v.reason ? `: ${v.reason}` : ""}.`,
          `You can upload a correct receipt here: ${v.link}${v.deadline ? ` — your order is still reserved until ${v.deadline}.` : ""}`,
          sig,
        );
      case "READY_PICKUP":
        return lines(
          `Hello ${v.name} 🌿`,
          `Your order ${v.number} is ready for pickup from Ghusn.`,
          v.address ? `Address: ${v.address}` : null,
          v.hours ? `Opening hours: ${v.hours}` : null,
          sig,
        );
      case "OUT_FOR_DELIVERY":
        return gift
          ? lines(`Hello ${v.name} 🌿`, `Your gift to ${v.recipient} is on its way now (order ${v.number}).`, sig)
          : lines(
              `Hello ${v.name} 🌿`,
              `Your order ${v.number} is on its way, and the courier will contact you on arrival.`,
              sig,
            );
      case "DELIVERED":
        return gift
          ? lines(
              `Your gift has reached ${v.recipient} 🌿`,
              `Thank you for choosing Ghusn to make a moment to remember, ${v.name}.`,
              sig,
            )
          : lines(
              `Your order ${v.number} has been delivered 🌿`,
              `Thank you for choosing Ghusn, ${v.name} — we hope you love it.`,
              sig,
            );
      case "DELIVERY_FAILED":
        return lines(
          `Hello ${v.name}`,
          `The courier tried to deliver order ${v.number} but couldn't reach the recipient.`,
          "Please reply with a convenient time for redelivery.",
          sig,
        );
      case "CANCELLED_UNPAID":
        return lines(
          `Hello ${v.name}`,
          `The reservation for order ${v.number} has ended without a transfer, so it was cancelled.`,
          "We'd be glad to receive your order again anytime.",
          sig,
        );
      case "CANCELLED":
        return lines(
          `Hello ${v.name}`,
          `We're sorry, order ${v.number} has been cancelled${v.reason ? `: ${v.reason}` : ""}.`,
          "For any questions, just reply to this message.",
          sig,
        );
      case "CANCELLED_REFUND":
        return lines(
          `Hello ${v.name}`,
          `We're sorry, order ${v.number} has been cancelled${v.reason ? `: ${v.reason}` : ""}.`,
          `We'll refund ${v.amount} SDG via Bankak and send you the transfer receipt.`,
          sig,
        );
      case "ITEM_UNAVAILABLE":
        return lines(
          `Hello ${v.name}`,
          `We're sorry, ${v.item ?? "an item"} in order ${v.number} is no longer available.`,
          "We can replace it with ____ of the same value, or remove it and refund its price. Which do you prefer?",
          sig,
        );
    }
  }
  switch (key) {
    case "RECEIVED":
      return lines(
        `مرحباً ${v.name} 🌿`,
        `استلمنا طلبك رقم ${v.number} بقيمة ${v.amount} ج.س، وسنبدأ تجهيزه قريباً.`,
        `تابع حالة طلبك من هنا: ${v.link}`,
        sig,
      );
    case "AWAITING_TRANSFER":
      return lines(
        `مرحباً ${v.name} 🌿`,
        `طلبك رقم ${v.number} محجوز لك${v.deadline ? ` حتى ${v.deadline}` : ""}.`,
        `المبلغ: ${v.amount} ج.س — حوّله على بنكك ثم ارفع صورة الإشعار من هنا: ${v.link}`,
        sig,
      );
    case "PAYMENT_REMINDER":
      return lines(
        `مرحباً ${v.name}، تذكير لطيف 🌿`,
        `حجز طلبك رقم ${v.number} ينتهي${v.deadline ? ` ${v.deadline}` : " قريباً"}، ولم يصلنا إشعار التحويل بعد.`,
        `لرفع الإشعار: ${v.link}`,
        sig,
      );
    case "PAYMENT_CONFIRMED":
      return lines(`شكراً ${v.name} 🌿`, `وصلنا تحويلك وتأكد طلبك رقم ${v.number}. سنبدأ تجهيزه الآن.`, sig);
    case "PROOF_REJECTED":
      return lines(
        `مرحباً ${v.name}`,
        `راجعنا إشعار التحويل لطلبك رقم ${v.number} ولم نتمكن من مطابقته${v.reason ? `: ${v.reason}` : ""}.`,
        `يمكنك رفع إشعار صحيح من هنا: ${v.link}${v.deadline ? ` — وطلبك ما زال محجوزاً حتى ${v.deadline}.` : ""}`,
        sig,
      );
    case "READY_PICKUP":
      return lines(
        `مرحباً ${v.name} 🌿`,
        `طلبك رقم ${v.number} جاهز للاستلام من محل غصن.`,
        v.address ? `العنوان: ${v.address}` : null,
        v.hours ? `ساعات العمل: ${v.hours}` : null,
        sig,
      );
    case "OUT_FOR_DELIVERY":
      return gift
        ? lines(`مرحباً ${v.name} 🌿`, `هديتك إلى ${v.recipient} في الطريق الآن (طلب رقم ${v.number}).`, sig)
        : lines(
            `مرحباً ${v.name} 🌿`,
            `طلبك رقم ${v.number} في الطريق إليك الآن، وسيتواصل معك المندوب عند الوصول.`,
            sig,
          );
    case "DELIVERED":
      return gift
        ? lines(`وصلت هديتك إلى ${v.recipient} 🌿`, `شكراً لأنك اخترت غصن لتصنع لحظة تُذكر يا ${v.name}.`, sig)
        : lines(`وصل طلبك رقم ${v.number} 🌿`, `شكراً لاختيارك غصن يا ${v.name} — نتمنى أن ينال إعجابك.`, sig);
    case "DELIVERY_FAILED":
      return lines(
        `مرحباً ${v.name}`,
        `حاول المندوب تسليم طلبك رقم ${v.number} ولم يتمكن من الوصول إلى المستلم.`,
        "فضلاً ردّ على هذه الرسالة بموعد مناسب لإعادة التوصيل.",
        sig,
      );
    case "CANCELLED_UNPAID":
      return lines(
        `مرحباً ${v.name}`,
        `انتهت مدة حجز طلبك رقم ${v.number} ولم يصلنا التحويل، فأُلغي الحجز.`,
        "يسعدنا استقبال طلبك من جديد في أي وقت.",
        sig,
      );
    case "CANCELLED":
      return lines(
        `مرحباً ${v.name}`,
        `نعتذر، أُلغي طلبك رقم ${v.number}${v.reason ? `: ${v.reason}` : ""}.`,
        "لأي استفسار ردّ على هذه الرسالة.",
        sig,
      );
    case "CANCELLED_REFUND":
      return lines(
        `مرحباً ${v.name}`,
        `نعتذر، أُلغي طلبك رقم ${v.number}${v.reason ? `: ${v.reason}` : ""}.`,
        `سنعيد لك المبلغ ${v.amount} ج.س عبر بنكك، وسنرسل لك إشعار التحويل.`,
        sig,
      );
    case "ITEM_UNAVAILABLE":
      return lines(
        `مرحباً ${v.name}`,
        `نعتذر، ${v.item ?? "أحد الأصناف"} في طلبك رقم ${v.number} لم يعد متوفراً.`,
        "يمكننا استبداله بـ ____ بنفس القيمة، أو إلغاؤه وإرجاع قيمته. أيهما تفضّل؟",
        sig,
      );
  }
}

/** رابط wa.me برقم العميل والنص — الإرسال اليدوي قبل ربط Cloud API. */
export function whatsappMessageUrl(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
