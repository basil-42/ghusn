"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import type { PosSettings, ReceiptSettings, StockSettings, StoreSettings } from "@/lib/settings";
import {
  saveExpenseCategoryAction,
  savePosSettingsAction,
  saveReceiptSettingsAction,
  saveHeroImageAction,
  saveStockSettingsAction,
  saveStoreSettingsAction,
  type FormState,
} from "./actions";

function Messages({ state }: { state: FormState }) {
  return (
    <>
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      {state.success ? <Alert variant="success">{state.success}</Alert> : null}
    </>
  );
}

const field = "flex min-w-0 flex-col gap-1";

export function PosSettingsForm({
  initial,
  wallets,
}: {
  initial: PosSettings;
  wallets: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(savePosSettingsAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <Messages state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={field}>
          <span className="font-semibold">حد خصم الموظفة %</span>
          <Input
            name="maxDiscountPercent"
            defaultValue={String(initial.maxDiscountPercent)}
            inputMode="decimal"
            dir="ltr"
          />
          <span className="text-xs text-muted-foreground">فوقه، أو البيع تحت التكلفة، يحتاج موافقة المديرة.</span>
        </label>
        <label className={field}>
          <span className="font-semibold">حد مصروف الموظفة (ج.س)</span>
          <Input
            name="staffExpenseLimitSdg"
            defaultValue={String(initial.staffExpenseLimitSdg)}
            inputMode="numeric"
            dir="ltr"
          />
          <span className="text-xs text-muted-foreground">للمصروف الواحد من درج الوردية، في الأقسام المسموحة لها.</span>
        </label>
        <label className={field}>
          <span className="font-semibold">تنبيه عجز الوردية (ج.س)</span>
          <Input
            name="shortageAlertSdg"
            defaultValue={String(initial.shortageAlertSdg)}
            inputMode="numeric"
            dir="ltr"
          />
          <span className="text-xs text-muted-foreground">
            عجز وردية واحدة أكبر منه يظهر تنبيهاً في اللوحة الرئيسية لمدة 7 أيام.
          </span>
        </label>
        <label className={field}>
          <span className="font-semibold">مدة المرتجع (أيام)</span>
          <Input name="returnDays" defaultValue={String(initial.returnDays)} inputMode="numeric" dir="ltr" />
        </label>
        <label className={field}>
          <span className="font-semibold">محفظة النقد</span>
          <NativeSelect name="cashWalletId" defaultValue={initial.cashWalletId ?? ""}>
            <option value="">صندوق المحل (افتراضي)</option>
            {wallets.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className={field}>
          <span className="font-semibold">محفظة بنكك</span>
          <NativeSelect name="bankakWalletId" defaultValue={initial.bankakWalletId ?? ""}>
            <option value="">بنكك (افتراضي)</option>
            {wallets.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        حفظ
      </Button>
    </form>
  );
}

export function ReceiptSettingsForm({ initial }: { initial: ReceiptSettings }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveReceiptSettingsAction, {});
  const check = (name: keyof ReceiptSettings, label: string) => (
    <label className="flex min-h-11 items-center gap-2">
      <input type="checkbox" name={name} defaultChecked={initial[name] as boolean} className="size-5 accent-primary" />
      <span>{label}</span>
    </label>
  );
  return (
    <form action={action} className="flex flex-col gap-4">
      <Messages state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={field}>
          <span className="font-semibold">العبارة تحت الشعار</span>
          <Input name="tagline" defaultValue={initial.tagline} maxLength={80} />
        </label>
        <label className={field}>
          <span className="font-semibold">العنوان</span>
          <Input name="address" defaultValue={initial.address} maxLength={160} />
        </label>
        <label className={field}>
          <span className="font-semibold">الهاتف</span>
          <Input name="phone" defaultValue={initial.phone} maxLength={40} dir="ltr" />
        </label>
        <label className={field}>
          <span className="font-semibold">واتساب</span>
          <Input name="whatsapp" defaultValue={initial.whatsapp} maxLength={40} dir="ltr" />
        </label>
        <label className={field}>
          <span className="font-semibold">إنستغرام</span>
          <Input name="instagram" defaultValue={initial.instagram} maxLength={60} dir="ltr" />
        </label>
      </div>
      <label className={field}>
        <span className="font-semibold">نص أسفل الإيصال (سياسة الاسترجاع، شكر…)</span>
        <textarea
          name="footer"
          defaultValue={initial.footer}
          maxLength={300}
          rows={3}
          className="rounded-xl border border-input bg-card p-3"
        />
      </label>
      <div className="flex flex-wrap gap-x-6">
        {check("showLogo", "إظهار الشعار")}
        {check("showCashier", "اسم البائعة")}
        {check("showCustomerPhone", "هاتف العميل")}
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        حفظ الإيصال
      </Button>
    </form>
  );
}

/** قسم مصاريف: الاسم، هل تسجّله الموظفة، ونشط أم موقوف (لا حذف — المصاريف القديمة مرتبطة به). */
export function ExpenseCategoryForm({
  category,
}: {
  category?: { id: string; name: string; staffAllowed: boolean; isActive: boolean };
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveExpenseCategoryAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2">
      {category ? <input type="hidden" name="id" value={category.id} /> : null}
      <Input
        name="name"
        defaultValue={category?.name ?? ""}
        placeholder="قسم جديد"
        aria-label="اسم القسم"
        className="w-44"
        required
      />
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="staffAllowed"
          defaultChecked={category?.staffAllowed ?? false}
          className="size-5 accent-primary"
        />
        تسجّله الموظفة
      </label>
      {category ? (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <select
            name="isActive"
            defaultValue={category.isActive ? "on" : "off"}
            className="min-h-11 rounded-xl border border-input bg-card px-2"
            aria-label="الحالة"
          >
            <option value="on">نشط</option>
            <option value="off">موقوف</option>
          </select>
        </label>
      ) : null}
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {category ? "حفظ" : "إضافة"}
      </Button>
      {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
      {state.success ? <span className="text-sm text-muted-foreground">{state.success}</span> : null}
    </form>
  );
}

/** إعدادات المتجر (D-88، D-90): محفظة شركة التوصيل، وحد الدفع عند الاستلام، وحساب بنكك. */
export function StoreSettingsForm({
  initial,
  wallets,
}: {
  initial: StoreSettings;
  wallets: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveStoreSettingsAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <Messages state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={field}>
          <span className="font-semibold">محفظة شركة التوصيل</span>
          <NativeSelect name="courierWalletId" defaultValue={initial.courierWalletId ?? ""}>
            <option value="">«شركة التوصيل» (افتراضي)</option>
            {wallets.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </NativeSelect>
          <span className="text-xs text-muted-foreground">
            يدخلها ما يحصّله المندوب عند الاستلام حتى تحوّله الشركة.
          </span>
        </label>
        <label className={field}>
          <span className="font-semibold">حد الدفع عند الاستلام (ج.س)</span>
          <Input
            name="codMaxSdg"
            defaultValue={initial.codMaxSdg ? String(initial.codMaxSdg) : ""}
            inputMode="numeric"
            dir="ltr"
            placeholder="0"
          />
          <span className="text-xs text-muted-foreground">فارغ أو 0 = بلا حد. الطلب الأعلى منه يُطلب دفعه ببنكك.</span>
        </label>
        <label className={field}>
          <span className="font-semibold">اسم حساب بنكك</span>
          <Input name="bankakAccountName" defaultValue={initial.bankakAccountName} maxLength={80} />
        </label>
        <label className={field}>
          <span className="font-semibold">رقم حساب بنكك</span>
          <Input name="bankakAccountNumber" defaultValue={initial.bankakAccountNumber} maxLength={40} dir="ltr" />
          <span className="text-xs text-muted-foreground">فارغ = لا يظهر الدفع ببنكك في المتجر.</span>
        </label>
        <label className={`${field} sm:col-span-2`}>
          <span className="font-semibold">ملاحظة للعميل عند التحويل (اختياري)</span>
          <Input name="bankakNote" defaultValue={initial.bankakNote} maxLength={200} />
        </label>
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        حفظ
      </Button>
    </form>
  );
}

/** تنبيهات المخزون في اللوحة (D-94). */
export function StockSettingsForm({ initial }: { initial: StockSettings }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveStockSettingsAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <Messages state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={field}>
          <span className="font-semibold">حد «قارب على النفاد» (قطعة)</span>
          <Input name="lowStockQty" defaultValue={String(initial.lowStockQty)} inputMode="decimal" dir="ltr" />
          <span className="text-xs text-muted-foreground">
            الصنف الذي رصيده عند هذا الحد أو أقل يظهر في اللوحة. يمكن تغييره لمنتج بعينه من صفحته.
          </span>
        </label>
        <label className={field}>
          <span className="font-semibold">تنبيه الصلاحية قبل (يوم)</span>
          <Input name="expiryAlertDays" defaultValue={String(initial.expiryAlertDays)} inputMode="numeric" dir="ltr" />
          <span className="text-xs text-muted-foreground">
            دفعات العطور والتجميل التي تنتهي صلاحيتها خلال هذه المدة.
          </span>
        </label>
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        حفظ
      </Button>
    </form>
  );
}

/** صورة البانر الرئيسي في المتجر (D-95). */
export function HeroImageForm({ imageUrl }: { imageUrl: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveHeroImageAction, {});
  return (
    <form action={action} className="flex flex-col gap-3 border-t border-border pt-4">
      <Messages state={state} />
      <span className="font-semibold">صورة البانر الرئيسي</span>
      <div className="flex flex-wrap items-center gap-4">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- معاينة صغيرة
          <img src={imageUrl} alt="" className="h-24 w-36 rounded-xl object-cover" />
        ) : (
          <span className="flex h-24 w-36 items-center justify-center rounded-xl bg-muted text-xs text-muted-foreground">
            نقش الهوية
          </span>
        )}
        <div className="flex flex-col gap-2">
          <input
            type="file"
            name="image"
            accept="image/jpeg,image/png,image/webp"
            className="text-sm file:me-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-muted file:px-4 file:font-semibold"
          />
          {imageUrl ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="remove" className="size-5 accent-forest" /> حذف الصورة
            </label>
          ) : null}
          <span className="text-xs text-muted-foreground">
            صورة أفقية أو مربعة بإضاءة جيدة (هدية مغلّفة، تشكيلة منتجات). غيّريها مع المواسم.
          </span>
        </div>
      </div>
      <Button type="submit" variant="outline" disabled={pending} className="self-start">
        {pending ? "جارٍ الرفع…" : "حفظ الصورة"}
      </Button>
    </form>
  );
}
