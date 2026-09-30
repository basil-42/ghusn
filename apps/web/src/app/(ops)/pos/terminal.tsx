"use client";

import {
  applyExchangeCredit,
  computeSale,
  dec,
  percentOf,
  plainNumber,
  toLatinDigits,
  type SaleTotals,
} from "@ghusn/core";
import { createId } from "@paralleldrive/cuid2";
import { Minus, Plus, ScanBarcode, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAmount } from "@/lib/format";
import type { PosItem } from "@/lib/sales";
import { Receipt, type ReceiptData } from "@/components/receipt";
import { getMeta, nextLocalNumber, pendingCount, posDb, searchCatalog } from "@/lib/pos-offline/db";
import { usePosSync } from "@/lib/pos-offline/use-pos-sync";
import type { ReceiptSettings } from "@/lib/settings";
import { createSaleAction, findItemsAction } from "./actions";
import { ApprovalDialog } from "./approval-dialog";

type Mode = "amount" | "percent";
type CartLine = PosItem & { qty: string; discountMode: Mode; discount: string };

const clean = (v: string) =>
  toLatinDigits(v)
    .replace(/[,\s٬]/g, "")
    .replace("٫", ".");
const num = (v: string) => (/^\d+(\.\d+)?$/.test(clean(v)) ? clean(v) : "0");
const sdg = (v: { toString(): string }) => `${formatAmount(v.toString(), 0)} ج.س`;

/** خصم بالنسبة أو بالمبلغ ← مبلغ صحيح بالجنيه (النسبة تُقرَّب للأسفل). */
function discountAmount(base: { toString(): string }, mode: Mode, value: string): string {
  const v = num(value);
  if (mode === "percent") return dec(v).gt(100) ? "0" : percentOf(base.toString(), v).toFixed(0);
  return dec(v).floor().toFixed(0);
}

/**
 * شاشة البيع: المسح (قارئ الباركود يكتب ثم Enter) أو البحث، السلة، الخصم على الصنف أو الفاتورة،
 * العميل، والدفع المقسوم. الإجماليات هنا للعرض بنفس دالة الخادم؛ الخادم يعيد حسابها من القاعدة.
 */
