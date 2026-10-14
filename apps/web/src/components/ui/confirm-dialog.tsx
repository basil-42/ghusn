"use client";

import { AlertTriangle, Lock, type LucideIcon } from "lucide-react";
import { startTransition, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * نافذة التأكيد الموحّدة (D-140) بدل window.confirm: عنوان يسأل بوضوح، شرح لما سيحدث، ملخص أرقام
 * اختياري، تنبيه، وزر يقول الفعل نفسه. نوعان: عادي (الغابة) وخطِر (الأحمر). التركيز يبدأ على «رجوع»
 * فلا تنفّذ Enter عرضية شيئاً، وEsc أو الضغط خارجها يغلقها (إلا أثناء التنفيذ). خطأ الخادم يظهر داخلها.
 * على الجوال تصير لوحة من أسفل الشاشة.
 */
export interface ConfirmContent {
  title: ReactNode;
  description?: ReactNode;
  /** نص زر التأكيد — الفعل نفسه («تأكيد الاستلام»، «حذف الصورة»)، لا «موافق». */
  confirmLabel: string;
  /** نص الزر أثناء التنفيذ («جارٍ الاستلام…»). */
  pendingLabel?: string;
  tone?: "default" | "danger";
  icon?: LucideIcon;
  /** أسطر «البند · القيمة»؛ total يرسم خطاً فوق السطر. */
  summary?: { label: ReactNode; value: ReactNode; total?: boolean }[];
  warning?: ReactNode;
  /** سطر صغير بقفل: ما لا يمكن التراجع عنه. */
  irreversible?: ReactNode;
  /** خانة يجب تعليمها قبل أن يعمل الزر (مطابقة بنكك). */
  acknowledge?: string;
  children?: ReactNode;
}

export interface ConfirmDialogProps extends ConfirmContent {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  pending?: boolean;
  error?: string | null;
}

export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  pending = false,
  error,
  title,
  description,
  confirmLabel,
  pendingLabel,
  tone = "default",
  icon: Icon,
  summary,
  warning,
  irreversible,
  acknowledge,
  children,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      backRef.current?.focus();
    } else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        // Esc: المتصفح يغلقها بنفسه، فنمنعه ونترك القرار للأب
        e.preventDefault();
        if (!pending) onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !pending) onCancel();
      }}
      className={cn(
        "m-auto w-[min(30rem,calc(100vw-2rem))] max-w-none bg-transparent p-0 text-foreground backdrop:bg-forest/50",
        "max-sm:mb-0 max-sm:w-full",
      )}
    >
      {open ? (
        <Panel
          {...{ title, description, confirmLabel, pendingLabel, tone, icon: Icon, summary, warning, irreversible }}
          {...{ acknowledge, children, pending, error, onCancel, onConfirm, backRef, titleId, descId }}
        />
      ) : null}
    </dialog>
  );
}

/**
 * يربط نموذجاً (useActionState) بنافذة التأكيد: الإرسال يفتح النافذة بدل التنفيذ، و«التأكيد» يرسل نفس
 * بيانات النموذج (مع زر الإرسال إن كان له اسم). تبقى النافذة مفتوحة حتى يرد الخادم: تُغلق عند النجاح،
 * ويظهر الخطأ داخلها. الإجراء الذي ينقل لصفحة أخرى (redirect) لا يرجع حالة — الصفحة تتغير فقط.
 */
export function useConfirmForm<S extends { error?: string }>(
  dispatch: (data: FormData) => void,
  state: S,
  pending: boolean,
) {
  const [open, setOpen] = useState(false);
  // الحالة لحظة الإرسال: وصول حالة جديدة بعدها يعني أن الخادم رد
  const [sentFrom, setSentFrom] = useState<S | null>(null);
  const data = useRef<FormData | null>(null);
  const settled = sentFrom !== null && state !== sentFrom;

  return {
    onSubmit(e: FormEvent<HTMLFormElement>) {
      e.preventDefault();
      const submitter = (e.nativeEvent as SubmitEvent).submitter;
      data.current = new FormData(e.currentTarget, submitter instanceof HTMLElement ? submitter : null);
      setSentFrom(null);
      setOpen(true);
    },
    dialog: {
      // تُغلق عند النجاح، وتبقى مع الخطأ
      open: open && !(settled && !state.error),
      pending,
      error: settled ? (state.error ?? null) : null,
      onCancel: () => setOpen(false),
      onConfirm: () => {
        if (!data.current) return;
        const fd = data.current;
        setSentFrom(state);
        startTransition(() => dispatch(fd));
      },
    },
  };
}

/** المحتوى يُركَّب عند الفتح فقط، فتبدأ خانة المطابقة غير معلَّمة في كل مرة. */
function Panel({
  title,
  description,
  confirmLabel,
  pendingLabel,
  tone,
  icon: Icon,
  summary,
  warning,
  irreversible,
  acknowledge,
  children,
  pending,
  error,
  onCancel,
  onConfirm,
  backRef,
  titleId,
  descId,
}: Omit<ConfirmDialogProps, "open"> & {
  backRef: React.RefObject<HTMLButtonElement | null>;
  titleId: string;
  descId: string;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const danger = tone === "danger";
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card shadow-xl max-sm:rounded-b-none max-sm:pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line sm:hidden" aria-hidden />
      <div className="flex items-start gap-3 px-5 pt-5 max-sm:pt-3">
        {Icon ? (
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl",
              danger ? "bg-destructive/10 text-destructive" : "bg-muted text-forest",
            )}
          >
            <Icon aria-hidden className="size-5" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg leading-snug font-bold text-balance">
            {title}
          </h2>
          {description ? (
            <p id={descId} className="mt-0.5 text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2.5 px-5 pt-4 empty:hidden">
        {children}
        {summary?.length ? (
          <dl className="flex flex-col gap-1 rounded-xl bg-muted px-4 py-2.5 text-sm">
            {summary.map((s, i) => (
              <div
                key={i}
                className={cn(
                  "flex justify-between gap-3",
                  s.total && "mt-0.5 border-t border-border pt-1.5 font-semibold",
                )}
              >
                <dt className="min-w-0">{s.label}</dt>
                <dd className="shrink-0 font-semibold tabular-nums">{s.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {warning ? (
          <p className="flex items-start gap-2 rounded-xl bg-gold/15 px-3 py-2 text-sm">
            <AlertTriangle aria-hidden className="mt-1 size-4 shrink-0 text-warning" />
            <span>{warning}</span>
          </p>
        ) : null}
        {acknowledge ? (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="size-5 accent-forest"
            />
            {acknowledge}
          </label>
        ) : null}
        {irreversible ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock aria-hidden className="size-3.5" />
            {irreversible}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertTriangle aria-hidden className="mt-1 size-4 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}
      </div>

      {/* على الجوال: «رجوع» في الأسفل، الأقرب للإبهام */}
      <div className="flex gap-2.5 px-5 pt-5 pb-5 max-sm:flex-col">
        <Button
          type="button"
          variant={danger ? "destructive" : "default"}
          disabled={pending || (!!acknowledge && !acknowledged)}
          onClick={onConfirm}
          className="max-sm:w-full"
        >
          {pending ? (pendingLabel ?? "جارٍ التنفيذ…") : confirmLabel}
        </Button>
        <Button
          ref={backRef}
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onCancel}
          className="max-sm:w-full"
        >
          رجوع
        </Button>
      </div>
    </div>
  );
}
