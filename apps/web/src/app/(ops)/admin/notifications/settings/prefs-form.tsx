"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { savePrefsAction, type PrefsState } from "./actions";

export interface EventRow {
  type: string;
  label: string;
  hint: string;
  priority: "URGENT" | "IMPORTANT" | "NORMAL" | "DAILY";
  push: boolean;
}

const switchClass =
  "relative h-[26px] w-[46px] shrink-0 cursor-pointer appearance-none rounded-full bg-line transition-colors after:absolute after:top-[3px] after:start-[3px] after:size-5 after:rounded-full after:bg-white after:shadow after:transition-all checked:bg-forest checked:after:start-[23px] disabled:cursor-default disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-ring";

const PRIORITY: Record<EventRow["priority"], { label: string; className: string }> = {
  URGENT: { label: "عاجل", className: "bg-danger text-white" },
  IMPORTANT: { label: "مهم", className: "bg-gold/20 text-warning" },
  NORMAL: { label: "عادي", className: "text-muted-foreground" },
  DAILY: { label: "يومي", className: "text-muted-foreground" },
};

/** الأحداث وما يصل منها للجوال، وساعات الهدوء (D-109). داخل النظام تصل كلها دائماً. */
export function PrefsForm({
  events,
  quietStart,
  quietEnd,
  urgentInQuiet,
}: {
  events: EventRow[];
  quietStart: string | null;
  quietEnd: string | null;
  urgentInQuiet: boolean;
}) {
  const [state, action, pending] = useActionState<PrefsState, FormData>(savePrefsAction, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      {state.success ? <Alert variant="success">{state.success}</Alert> : null}

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-bold">ساعات الهدوء</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          في هذه الساعات لا يرنّ الجوال، وتنتظرك الإشعارات في النظام. بتوقيت الخرطوم.
        </p>
        <label className="flex min-h-11 items-center gap-3 font-semibold">
          <input type="checkbox" name="quietEnabled" defaultChecked={!!quietStart} className={switchClass} />
          تفعيل ساعات الهدوء
        </label>
        <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            من
            <input
              type="time"
              name="quietStart"
              defaultValue={quietStart ?? "23:00"}
              dir="ltr"
              className="min-h-11 rounded-xl border border-input bg-card px-3 text-base"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            إلى
            <input
              type="time"
              name="quietEnd"
              defaultValue={quietEnd ?? "08:00"}
              dir="ltr"
              className="min-h-11 rounded-xl border border-input bg-card px-3 text-base"
            />
          </label>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" name="urgentInQuiet" defaultChecked={urgentInQuiet} className={switchClass} />
          العاجل يصل دائماً حتى في ساعات الهدوء (طلب جديد، إشعار دفع)
        </label>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 bg-muted px-5 py-3 text-sm font-bold text-muted-foreground sm:grid-cols-[minmax(0,1fr)_6rem_7rem_7rem]">
          <span>الحدث</span>
          <span className="hidden sm:block">الأولوية</span>
          <span className="hidden sm:block">داخل النظام</span>
          <span>على الجوال</span>
        </div>
        {events.map((e) => (
          <div
            key={e.type}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-border px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_6rem_7rem_7rem]"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 font-semibold">
                {e.label}
                <span
                  className={`rounded-md px-1.5 py-px text-[11px] font-bold sm:hidden ${PRIORITY[e.priority].className}`}
                >
                  {PRIORITY[e.priority].label}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">{e.hint}</div>
            </div>
            <span className="hidden sm:block">
              <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${PRIORITY[e.priority].className}`}>
                {PRIORITY[e.priority].label}
              </span>
            </span>
            <span className="hidden items-center gap-1 text-sm font-semibold text-forest sm:flex">
              <Check aria-hidden className="size-4 text-sage" strokeWidth={2.4} />
              دائماً
            </span>
            <input
              type="checkbox"
              name="pushTypes"
              value={e.type}
              defaultChecked={e.push}
              aria-label={`${e.label}: على الجوال`}
              className={switchClass}
            />
          </div>
        ))}
      </section>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "جارٍ الحفظ…" : "حفظ التفضيلات"}
      </Button>
    </form>
  );
}