export function PosTerminal({
  maxDiscountPercent,
  hasRate,
  credit,
}: {
  maxDiscountPercent: number;
  hasRate: boolean;
  /** استبدال: رصيد مرتجع يُستخدم أولاً في هذه الفاتورة (D-81). */
  credit?: { returnId: string; number: string; amountSdg: string } | null;
}) {
  const router = useRouter();
  const scanRef = useRef<HTMLInputElement>(null);
  const [saleId, setSaleId] = useState(() => createId());
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState<PosItem[]>([]);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [invoiceMode, setInvoiceMode] = useState<Mode>("amount");
  const [invoiceDiscount, setInvoiceDiscount] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [cash, setCash] = useState<string | null>(null);
  const [bankak, setBankak] = useState("");
  const [bankakRef, setBankakRef] = useState("");
  const [tendered, setTendered] = useState("");
  const [approval, setApproval] = useState<{ reasons: string[] } | null>(null);
  const [pending, startTransition] = useTransition();
  const sync = usePosSync();
  // إيصال فاتورة حُفظت على الجهاز دون اتصال (D-82)
  const [localReceipt, setLocalReceipt] = useState<{ data: ReceiptData; settings: ReceiptSettings } | null>(null);

  function add(item: PosItem) {
    setChoices([]);
    setQuery("");
    if (!item.priceSdg) {
      setMessage({ kind: "error", text: `${item.label}: لا سعر له بعد — اطلبي من المديرة اعتماد سعره.` });
      return;
    }
    setMessage(null);
    setCart((c) => {
      const found = c.find((l) => l.variantId === item.variantId);
      if (found) return c.map((l) => (l === found ? { ...l, qty: dec(num(l.qty)).plus(1).toFixed() } : l));
      return [...c, { ...item, qty: "1", discountMode: "amount", discount: "" }];
    });
    scanRef.current?.focus();
  }

  function scan() {
    const q = query.trim();
    if (!q) return;
    startTransition(async () => {
      // البحث في نسخة الجهاز أولاً (فوري ويعمل دون اتصال)، ثم الخادم لصنف جديد لم يُنسخ بعد
      let items = await searchCatalog(q);
      if (items.length === 0 && navigator.onLine) items = await findItemsAction(q).catch(() => []);
      if (items.length === 1 && items[0]) add(items[0]);
      else if (items.length === 0) setMessage({ kind: "error", text: `لا يوجد صنف بـ «${q}».` });
      else setChoices(items);
    });
  }

  const update = (id: string, patch: Partial<CartLine>) =>
    setCart((c) => c.map((l) => (l.variantId === id ? { ...l, ...patch } : l)));

  // الإجماليات (للعرض)
  let totals: SaleTotals | null = null;
  let totalsError: string | null = null;
  if (cart.length) {
    try {
      const lines = cart.map((l) => {
        const gross = dec(num(l.qty))
          .mul(l.priceSdg ?? "0")
          .toDecimalPlaces(0);
        return {
          key: l.variantId,
          qty: num(l.qty),
          unitPriceSdg: l.priceSdg ?? "0",
          lineDiscountSdg: discountAmount(gross, l.discountMode, l.discount),
        };
      });
      const afterLines = lines.reduce(
        (acc, l) => acc.plus(dec(l.qty).mul(l.unitPriceSdg).toDecimalPlaces(0)).minus(l.lineDiscountSdg),
        dec(0),
      );
      totals = computeSale(lines, discountAmount(afterLines, invoiceMode, invoiceDiscount));
    } catch {
      totalsError = "تحققي من الكميات والخصومات (الخصم لا يزيد عن المبلغ).";
    }
  }
  const total = totals?.totalSdg.toFixed(0) ?? "0";
  const exchange = credit ? applyExchangeCredit(credit.amountSdg, total) : null;
  // المطلوب دفعه بعد رصيد الاستبدال
  const due = exchange ? exchange.dueSdg.toFixed(0) : total;
  const cashDue = cash ?? dec(due).minus(num(bankak)).toFixed(0);
  const paidSum = dec(num(cashDue)).plus(num(bankak));
  const change = tendered ? dec(num(tendered)).minus(num(cashDue)) : dec(0);
  const discountPct = totals && totals.subtotalSdg.gt(0) ? totals.discountSdg.div(totals.subtotalSdg).mul(100) : dec(0);

  function reset() {
    setCart([]);
    setInvoiceDiscount("");
    setCustomerPhone("");
    setCustomerName("");
    setCash(null);
    setBankak("");
    setBankakRef("");
    setTendered("");
    setApproval(null);
    setSaleId(createId());
  }

  /** حفظ الفاتورة على الجهاز عند الانقطاع — تُرسل تلقائياً عند عودة الاتصال (D-63، D-82). */
  async function saveOffline(input: Record<string, unknown>, t: SaleTotals) {
    if (credit) {
      setMessage({ kind: "error", text: "الاستبدال يحتاج اتصالاً بالإنترنت." });
      return;
    }
    if (discountPct.gt(maxDiscountPercent)) {
      setMessage({
        kind: "error",
        text: `الخصم فوق حدّك (${maxDiscountPercent}%) يحتاج موافقة، والموافقة تحتاج اتصالاً.`,
      });
      return;
    }
    const cashier = await getMeta<{ id: string; name: string }>("cashier");
    const settings = await getMeta<ReceiptSettings>("receipt");
    if (!cashier || !settings) {
      setMessage({ kind: "error", text: "افتحي نقطة البيع مرة مع الاتصال أولاً ليُحفظ الكتالوج على الجهاز." });
      return;
    }
    const localNumber = await nextLocalNumber();
    const createdAt = new Date();
    const payments = [
      { method: "CASH" as const, amountSdg: num(cashDue), reference: null },
      { method: "BANKAK" as const, amountSdg: num(bankak), reference: bankakRef || null },
    ].filter((p) => dec(p.amountSdg).gt(0));
    const data: ReceiptData = {
      number: localNumber,
      createdAt,
      cashierName: cashier.name,
      customer: customerPhone ? { phone: customerPhone, name: customerName || null } : null,
      subtotalSdg: t.subtotalSdg.toFixed(0),
      discountSdg: t.discountSdg.toFixed(0),
      totalSdg: t.totalSdg.toFixed(0),
      cashTenderedSdg: tendered ? num(tendered) : null,
      changeSdg: change.gt(0) ? change.toFixed(0) : "0",
      lines: cart.map((l) => {
        const line = t.lines.find((x) => x.key === l.variantId);
        return {
          id: l.variantId,
          label: l.label,
          qty: num(l.qty),
          unitPriceSdg: l.priceSdg ?? "0",
          lineDiscountSdg: line?.lineDiscountSdg.toFixed(0) ?? "0",
          amountSdg: line ? line.grossSdg.minus(line.lineDiscountSdg).toFixed(0) : "0",
        };
      }),
      payments,
    };
    await posDb.transaction("rw", posDb.outbox, posDb.catalog, async () => {
      await posDb.outbox.add({
        id: saleId,
        localNumber,
        createdAt: createdAt.toISOString(),
        cashierId: cashier.id,
        payload: {
          ...input,
          createdAt: createdAt.toISOString(),
          localNumber,
          unitPrices: Object.fromEntries(cart.map((l) => [l.variantId, l.priceSdg ?? "0"])),
        },
        receipt: data,
        status: "pending",
        attempts: 0,
      });
      // الرصيد على الجهاز ينقص فوراً (يُصحَّح من الخادم عند المزامنة)
      for (const l of cart) {
        const item = await posDb.catalog.get(l.variantId);
        if (item) await posDb.catalog.update(l.variantId, { stockQty: dec(item.stockQty).minus(num(l.qty)).toFixed() });
      }
    });
    sync.setPending(await pendingCount());
    reset();
    setLocalReceipt({ data, settings });
  }

  function submit(withApproval?: { phone: string; password: string }) {
    if (!totals) return;
    const t = totals;
    startTransition(async () => {
      const input = {
        id: saleId,
        lines: cart.map((l) => ({
          variantId: l.variantId,
          qty: num(l.qty),
          lineDiscountSdg: t.lines.find((x) => x.key === l.variantId)?.lineDiscountSdg.toFixed(0) ?? "0",
        })),
        invoiceDiscountSdg: t.invoiceDiscountSdg.toFixed(0),
        payments: [
          { method: "CASH", amountSdg: num(cashDue), reference: null },
          { method: "BANKAK", amountSdg: num(bankak), reference: bankakRef },
        ],
        cashTenderedSdg: tendered ? num(tendered) : null,
        customerPhone,
        customerName,
        approval: withApproval ?? null,
        creditReturnId: credit?.returnId ?? null,
      };
      if (!navigator.onLine) return saveOffline(input, t);
      let result;
      try {
        result = await createSaleAction(input);
      } catch {
        // انقطع الاتصال أثناء الإرسال — نفس المعرّف، فلا تكرار إن كان وصل فعلاً
        return saveOffline(input, t);
      }
      if ("ok" in result) {
        reset();
        router.push(`/pos/receipt/${result.id}`);
      } else if ("approvalRequired" in result) {
        setApproval({ reasons: result.approvalRequired });
      } else {
        setMessage({ kind: "error", text: result.error });
      }
    });
  }

  const canPay = !!totals && cart.length > 0 && paidSum.eq(due) && !change.lt(0) && !pending && hasRate;

  if (localReceipt) {
    return (
      <div className="flex flex-col items-center gap-4">
        <style>{`@page { size: 80mm auto; margin: 0; } @media print { body * { visibility: hidden; } .receipt, .receipt * { visibility: visible; } .receipt { position: absolute; inset: 0 auto auto 0; } }`}</style>
        <Alert className="max-w-md print:hidden">
          حُفظت الفاتورة على الجهاز (دون اتصال) وتُرسل تلقائياً عند عودة الإنترنت. رقمها المؤقت{" "}
          <bdi dir="ltr">{localReceipt.data.number}</bdi>.
        </Alert>
        <div className="flex gap-2 print:hidden">
          <Button type="button" onClick={() => window.print()}>
            طباعة
          </Button>
          <Button type="button" variant="outline" onClick={() => setLocalReceipt(null)}>
            بيع جديد
          </Button>
        </div>
        <div className="rounded-xl border border-border shadow-sm print:border-0 print:shadow-none">
          <Receipt data={localReceipt.data} settings={localReceipt.settings} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_22rem]">
      <section className="flex min-w-0 flex-col gap-3">
        <SyncBar {...sync} />
        {!hasRate ? <Alert variant="destructive">لا يوجد سعر للجنيه — لا يمكن البيع حتى تُدخله المديرة.</Alert> : null}
        {message ? <Alert variant={message.kind === "error" ? "destructive" : "default"}>{message.text}</Alert> : null}
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            scan();
          }}
        >
          <ScanBarcode
            aria-hidden
            className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={scanRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="امسحي الباركود أو ابحثي بالاسم"
            aria-label="مسح أو بحث"
            className="min-h-14 ps-12 text-lg"
            autoFocus
          />
          {choices.length ? (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-80 overflow-auto rounded-xl border border-border bg-card shadow-lg">
              {choices.map((c) => (
                <li key={c.variantId}>
                  <button
                    type="button"
                    onClick={() => add(c)}
                    className="flex min-h-12 w-full items-center justify-between gap-2 px-4 text-start hover:bg-muted"
                  >
                    <span>{c.label}</span>
                    <span className="text-sm tabular-nums">{c.priceSdg ? sdg(c.priceSdg) : "بلا سعر"}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </form>

        {cart.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
            الفاتورة فارغة — امسحي أول صنف.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {cart.map((l) => {
              const line = totals?.lines.find((x) => x.key === l.variantId);
              return (
                <li key={l.variantId} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{l.label}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {sdg(l.priceSdg ?? "0")} · الرصيد {plainNumber(l.stockQty)}
                      </p>
                    </div>
                    <p className="font-bold tabular-nums">
                      {line ? sdg(line.grossSdg.minus(line.lineDiscountSdg)) : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="إنقاص"
                      onClick={() => {
                        const next = dec(num(l.qty)).minus(1);
                        if (next.lte(0)) setCart((c) => c.filter((x) => x.variantId !== l.variantId));
                        else update(l.variantId, { qty: next.toFixed() });
                      }}
                    >
                      <Minus aria-hidden />
                    </Button>
                    <Input
                      value={l.qty}
                      onChange={(e) => update(l.variantId, { qty: e.target.value })}
                      inputMode="decimal"
                      dir="ltr"
                      aria-label="الكمية"
                      className="w-16 text-center tabular-nums"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="زيادة"
                      onClick={() => update(l.variantId, { qty: dec(num(l.qty)).plus(1).toFixed() })}
                    >
                      <Plus aria-hidden />
                    </Button>
                    <DiscountInput
                      label="خصم الصنف"
                      mode={l.discountMode}
                      value={l.discount}
                      onMode={(m) => update(l.variantId, { discountMode: m })}
                      onValue={(v) => update(l.variantId, { discount: v })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="حذف"
                      className="ms-auto text-destructive"
                      onClick={() => setCart((c) => c.filter((x) => x.variantId !== l.variantId))}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 lg:sticky lg:top-4 lg:self-start">
        <div className="flex flex-col gap-1">
          <DiscountInput
            label="خصم الفاتورة"
            mode={invoiceMode}
            value={invoiceDiscount}
            onMode={setInvoiceMode}
            onValue={setInvoiceDiscount}
          />
          {discountPct.gt(maxDiscountPercent) ? (
            <p className="text-sm text-warning">
              الخصم {discountPct.toFixed(1)}% فوق حدّك ({maxDiscountPercent}%) — سيحتاج موافقة.
            </p>
          ) : null}
        </div>

        <dl className="flex flex-col gap-1 border-y border-border py-3 tabular-nums">
          <div className="flex justify-between">
            <dt>المجموع</dt>
            <dd>{sdg(totals?.subtotalSdg ?? 0)}</dd>
          </div>
          {totals?.discountSdg.gt(0) ? (
            <div className="flex justify-between text-muted-foreground">
              <dt>الخصم</dt>
              <dd>−{sdg(totals.discountSdg)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between text-2xl font-bold">
            <dt>الإجمالي</dt>
            <dd>{sdg(total)}</dd>
          </div>
          {exchange && credit ? (
            <>
              <div className="flex justify-between text-primary">
                <dt>
                  رصيد استبدال <bdi dir="ltr">{credit.number}</bdi>
                </dt>
                <dd>−{sdg(exchange.usedSdg)}</dd>
              </div>
              <div className="flex justify-between font-bold">
                <dt>المطلوب</dt>
                <dd>{sdg(due)}</dd>
              </div>
              {exchange.cashBackSdg.gt(0) ? (
                <p className="text-sm font-bold text-warning">يُرد للعميل نقداً: {sdg(exchange.cashBackSdg)}</p>
              ) : null}
            </>
          ) : null}
        </dl>
        {totalsError ? <p className="text-sm text-destructive">{totalsError}</p> : null}

        <div className="grid grid-cols-2 gap-2">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-semibold">نقداً</span>
            <Input value={cashDue} onChange={(e) => setCash(e.target.value)} inputMode="numeric" dir="ltr" />
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-semibold">بنكك</span>
            <Input
              value={bankak}
              onChange={(e) => {
                setBankak(e.target.value);
                setCash(null); // النقد = الباقي تلقائياً
              }}
              inputMode="numeric"
              dir="ltr"
            />
          </label>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => (setBankak(""), setCash(null))}>
            الكل نقداً
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => (setBankak(due), setCash("0"))}>
            الكل بنكك
          </Button>
        </div>
        {dec(num(bankak)).gt(0) ? (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">رقم عملية بنكك (اختياري)</span>
            <Input value={bankakRef} onChange={(e) => setBankakRef(e.target.value)} dir="ltr" maxLength={60} />
          </label>
        ) : null}
        {dec(num(cashDue)).gt(0) ? (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">المبلغ المستلم نقداً (لحساب الباقي)</span>
            <Input value={tendered} onChange={(e) => setTendered(e.target.value)} inputMode="numeric" dir="ltr" />
            {tendered ? (
              <span className={`font-bold tabular-nums ${change.lt(0) ? "text-destructive" : ""}`}>
                {change.lt(0) ? "المستلم أقل من المطلوب" : `الباقي للعميل: ${sdg(change)}`}
              </span>
            ) : null}
          </label>
        ) : null}
        {!paidSum.eq(due) && cart.length ? (
          <p className="text-sm text-destructive">
            المدفوع {sdg(paidSum)} لا يساوي المطلوب ({sdg(due)}).
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
          <Input
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="هاتف العميل (اختياري)"
            aria-label="هاتف العميل"
            inputMode="tel"
            dir="ltr"
          />
          <Input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="اسم العميل (اختياري)"
            aria-label="اسم العميل"
          />
        </div>

        <Button type="button" className="min-h-14 text-lg" disabled={!canPay} onClick={() => submit()}>
          {pending ? "جارٍ الحفظ…" : `إتمام البيع ${cart.length ? sdg(total) : ""}`}
        </Button>
        {cart.length ? (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            onClick={() => window.confirm("إلغاء الفاتورة الحالية؟") && reset()}
          >
            إلغاء الفاتورة
          </Button>
        ) : null}
      </aside>

      {approval ? (
        <ApprovalDialog
          reasons={approval.reasons}
          pending={pending}
          onApprove={(credentials) => submit(credentials)}
          onCancel={() => setApproval(null)}
        />
      ) : null}
    </div>
  );
}

function DiscountInput({
  label,
  mode,
  value,
  onMode,
  onValue,
}: {
  label: string;
  mode: Mode;
  value: string;
  onMode: (m: Mode) => void;
  onValue: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Input
        value={value}
        onChange={(e) => onValue(e.target.value)}
        placeholder={label}
        aria-label={label}
        inputMode="decimal"
        dir="ltr"
        className="w-28"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={`${label}: ${mode === "percent" ? "نسبة" : "مبلغ"}`}
        onClick={() => onMode(mode === "percent" ? "amount" : "percent")}
        className="min-w-12"
      >
        {mode === "percent" ? "%" : "ج.س"}
      </Button>
    </div>
  );
}

/** شريط الاتصال: دون اتصال، أو فواتير بانتظار الإرسال، أو جلسة منتهية. */
function SyncBar({
  online,
  pending,
  needsLogin,
  syncing,
  sync,
}: {
  online: boolean;
  pending: number;
  needsLogin: boolean;
  syncing: boolean;
  sync: () => Promise<void>;
}) {
  if (online && pending === 0 && !needsLogin) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-sm font-semibold text-warning"
    >
      <span>
        {!online ? "دون اتصال — البيع مستمر ويُحفظ على الجهاز. " : ""}
        {pending ? `${pending} فاتورة بانتظار الإرسال.` : ""}
        {needsLogin ? " انتهت الجلسة — سجّلي الدخول لإرسال الفواتير." : ""}
      </span>
      {online && pending ? (
        <Button type="button" size="sm" variant="outline" disabled={syncing} onClick={() => void sync()}>
          {syncing ? "جارٍ الإرسال…" : "إرسال الآن"}
        </Button>
      ) : null}
    </div>
  );
}
