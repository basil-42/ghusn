"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { decideReturnRequestAction, type DecideState } from "./actions";

/** اعتماد أو رفض بضغطة؛ سبب الرفض اختياري ويصل للموظفة. */
export function DecideForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<DecideState, FormData>(decideReturnRequestAction, {});
  if (state.success) return <p className="text-sm font-semibold text-sage">{state.success}</p>;
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <Input name="note" placeholder="سبب الرفض (اختياري)" aria-label="سبب الرفض" maxLength={200} />
      <div className="grid grid-cols-2 gap-2">
        <Button type="submit" name="decision" value="reject" variant="outline" disabled={pending}>
          رفض
        </Button>
        <Button type="submit" name="decision" value="approve" disabled={pending}>
          اعتماد
        </Button>
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
    </form>
  );
}
