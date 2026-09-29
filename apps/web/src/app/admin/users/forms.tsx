"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Field, SelectField } from "@/components/form-field";
import { ROLE_LABELS, ROLE_NAMES } from "@/lib/auth/permissions";
import { createUser, resetPassword, type ActionState } from "./actions";

export function CreateUserForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createUser, {});

  return (
    <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2" key={state.success}>
      {state.error ? (
        <div className="sm:col-span-2">
          <Alert variant="destructive">{state.error}</Alert>
        </div>
      ) : null}
      {state.success ? (
        <div className="sm:col-span-2">
          <Alert variant="success">{state.success}</Alert>
        </div>
      ) : null}
      <Field label="الاسم" name="name" required />
      <Field label="رقم الهاتف" name="phone" type="tel" inputMode="tel" dir="ltr" placeholder="0912345678" required />
      <SelectField label="الدور" name="role" defaultValue="STAFF">
        {ROLE_NAMES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </SelectField>
      <Field label="كلمة السر (8 أحرف على الأقل)" name="password" type="text" dir="ltr" minLength={8} required />
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "جارٍ الإضافة…" : "إضافة مستخدم"}
        </Button>
      </div>
    </form>
  );
}

export function ResetPasswordForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(resetPassword, {});

  return (
    <form action={action} className="flex min-w-0 flex-col gap-2">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex gap-2">
        <input
          name="password"
          type="text"
          dir="ltr"
          minLength={8}
          required
          placeholder="كلمة سر جديدة"
          aria-label="كلمة سر جديدة"
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-white px-3"
        />
        <Button type="submit" variant="outline" disabled={pending}>
          حفظ
        </Button>
      </div>
      {state.error ? <span className="text-sm text-danger">{state.error}</span> : null}
      {state.success ? <span className="text-sm text-sage">{state.success}</span> : null}
    </form>
  );
}
