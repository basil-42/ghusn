"use client";

import { useState, type ReactNode } from "react";
import { NativeSelect } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AdjustmentForm, OpeningForm } from "./forms";

type Choice = "in" | "transfer" | "count";

const CHOICES: { key: Choice; title: string; hint: string }[] = [
  { key: "in", title: "🎁 مال دخل المحل", hint: "مال جديد من خارج المحل إلى علبة. ليس دخلاً ولا ربحاً." },
  { key: "transfer", title: "🔁 نقل بين علبتين", hint: "من محفظة الريال إلى بنكك، أو إيداع الخزنة في بنكك." },
  { key: "count", title: "🧮 عددت علبة", hint: "الرقم الحقيقي يختلف عن النظام: رسوم، خطأ قديم." },
];

/** «حركة مال» (D-144): ثلاثة اختيارات بلغة بسيطة بدل أسماء محاسبية، وكل اختيار يفتح نموذجه. */
export function MoneyMove({ income, transfer, count }: { income: ReactNode; transfer: ReactNode; count: ReactNode }) {
  const [choice, setChoice] = useState<Choice>("in");
  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="ماذا حدث؟" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {CHOICES.map((c) => (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={choice === c.key}
            onClick={() => setChoice(c.key)}
            className={cn(
              "flex min-h-20 flex-col gap-0.5 rounded-xl border px-4 py-3 text-start",
              choice === c.key ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/50",
            )}
          >
            <b className="text-[15px]">{c.title}</b>
            <span className="text-xs text-muted-foreground">{c.hint}</span>
          </button>
        ))}
      </div>
      <div>{choice === "in" ? income : choice === "transfer" ? transfer : count}</div>
    </div>
  );
}

/** «عددت علبة»: أول مرة = رصيد افتتاحي، وبعدها تسوية بسبب (D-86). */
export function CountForm({
  wallets,
  today,
}: {
  wallets: { id: string; name: string; symbol: string; hasOpening: boolean }[];
  today: string;
}) {
  const [id, setId] = useState(wallets[0]?.id ?? "");
  const w = wallets.find((x) => x.id === id);
  return (
    <div className="flex flex-col gap-3">
      <label className="flex max-w-sm flex-col gap-1">
        <span className="font-semibold">أي علبة؟</span>
        <NativeSelect value={id} onChange={(e) => setId(e.target.value)}>
          {wallets.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </NativeSelect>
      </label>
      {w ? (
        w.hasOpening ? (
          <AdjustmentForm key={w.id} walletId={w.id} symbol={w.symbol} today={today} />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">أول عدّ لهذه العلبة: يصير رصيدها الافتتاحي.</p>
            <OpeningForm key={w.id} walletId={w.id} symbol={w.symbol} today={today} />
          </>
        )
      ) : null}
    </div>
  );
}
