"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { transitionAction, uploadPhotoAction, type FormState } from "./actions";

type Status =
  | "NEW"
  | "AWAITING_PAYMENT"
  | "PAYMENT_REVIEW"
  | "CONFIRMED"
  | "PREPARING"
  | "AWAITING_PHOTO_APPROVAL"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

const field = "flex min-w-0 flex-col gap-1";

/** نموذج انتقال واحد: زر وحقول اختيارية؛ الخادم يتحقق من كل شيء (transitionOrder). */
function Step({
  id,
  to,
  label,
  variant = "default",
  confirm,
  children,
}: {
  id: string;
  to: Status;
  label: string;
  variant?: "default" | "outline" | "destructive";
  confirm?: string;
  children?: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(transitionAction, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="flex flex-col gap-2 rounded-xl border border-border p-3"
    >
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="to" value={to} />
      {children}
      <Button type="submit" variant={variant} disabled={pending} className="self-start">
        {pending ? "جارٍ الحفظ…" : label}
      </Button>
    </form>
  );
}

/** رفع صورة الهدية الجاهزة — تنتقل الحالة إلى «بانتظار موافقة الصورة». */
function PhotoStep({ id, again }: { id: string; again: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(uploadPhotoAction, {});
  return (
    <form action={action} className="flex flex-col gap-2 rounded-xl border border-border p-3">
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      <input type="hidden" name="id" value={id} />
      <label className={field}>
        <span className="text-sm font-semibold">{again ? "صورة الهدية بعد التعديل" : "صورة الهدية الجاهزة"}</span>
        <input
          type="file"
          name="image"
          required
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="text-sm file:me-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-muted file:px-4 file:font-semibold"
        />
      </label>
      <p className="text-xs text-muted-foreground">
        تظهر للعميل في صفحة طلبه ليوافق أو يطلب تعديلاً. عدم الرد خلال ساعة = موافقة.
      </p>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "جارٍ الرفع…" : "إرسال الصورة للعميل"}
      </Button>
    </form>
  );
}

const Reason = ({ placeholder }: { placeholder: string }) => (
  <label className={field}>
    <span className="text-sm font-semibold">السبب</span>
    <Input name="reason" required maxLength={300} placeholder={placeholder} />
  </label>
);

export function OrderActions({
  id,
  status,
  fulfillment,
  canCancel,
  canReviewPayment,
  pendingProofId,
  paid,
  wrapped,
  photoAgain,
}: {
  id: string;
  status: Status;
  fulfillment: "DELIVERY" | "PICKUP";
  canCancel: boolean;
  canReviewPayment: boolean;
  /** آخر إشعار بنكك لم يُراجع (عند «إشعار قيد المراجعة»). */
  pendingProofId: string | null;
  /** مدفوع مسبقاً (بنكك) — الإلغاء يسجّل رد المبلغ. */
  paid: boolean;
  /** هدية مغلّفة: صورة قبل «جاهز» (D-13). */
  wrapped: boolean;
  /** طلب العميل تعديلاً على صورة سابقة. */
  photoAgain: boolean;
}) {
  const stockOut = ["PREPARING", "AWAITING_PHOTO_APPROVAL", "READY", "OUT_FOR_DELIVERY"].includes(status);
  const cancel = canCancel ? (
    <Step
      id={id}
      to="CANCELLED"
      label={status === "OUT_FOR_DELIVERY" ? "رُفض الاستلام — إلغاء" : "إلغاء الطلب"}
      variant="destructive"
      confirm={
        paid
          ? "إلغاء الطلب؟ يُسجَّل رد المبلغ للعميل من محفظة بنكك."
          : stockOut
            ? "إلغاء الطلب؟ الأصناف تعود للمخزون."
            : "إلغاء الطلب؟ يُحرَّر الحجز."
      }
    >
      <Reason placeholder={status === "OUT_FOR_DELIVERY" ? "مثال: المستلم رفض الاستلام" : "مثال: طلب العميل الإلغاء"} />
      {paid ? (
        <label className={field}>
          <span className="text-sm font-semibold">رقم عملية رد المبلغ ببنكك (اختياري)</span>
          <Input name="reference" maxLength={60} dir="ltr" />
          <span className="text-xs text-muted-foreground">
            الطلب مدفوع: يُسجَّل رد المبلغ كاملاً من محفظة بنكك. ردّي المبلغ للعميل قبل الإلغاء.
          </span>
        </label>
      ) : null}
      {stockOut ? <p className="text-xs text-muted-foreground">الأصناف تعود للمخزون بتكلفتها.</p> : null}
    </Step>
  ) : null;

  return (
    <div className="flex flex-col gap-3">
      {status === "AWAITING_PAYMENT" ? (
        <p className="rounded-xl border border-border p-3 text-sm text-muted-foreground">
          بانتظار تحويل العميل ورفع الإشعار من صفحة المتابعة. يُلغى تلقائياً عند انتهاء المهلة.
        </p>
      ) : null}
      {status === "PAYMENT_REVIEW" && pendingProofId && canReviewPayment ? (
        <>
          <Step
            id={id}
            to="CONFIRMED"
            label="المبلغ وصل — تأكيد الطلب"
            confirm="هل طابقتِ المبلغ ورقم العملية مع كشف حساب بنكك؟"
          >
            <input type="hidden" name="proofId" value={pendingProofId} />
            <p className="text-sm text-muted-foreground">
              طابقي المبلغ ورقم العملية مع كشف بنكك أولاً. يُسجَّل المبلغ في محفظة بنكك.
            </p>
          </Step>
          <Step id={id} to="AWAITING_PAYMENT" label="الإشعار غير مطابق — رفض" variant="outline">
            <input type="hidden" name="proofId" value={pendingProofId} />
            <label className={field}>
              <span className="text-sm font-semibold">السبب (يراه العميل)</span>
              <Input name="reason" required maxLength={300} placeholder="مثال: المبلغ لم يصل بعد / المبلغ ناقص" />
            </label>
            <p className="text-xs text-muted-foreground">
              يبقى الطلب محجوزاً ويُطلب من العميل إشعار صحيح (مهلة 12 ساعة على الأقل).
            </p>
          </Step>
        </>
      ) : null}
      {status === "PAYMENT_REVIEW" && !canReviewPayment ? (
        <p className="rounded-xl border border-border p-3 text-sm text-muted-foreground">
          مراجعة إشعار بنكك للمديرة أو المالك.
        </p>
      ) : null}
      {status === "NEW" ? <Step id={id} to="CONFIRMED" label="تأكيد الطلب" /> : null}
      {status === "CONFIRMED" ? (
        <Step id={id} to="PREPARING" label="بدء التجهيز" confirm="بدء التجهيز يخصم الأصناف من المخزون. متابعة؟">
          <p className="text-sm text-muted-foreground">تُخصم الأصناف من المخزون الآن، ولا يُعدَّل الطلب بعدها.</p>
        </Step>
      ) : null}
      {status === "PREPARING" && !wrapped ? <Step id={id} to="READY" label="الطلب جاهز" /> : null}
      {status === "PREPARING" && wrapped ? <PhotoStep id={id} again={photoAgain} /> : null}
      {status === "AWAITING_PHOTO_APPROVAL" ? (
        <>
          <Step id={id} to="READY" label="وافق العميل (واتساب) — جاهز" variant="outline" />
          <Step id={id} to="PREPARING" label="طلب العميل تعديلاً" variant="outline">
            <label className={field}>
              <span className="text-sm font-semibold">التعديل المطلوب</span>
              <Input name="reason" required maxLength={300} placeholder="مثال: شريط ذهبي بدل الأبيض" />
            </label>
          </Step>
        </>
      ) : null}
      {status === "READY" && fulfillment === "DELIVERY" ? (
        <Step id={id} to="OUT_FOR_DELIVERY" label="سُلِّم لشركة التوصيل">
          <label className={field}>
            <span className="text-sm font-semibold">رقم الشحنة عند شركة التوصيل (اختياري)</span>
            <Input name="courierRef" maxLength={60} dir="ltr" />
          </label>
        </Step>
      ) : null}
      {status === "READY" && fulfillment === "PICKUP" ? (
        <Step id={id} to="DELIVERED" label="استلمه العميل ودفع">
          <label className={field}>
            <span className="text-sm font-semibold">طريقة الدفع</span>
            <NativeSelect name="channel" defaultValue="CASH">
              <option value="CASH">نقداً (يدخل درج ورديتك)</option>
              <option value="BANKAK">بنكك</option>
            </NativeSelect>
          </label>
          <label className={field}>
            <span className="text-sm font-semibold">رقم عملية بنكك (اختياري)</span>
            <Input name="reference" maxLength={60} dir="ltr" />
          </label>
        </Step>
      ) : null}
      {status === "OUT_FOR_DELIVERY" ? (
        <>
          <Step id={id} to="DELIVERED" label="تم التسليم">
            <p className="text-sm text-muted-foreground">
              المبلغ يُسجَّل في محفظة «شركة التوصيل» حتى تحوّله الشركة للمحل.
            </p>
          </Step>
          <Step id={id} to="READY" label="تعذّر التسليم — يعود جاهزاً" variant="outline">
            <Reason placeholder="مثال: المستلم لم يرد — موعد جديد غداً" />
          </Step>
        </>
      ) : null}
      {status !== "DELIVERED" && status !== "CANCELLED" ? cancel : null}
    </div>
  );
}
