"use client";

import { formatAmount } from "@/lib/format";
import type { SafeStatus } from "@/lib/shifts";
import type { WalletPick } from "@/lib/wallets";
import { cn } from "@/lib/utils";

/** «دُفع من خارج المحل» (المالك، D-143): لا تنقص أي محفظة. */
export const OUTSIDE = "OUTSIDE";

/**
 * من أين خرج المال؟ (D-143) — اختيار المحفظة كبطاقات، ولكل اختيار أثره قبل الحفظ: الخزنة تُخصم من
 * الوردية المفتوحة (أو تُمنع بلا وردية)، و«من خارج المحل» لا يمس أي محفظة. القيمة في `name` (walletId).
 */
export function PaySource({
  name = "walletId",
  wallets,
  safe,
  allowOutside,
  value,
  onChange,
  amount,
}: {
  name?: string;
  wallets: WalletPick[];
  safe: SafeStatus;
  allowOutside: boolean;
  value: string;
  onChange: (value: string) => void;
  /** المبلغ المكتوب — لعرض «المتوقع في الدرج: قبل ← بعد» */
  amount: string;
}) {
  const isSafe = value === safe.cashWalletId;
  const typed = /^\d+(\.\d+)?$/.test(amount.replace(/[,\s]/g, "")) ? amount.replace(/[,\s]/g, "") : null;
  const after = safe.shift && typed ? (Number(safe.shift.expectedSdg) - Number(typed)).toFixed(0) : null;
  // الخزنة أولاً: أكثر ما يُدفع منه في المحل
  const ordered = [...wallets].sort(
    (a, b) => Number(b.value === safe.cashWalletId) - Number(a.value === safe.cashWalletId),
  );
  const options = [
    ...ordered.map((w) => ({
      value: w.value,
      title: w.value === safe.cashWalletId ? "الخزنة" : w.label.replace(/ — المتاح.*$/, ""),
      hint: w.value === safe.cashWalletId ? "من مبيعات اليوم في الدرج" : null,
      side: w.available !== null ? `${formatAmount(w.available, w.currency === "SDG" ? 0 : 2)} متاح` : null,
    })),
    ...(allowOutside
      ? [{ value: OUTSIDE, title: "دُفع من خارج المحل", hint: "للمالك · لا تنقص أي محفظة", side: null }]
      : []),
  ];
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1.5 text-sm font-semibold">من أين خرج المال؟</legend>
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-col gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2",
              value === o.value ? "border-primary ring-1 ring-primary" : "border-border",
            )}
          >
            <input
              type="radio"
              name={`${name}-pick`}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="size-4 accent-forest"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{o.title}</span>
              {o.hint ? <span className="block text-xs text-muted-foreground">{o.hint}</span> : null}
            </span>
            {o.side ? <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{o.side}</span> : null}
          </label>
        ))}
      </div>
      {isSafe ? (
        safe.shift ? (
          <p className="rounded-xl bg-sage/15 px-3 py-2 text-sm">
            يخرج من <b>وردية {safe.shift.holder}</b> المفتوحة.
            <br />
            المتوقع في الدرج: <bdi className="font-bold tabular-nums">{formatAmount(safe.shift.expectedSdg, 0)}</bdi>
            {after !== null ? (
              <>
                {" ← "}
                <bdi className="font-bold tabular-nums">{formatAmount(after, 0)}</bdi>
              </>
            ) : null}
          </p>
        ) : (
          <p className="rounded-xl bg-muted px-3 py-2 text-sm">
            لا توجد وردية مفتوحة — ينقص رصيد الخزنة باسمك، والوردية التالية تبدأ من الرصيد الجديد.
          </p>
        )
      ) : null}
    </fieldset>
  );
}
