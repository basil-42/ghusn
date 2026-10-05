"use client";

import { Monitor, Smartphone, Volume2, VolumeX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { playChime, setMuted, unlockAudio, useMuted } from "@/components/admin/chime";
import { currentEndpoint, disablePush, enablePush, pushState, type PushState } from "@/components/admin/push-client";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";

export interface Device {
  id: string;
  endpoint: string;
  label: string;
  createdAt: string;
  lastUsedAt: string;
}

const STATE_TEXT: Record<PushState, string> = {
  on: "مفعّلة على هذا الجهاز",
  off: "غير مفعّلة على هذا الجهاز",
  denied: "المتصفح يمنع الإشعارات لهذا الموقع — اسمحي بها من إعدادات المتصفح ثم أعيدي المحاولة",
  unsupported: "هذا المتصفح لا يدعم إشعارات الجوال",
  "ios-install": "على آيفون: أضيفي غصن إلى الشاشة الرئيسية أولاً (الشرح بالأسفل)",
  dev: "إشعارات الجوال تعمل في النسخة المنشورة فقط",
};

/** أجهزة المستخدمة: تفعيل هذا الجهاز أو إيقافه، وإزالة غيره، وإرسال إشعار تجريبي (D-109). */
export function Devices({ devices, publicKey }: { devices: Device[]; publicKey: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<PushState | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([pushState(), currentEndpoint()]).then(([s, e]) => {
      if (cancelled) return;
      setState(s);
      setMine(e);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (fn: () => Promise<PushState>) => {
    setBusy(true);
    setMessage(null);
    try {
      const s = await fn();
      setState(s);
      setMine(await currentEndpoint());
      router.refresh();
    } catch {
      setMessage("تعذّر التفعيل — تحققي من الاتصال وأعيدي المحاولة.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await fetch("/api/v1/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
    router.refresh();
  };

  const test = async () => {
    setMessage(null);
    const res = await fetch("/api/v1/push/test", { method: "POST" }).catch(() => null);
    if (!res?.ok) return setMessage("تعذّر الإرسال — أعيدي المحاولة بعد قليل.");
    const r = (await res.json()) as { devices: number; sent: number };
    setMessage(r.devices === 0 ? "لا توجد أجهزة مفعّلة بعد." : `أُرسل إلى ${r.sent} من ${r.devices} جهاز.`);
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-lg font-bold">الأجهزة</h2>
      {!publicKey ? (
        <p className="rounded-xl bg-muted p-3 text-sm">
          إشعارات الجوال غير مفعّلة في الخادم بعد (مفاتيح VAPID). تعمل الإشعارات داخل النظام كالمعتاد.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-sage/15 p-3">
            <Smartphone aria-hidden className="size-5 shrink-0" />
            <p className="min-w-0 flex-1 text-sm font-semibold">{state ? STATE_TEXT[state] : "…"}</p>
            {state === "off" ? (
              <Button type="button" size="sm" disabled={busy} onClick={() => run(() => enablePush(publicKey))}>
                {busy ? "جارٍ التفعيل…" : "تفعيل"}
              </Button>
            ) : state === "on" ? (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run(disablePush)}>
                إيقاف
              </Button>
            ) : null}
          </div>
          {devices.length ? (
            <ul className="flex flex-col gap-2">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                  <Monitor aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 text-sm">
                    <b>{d.label}</b>
                    {d.endpoint === mine ? <span className="text-muted-foreground"> — هذا الجهاز</span> : null}
                    <div className="text-xs text-muted-foreground">
                      آخر إشعار وصله {formatDateTime(new Date(d.lastUsedAt))}
                    </div>
                  </div>
                  {d.endpoint !== mine ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => remove(d.id)}>
                      إزالة
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          <Button type="button" variant="outline" onClick={test}>
            إرسال إشعار تجريبي لأجهزتي
          </Button>
        </>
      )}
      {message ? (
        <p role="status" className="text-sm font-semibold">
          {message}
        </p>
      ) : null}
    </section>
  );
}

/** صوت التنبيه داخل النظام — إعداد لهذا الجهاز. */
export function SoundCard() {
  const muted = useMuted();
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-lg font-bold">صوت التنبيه داخل النظام</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        العاجل نغمتان تتكرران كل دقيقة حتى 5 مرات ما لم يُفتح الطلب؛ المهم نغمة واحدة؛ العادي بلا صوت. الإعداد لهذا
        الجهاز.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setMuted(!muted)}>
          {muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
          {muted ? "الصوت مكتوم — تشغيل" : "الصوت يعمل — كتم"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            unlockAudio();
            setTimeout(() => playChime("urgent", true), 60);
          }}
        >
          تجربة صوت العاجل
        </Button>
      </div>
    </section>
  );
}
