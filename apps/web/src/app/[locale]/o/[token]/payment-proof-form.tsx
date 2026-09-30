"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { submitProofAction, type ProofResult } from "../../store-actions";

const input = "min-h-12 w-full rounded-xl border border-input bg-card px-3";
const MAX_BYTES = 10 * 1024 * 1024;

/** رفع إشعار بنكك (D-90): صورة + رقم العملية. الخادم يتحقق من المهلة والحالة. */
export function PaymentProofForm({ token }: { token: string }) {
  const t = useTranslations("order");
  const te = useTranslations("errors");
  const router = useRouter();
  const [state, action, pending] = useActionState<ProofResult | null, FormData>(submitProofAction, null);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const error = state && !state.ok ? (te.has(state.code) ? state.code : "INVALID") : null;

  return (
    <form
      action={action}
      onSubmit={(e) => {
        const file = new FormData(e.currentTarget).get("image");
        if (file instanceof File && file.size > MAX_BYTES) {
          e.preventDefault();
          window.alert(te("IMAGE_TOO_LARGE"));
        }
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="token" value={token} />
      <label className="flex flex-col gap-1">
        <span className="font-semibold">{t("proofImage")}</span>
        <input
          type="file"
          name="image"
          required
          accept="image/jpeg,image/png,image/webp"
          className="text-sm file:me-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-muted file:px-4 file:font-semibold"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">{t("reference")}</span>
        <input name="reference" required minLength={3} maxLength={60} dir="ltr" className={input} />
      </label>
      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">
          {te(error as "INVALID")}
        </p>
      ) : null}
      {state?.ok ? <p className="font-semibold text-primary">{t("proofSent")}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="flex min-h-12 items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"
      >
        {pending ? t("sending") : t("sendProof")}
      </button>
    </form>
  );
}
