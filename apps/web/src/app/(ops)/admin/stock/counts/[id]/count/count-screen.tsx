"use client";

import { dec } from "@ghusn/core";
import { Minus, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { BarcodeScanner } from "@/components/admin/barcode-scanner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CounterLine } from "@/lib/stock-counts";
import { lookupLineAction, markMissingAction, saveLineAction, submitCountAction, type FormState } from "../../actions";

const UNIT_LABEL: Record<string, string> = { PIECE: "حبة", METER: "متر", SHEET: "ورقة" };

/**
 * شاشة العد على الجوال (D-112): مسح بالكاميرا أو بقارئ الباركود أو بحث بالاسم، ثم العدد على الرف.
 * مسح نفس الصنف مرة أخرى يزيد العدد 1 (العد قطعة قطعة). لا يظهر رصيد النظام — عدّ أعمى.
 */
export function CountScreen({
  countId,
  recountMode,
  recent,
  recount,
}: {
  countId: string;
  recountMode: boolean;
  recent: (CounterLine & { by: string | null })[];
  recount: CounterLine[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState<CounterLine | null>(null);
  const [qty, setQty] = useState("1");
  const [choices, setChoices] = useState<CounterLine[]>([]);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  function pick(line: CounterLine) {
    setChoices([]);
    setQuery("");
    if (current && current.lineId === line.lineId) {
      // نفس الصنف ممسوح مرة أخرى ← +1
      setQty((q) => (/^\d+(\.\d+)?$/.test(q.trim()) ? dec(q.trim()).plus(1).toFixed() : "1"));
    } else {
      setCurrent(line);
      setQty("1");
    }
    setMsg(null);
  }

  function lookup(text: string) {
    const q = text.trim();
    if (!q) return;
    start(async () => {
      const r = await lookupLineAction(countId, q);
      if (r.line) pick(r.line);
      else if (r.lines) {
        setChoices(r.lines);
        setMsg(null);
      } else if (r.error) setMsg({ kind: "error", text: r.error });
    });
  }

  function save() {
    if (!current) return;
    start(async () => {
      const r = await saveLineAction(countId, current.lineId, qty);
      if (r.error) {
        setMsg({ kind: "error", text: r.error });
        return;
      }
      setMsg({ kind: "ok", text: `حُفظ: ${current.label} = ${qty}` });
      setCurrent(null);
      setQty("1");
      router.refresh();
    });
  }

  const step = current?.unit === "PIECE" || !current ? 1 : 0.5;
  const bump = (d: number) => {
    const n = (/^\d+(\.\d+)?$/.test(qty.trim()) ? dec(qty) : dec(0)).plus(d);
    setQty(n.lt(0) ? "0" : n.toFixed());
  };

  return (
    <div className="flex flex-col gap-4">
      {recountMode ? (
        <Alert variant="warning">
          أُرسل هذا الجرد للمراجعة. طُلبت إعادة عدّ {recount.length === 1 ? "صنف واحد" : `${recount.length} أصناف`} —
          عُدّيها من جديد.
        </Alert>
      ) : null}
      {recount.length ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-sand bg-card p-4">
          <b>طُلبت إعادة عدّها</b>
          <ul className="flex flex-col gap-1">
            {recount.map((l) => (
              <li key={l.lineId}>
                <button
                  type="button"
                  onClick={() => pick(l)}
                  className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-2 text-start hover:bg-muted"
                >
                  <span>{l.label}</span>
                  <span className="text-sm font-semibold text-warning">عُدّيه</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <BarcodeScanner onCode={lookup} />

      <form
        className="grid grid-cols-[1fr_auto] gap-2"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          lookup(query);
        }}
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="الباركود أو الاسم (أو قارئ الباركود)"
          aria-label="بحث عن صنف"
          enterKeyHint="search"
          autoComplete="off"
        />
        <Button type="submit" variant="outline" disabled={pending}>
          <Search aria-hidden /> بحث
        </Button>
      </form>

      {choices.length ? (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {choices.map((l) => (
            <li key={l.lineId}>
              <button
                type="button"
                onClick={() => pick(l)}
                className="flex min-h-12 w-full items-center justify-between gap-2 px-4 text-start hover:bg-muted"
              >
                <span>{l.label}</span>
                <bdi dir="ltr" className="text-sm text-muted-foreground">
                  {l.sku}
                </bdi>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {msg ? <Alert variant={msg.kind === "ok" ? "success" : "destructive"}>{msg.text}</Alert> : null}

      {current ? (
        <section
          aria-label="الصنف الممسوح"
          className="flex flex-col gap-3 rounded-2xl border-2 border-sage bg-card p-4"
        >
          <div>
            <b className="text-lg">{current.label}</b>
            <bdi dir="ltr" className="block text-sm text-muted-foreground">
              {current.sku}
            </bdi>
            {current.countedQty !== null && current.status !== "RECOUNT" ? (
              <span className="text-sm text-warning">
                عُدّ من قبل: {dec(current.countedQty).toFixed()} — الحفظ يستبدله
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="count-qty" className="flex-1 font-semibold">
              العدد على الرف ({UNIT_LABEL[current.unit] ?? current.unit})
            </label>
            <Button type="button" variant="outline" size="icon" aria-label="إنقاص" onClick={() => bump(-step)}>
              <Minus aria-hidden />
            </Button>
            <Input
              id="count-qty"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode="decimal"
              dir="ltr"
              className="w-20 text-center text-xl font-bold"
            />
            <Button type="button" variant="outline" size="icon" aria-label="زيادة" onClick={() => bump(step)}>
              <Plus aria-hidden />
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">مسح نفس الصنف مرة أخرى يزيد العدد 1.</span>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button type="button" onClick={save} disabled={pending} className="min-h-12 text-base">
              {pending ? "جارٍ الحفظ…" : "حفظ والتالي"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setCurrent(null)}>
              إلغاء
            </Button>
          </div>
        </section>
      ) : null}

      {recent.length ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-bold text-muted-foreground">آخر ما عُدّ</h2>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {recent.map((l) => (
              <li key={l.lineId} className="flex min-h-12 items-center gap-2 px-4">
                <span className="flex-1">
                  {l.label}
                  {l.by ? <span className="block text-xs text-muted-foreground">{l.by}</span> : null}
                </span>
                <b className="tabular-nums">
                  {l.status === "MISSING" ? "غير موجود" : dec(l.countedQty ?? "0").toFixed()}
                </b>
                {!recountMode ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => pick(l)}>
                    تعديل
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!recountMode ? (
        <Button asChild variant="outline" className="min-h-12">
          <Link href={`/admin/stock/counts/${countId}/count?view=finish`}>إنهاء العد</Link>
        </Button>
      ) : null}
    </div>
  );
}

/** إنهاء العد: ما لم يُعدّ (عُدّيه أو «غير موجود»)، ثم الإرسال للمراجعة. */
export function FinishCount({
  countId,
  pending,
  pendingCount,
  done,
}: {
  countId: string;
  pending: CounterLine[];
  pendingCount: number;
  done: number;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<FormState>({});
  const [state, action, submitting] = useActionState<FormState, FormData>(submitCountAction, {});

  const missing = (ids: string[] | "all") =>
    start(async () => {
      setMsg(await markMissingAction(countId, ids));
      router.refresh();
    });

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="success">{state.success}</Alert>
        <Button asChild>
          <Link href="/admin/stock">المخزون</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <span className="text-sm text-muted-foreground">عُدّت</span>
          <b className="block text-3xl">{done}</b>
        </div>
        <div className={`rounded-2xl border bg-card p-4 ${pendingCount ? "border-sand" : "border-border"}`}>
          <span className="text-sm text-muted-foreground">لم تُعدّ</span>
          <b className="block text-3xl">{pendingCount}</b>
        </div>
      </div>
      {msg.error ? <Alert variant="destructive">{msg.error}</Alert> : null}
      {msg.success ? <Alert variant="success">{msg.success}</Alert> : null}
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}

      {pendingCount ? (
        <section className="flex flex-col gap-2 rounded-2xl border border-sand bg-card p-4">
          <b>أصناف لم تُعدّ</b>
          <p className="text-sm text-muted-foreground">
            إن لم تجديها على الرف فعلاً اختاري «غير موجود» — وإلا ارجعي وعُدّيها.
          </p>
          <ul className="divide-y divide-border">
            {pending.map((l) => (
              <li key={l.lineId} className="flex min-h-12 flex-wrap items-center gap-2 py-1">
                <span className="flex-1">{l.label}</span>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/stock/counts/${countId}/count`}>عُدّيه</Link>
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => missing([l.lineId])}>
                  غير موجود
                </Button>
              </li>
            ))}
          </ul>
          {pendingCount > pending.length ? (
            <p className="text-sm text-muted-foreground">و{pendingCount - pending.length} أخرى…</p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`اعتبار ${pendingCount} صنف «غير موجود» (العدد صفر)؟`)) missing("all");
            }}
          >
            اعتبار كل الباقي «غير موجود» ({pendingCount})
          </Button>
        </section>
      ) : null}

      <div className="rounded-2xl bg-muted p-4 text-sm leading-7">
        لا ترين أرقام النظام أثناء العد — هذا مقصود حتى يكون العد حقيقياً. بعد الإرسال تراجع المديرة الفروقات وقد تطلب
        إعادة عدّ صنف.
      </div>

      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={countId} />
        <Button type="submit" disabled={submitting || pendingCount > 0} className="min-h-12 text-lg">
          {submitting ? "جارٍ الإرسال…" : "إرسال العد للمراجعة"}
        </Button>
        <Button asChild variant="ghost">
          <Link href={`/admin/stock/counts/${countId}/count`}>رجوع للعد</Link>
        </Button>
      </form>
    </div>
  );
}
