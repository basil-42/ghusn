import type { ComponentProps } from "react";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** حقل بعنوان ورسالة خطأ — الاستخدام الشائع في نماذج الإدارة. */
export function Field({
  label,
  error,
  hint,
  id,
  name,
  ...props
}: ComponentProps<"input"> & { label: string; error?: string; hint?: string }) {
  const fieldId = id ?? name;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={fieldId}>{label}</Label>
      <Input id={fieldId} name={name} aria-invalid={error ? true : undefined} {...props} />
      {hint && !error ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      {error ? <span className="text-sm text-destructive">{error}</span> : null}
    </div>
  );
}

export function SelectField({ label, id, name, ...props }: ComponentProps<"select"> & { label: string }) {
  const fieldId = id ?? name;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={fieldId}>{label}</Label>
      <NativeSelect id={fieldId} name={name} {...props} />
    </div>
  );
}
