"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { decidePhotoAction, type ProofResult } from "../../store-actions";

/** موافقة العميل على صورة الهدية أو طلب تعديل (D-13). */
export function PhotoDecision({ token, photoId }: { token: string; photoId: string }) {
  const t = useTranslations("order");
  const te = useTranslations("errors");
  const router = useRouter();
  const [changes, setChanges] = useState(false);
  const [state, action, pending] = useActionState<ProofResult | null, FormData>(decidePhotoAction, null);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const error = state && !state.ok ? (te.has(state.code) ? state.code : "INVALID") : null;
  const button = "flex min-h-12 items-center justify-center rounded-xl px-5 font-semibold disabled:opacity-50";

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="photoId" value={photoId} />
      {changes ? (
        <label className="flex flex-col gap-1">
          <span className="font-semibold">{t("changesLabel")}</span>
          <textarea
            name="feedback"
            required
            minLength={2}
            maxLength={300}
            rows={3}
            className="w-full rounded-xl border border-input bg-card px-3 py-2"
          />
        </label>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">
          {te(error as "INVALID")}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {changes ? (
          <>
            <button
              type="submit"
              name="decision"
              value="changes"
              disabled={pending}
              className={`${button} bg-primary text-primary-foreground`}
            >
              {pending ? t("sending") : t("sendChanges")}
            </button>
            <button type="button" onClick={() => setChanges(false)} className={`${button} border border-line`}>
              {t("back")}
            </button>
          </>
        ) : (
          <>
            <button
              type="submit"
              name="decision"
              value="approve"
              disabled={pending}
              className={`${button} bg-primary text-primary-foreground`}
            >
              {pending ? t("sending") : t("approvePhoto")}
            </button>
            <button type="button" onClick={() => setChanges(true)} className={`${button} border border-line`}>
              {t("requestChanges")}
            </button>
          </>
        )}
      </div>
    </form>
  );
}
