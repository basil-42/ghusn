"use client";

import { Check, MessageCircle } from "lucide-react";
import { useState } from "react";
import { NativeSelect } from "@/components/ui/input";
import { formatRelative } from "@/lib/format";
import type { OrderMessageOption } from "@/lib/order-messages";
import { cn } from "@/lib/utils";
import { logOrderMessageAction } from "../actions";

/** زر يفتح واتساب برسالة جاهزة لرقم العميل ويسجّل الإرسال؛ مع معاينة النص. */
function MessageButton({ orderId, m, primary }: { orderId: string; m: OrderMessageOption; primary?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <a
        href={m.href}
        target="_blank"
        rel="noreferrer"
        onClick={() => void logOrderMessageAction(orderId, m.key)}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-center font-semibold",
          primary
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "border border-border bg-card hover:bg-muted",
        )}
      >
        <MessageCircle aria-hidden className="size-4" /> {m.label}
      </a>
      {m.lastSent ? (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Check aria-hidden className="size-3.5" /> أُرسلت {formatRelative(m.lastSent.at)}
          {m.lastSent.by ? ` · ${m.lastSent.by}` : ""}
        </span>
      ) : null}
      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground">معاينة النص</summary>
        <p className="mt-1 whitespace-pre-line rounded-lg bg-muted p-3 leading-7">{m.text}</p>
      </details>
    </div>
  );
}

/**
 * رسائل واتساب للطلب (D-113): المقترحة لحالته أولاً، ثم غيرها، و«صنف غير متوفر» باختيار الصنف.
 * الرسالة تُفتح في واتساب برقم العميل لتضغط الموظفة «إرسال» — من رقم المحل الموحّد.
 */
export function OrderMessages({
  orderId,
  primary,
  others,
  unavailable,
}: {
  orderId: string;
  primary: OrderMessageOption | null;
  others: OrderMessageOption[];
  unavailable: OrderMessageOption[];
}) {
  const [item, setItem] = useState(0);
  if (!primary && !others.length && !unavailable.length) return null;
  return (
    <section aria-label="رسائل واتساب" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="font-semibold">رسالة للعميل على واتساب</h2>
      {primary ? <MessageButton orderId={orderId} m={primary} primary /> : null}
      {others.map((m) => (
        <MessageButton key={m.key} orderId={orderId} m={m} />
      ))}
      {unavailable.length ? (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">صنف غير متوفر</span>
            <NativeSelect value={item} onChange={(e) => setItem(Number(e.target.value))} aria-label="الصنف غير المتوفر">
              {unavailable.map((m, i) => (
                <option key={i} value={i}>
                  {m.item}
                </option>
              ))}
            </NativeSelect>
          </label>
          <MessageButton orderId={orderId} m={unavailable[item] ?? unavailable[0]!} />
          <span className="text-xs text-muted-foreground">اكتبي البديل مكان «____» في واتساب قبل الإرسال.</span>
        </div>
      ) : null}
    </section>
  );
}
