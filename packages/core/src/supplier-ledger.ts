import { dec, roundMoney, type Decimal, type DecimalInput } from "./decimal";

/**
 * حساب المورد (D-74): رصيد بعملة المورد + قيمته الدفترية بالدولار.
 *
 * - كل حركة لها مبلغ بعملة المورد (موجب = يزيد ما علينا للمورد، سالب = ينقصه)
 *   وقيمتها الدقيقة بالدولار: الشراء بسعر يوم الشراء، والدفعة بما خرج فعلاً من المحفظة.
 * - الخيار أ (D-75): تكلفة البضاعة تبقى بسعر يوم الشراء؛ الفرق عند السداد بسعر آخر
 *   = ربح/خسارة عملة منفصلة (موجب = ربح).
 * - التسوية بمتوسط مرجّح للرصيد القائم. يعمل في الاتجاهين: سداد دين، أو استهلاك دفعة مقدّمة بشحنة.
 *
 * فروقات العملة لا تُخزَّن؛ تُشتق بإعادة تشغيل الحركات بالترتيب — فإلغاء حركة خاطئة يصحّح كل شيء.
 */
export interface LedgerMovement {
  /** بعملة المورد، بإشارة: + علينا، − لنا. */
  amount: DecimalInput;
  /** القيمة الدقيقة بالدولار بنفس الإشارة (غير مقرّبة). */
  usd: DecimalInput;
}

export interface LedgerLine<T> {
  entry: T;
  /** الرصيد بعد الحركة بعملة المورد (موجب = علينا للمورد). */
  balance: Decimal;
  /** القيمة الدفترية للرصيد بالدولار. */
  balanceUsd: Decimal;
  /** فرق عملة محقَّق بهذه الحركة (موجب = ربح)، مقرّب لخانتين. */
  realizedFxUsd: Decimal;
}

export interface LedgerReplay<T> {
  lines: LedgerLine<T>[];
  balance: Decimal;
  balanceUsd: Decimal;
  realizedFxUsd: Decimal;
}

export function replaySupplierLedger<T extends LedgerMovement>(entries: readonly T[]): LedgerReplay<T> {
  let A = dec(0); // الرصيد بعملة المورد
  let U = dec(0); // قيمته الدفترية بالدولار (دقيقة)
  let totalFx = dec(0);
  const lines: LedgerLine<T>[] = [];

  for (const entry of entries) {
    const a = dec(entry.amount);
    const u = dec(entry.usd);
    let fx = dec(0);

    if (!a.isZero()) {
      if (A.isZero() || a.isNegative() === A.isNegative()) {
        // نفس الاتجاه: يضاف للرصيد القائم
        A = A.plus(a);
        U = U.plus(u);
      } else {
        // اتجاه معاكس: تسوية جزء (أو كل) الرصيد القائم بسعره الدفتري
        const settled = a.abs().lt(A.abs()) ? a.abs() : A.abs();
        const bookUsd = U.mul(settled).div(A.abs());
        const txUsd = u.mul(settled).div(a.abs());
        fx = bookUsd.plus(txUsd);
        A = A.minus(A.isNegative() ? settled.neg() : settled);
        U = U.minus(bookUsd);
        // ما يزيد عن الرصيد يفتح رصيداً جديداً بسعر هذه الحركة
        const rest = a.abs().minus(settled);
        if (rest.gt(0)) {
          A = A.plus(a.isNegative() ? rest.neg() : rest);
          U = U.plus(u.mul(rest).div(a.abs()));
        }
      }
    }

    totalFx = totalFx.plus(fx);
    lines.push({ entry, balance: A, balanceUsd: roundMoney(U), realizedFxUsd: roundMoney(fx) });
  }

  return { lines, balance: A, balanceUsd: roundMoney(U), realizedFxUsd: roundMoney(totalFx) };
}
