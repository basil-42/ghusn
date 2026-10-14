"use client";

import { Archive } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, useConfirmForm } from "@/components/ui/confirm-dialog";
import { archiveProductAction } from "./actions";

// الإجراء ينقل لقائمة المنتجات عند النجاح (redirect) ورسالة النجاح تعبر الانتقال (flash)
const archive = async (_prev: object, data: FormData) => {
  await archiveProductAction(data);
  return {};
};

/** أرشفة المنتج بنافذة تأكيد (D-140). */
export function ArchiveProductForm({ productId, name }: { productId: string; name: string }) {
  const [state, action, pending] = useActionState<{ error?: string }, FormData>(archive, {});
  const confirm = useConfirmForm(action, state, pending);
  return (
    <form action={action} onSubmit={confirm.onSubmit} className="border-t border-border pt-6">
      <input type="hidden" name="productId" value={productId} />
      <Button type="submit" variant="outline" className="text-destructive">
        <Archive aria-hidden /> أرشفة المنتج
      </Button>
      <ConfirmDialog
        {...confirm.dialog}
        tone="danger"
        icon={Archive}
        title={`أرشفة «${name}»؟`}
        description="يختفي من القوائم، ويبقى في السجلات والتقارير."
        confirmLabel="أرشفة المنتج"
        pendingLabel="جارٍ الأرشفة…"
      />
    </form>
  );
}
