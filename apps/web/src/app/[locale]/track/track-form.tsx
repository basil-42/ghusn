"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { trackOrderAction } from "../store-actions";

const input = "min-h-12 w-full rounded-xl border border-input bg-card px-3";

/** «تتبّع طلبك»: رقم الطلب + الهاتف ← صفحة المتابعة. */
export function TrackForm() {
  const t = useTranslations("track");
  const te = useTranslations("errors");
  const locale = useLocale();
  const [state, action, pending] = useActionState(trackOrderAction, null);
  return (
    <form action={action} className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-4">
      <input type="hidden" name="locale" value={locale} />
      <label className="flex flex-col gap-1">
        <span className="font-semibold">{t("number")}</span>
        <input name="number" required maxLength={30} dir="ltr" placeholder="GHS-2026-000155" className={input} />
        <span className="text-xs text-muted-foreground">{t("numberHint")}</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">{t("phone")}</span>
        <input name="phone" required inputMode="tel" maxLength={20} dir="ltr" className={input} />
      </label>
      {state && !state.ok ? (
        <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">
          {te(state.code as "INVALID")}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="flex min-h-12 items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"
      >
        {pending ? t("searching") : t("submit")}
      </button>
    </form>
  );
}
