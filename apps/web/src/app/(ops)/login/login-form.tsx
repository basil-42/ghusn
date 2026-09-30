"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/form-field";
import { login, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      <Field
        label="رقم الهاتف"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="username"
        dir="ltr"
        placeholder="0912345678"
        defaultValue={state.phone}
        required
      />
      <Field label="كلمة السر" name="password" type="password" autoComplete="current-password" dir="ltr" required />
      <Button type="submit" disabled={pending}>
        {pending ? "جارٍ الدخول…" : "دخول"}
      </Button>
    </form>
  );
}
