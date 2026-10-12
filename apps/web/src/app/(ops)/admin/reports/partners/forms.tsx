"use client";

import { FileText, RefreshCw } from "lucide-react";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionToast } from "@/components/ui/toast";
import { issueStatementAction, savePartnerAction, type FormState } from "./actions";

/** إصدار كشف (شريك واحد أو كل الشركاء) — الإنشاء يأخذ ثوانٍ في الخادم. */
export function IssueButton({
  month,
  partnerId,
  label,
  reissue,
}: {
  month: string;
  partnerId?: string;
  label: string;
  reissue?: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(issueStatementAction, {});
  useActionToast(state);
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="month" value={month} />
      {partnerId ? <input type="hidden" name="partnerId" value={partnerId} /> : null}
      <Button type="submit" variant={reissue || partnerId ? "outline" : "default"} disabled={pending}>
        {reissue ? <RefreshCw aria-hidden /> : <FileText aria-hidden />}
        {pending ? "جارٍ إنشاء الـ PDF…" : label}
      </Button>
      {state.error ? <span className="text-xs text-danger">{state.error}</span> : null}
    </form>
  );
}

export function PartnerForm({ partner }: { partner?: { id: string; name: string; phone: string } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(savePartnerAction, {});
  useActionToast(state);
  return (
    <form action={action} className="flex flex-col gap-2">
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      {partner ? <input type="hidden" name="id" value={partner.id} /> : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Input name="name" defaultValue={partner?.name} placeholder="الاسم" aria-label="الاسم" required />
        <Input
          name="phone"
          defaultValue={partner?.phone}
          placeholder="رقم واتساب (+974… أو 09…)"
          aria-label="رقم واتساب"
          dir="ltr"
          inputMode="tel"
          required
        />
        <Button type="submit" variant="outline" disabled={pending}>
          {partner ? "حفظ" : "إضافة شريك"}
        </Button>
      </div>
    </form>
  );
}
