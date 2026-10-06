"use client";

import { Camera, CameraOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Controls = { stop: () => void };

/**
 * قارئ باركود بكاميرا الجوال (D-112) — مكتبة ZXing تعمل على آيفون وأندرويد (Safari لا يدعم
 * BarcodeDetector). تُحمَّل عند الضغط على «تشغيل الكاميرا» فقط، وتعمل على https أو localhost.
 * الرمز الثابت أمام الكاميرا يُرسل مرة واحدة (تقرؤه عدة مرات في الثانية)؛ إن غاب ثانية ثم عاد يُرسل من جديد.
 */
export function BarcodeScanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<Controls | null>(null);
  const last = useRef<{ code: string; at: number } | null>(null);
  const handler = useRef(onCode);
  // قراءة متأخرة بعد الإيقاف تُهمل (المكتبة قد تُكمل محاولة جارية)
  const running = useRef(false);
  const [state, setState] = useState<"off" | "starting" | "on" | "error">("off");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handler.current = onCode;
  }, [onCode]);

  const stop = useCallback(() => {
    running.current = false;
    controls.current?.stop();
    controls.current = null;
    setState("off");
  }, []);

  useEffect(
    () => () => {
      running.current = false;
      controls.current?.stop();
    },
    [],
  );

  async function start() {
    if (!video.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("error");
      setError("الكاميرا غير متاحة في هذا المتصفح — استخدمي البحث أو قارئ الباركود.");
      return;
    }
    setState("starting");
    setError(null);
    running.current = true;
    try {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import("@zxing/browser"),
        import("@zxing/library"),
      ]);
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
      ]);
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
      controls.current = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        video.current,
        (result) => {
          if (!result || !running.current) return;
          const code = result.getText().trim();
          const now = Date.now();
          // نفس الرمز ما زال أمام الكاميرا ← لا يُعدّ ثانية؛ يُعدّ إذا غاب ثانية ثم عاد (قطعة أخرى)
          const same = last.current && last.current.code === code && now - last.current.at < 1000;
          last.current = { code, at: now };
          if (same) return;
          navigator.vibrate?.(60);
          handler.current(code);
        },
      );
      setState("on");
    } catch (e) {
      running.current = false;
      setState("error");
      setError(
        (e as Error).name === "NotAllowedError"
          ? "لم يُسمح بالكاميرا — اسمحي بها من إعدادات المتصفح، أو استخدمي البحث."
          : "تعذّر تشغيل الكاميرا — استخدمي البحث أو قارئ الباركود.",
      );
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`relative overflow-hidden rounded-2xl bg-forest ${state === "on" || state === "starting" ? "h-52" : "h-0"}`}
      >
        <video ref={video} className="size-full object-cover" muted playsInline aria-label="معاينة الكاميرا" />
        {state === "on" ? (
          <span className="pointer-events-none absolute inset-x-10 top-1/2 h-0.5 -translate-y-1/2 bg-gold" />
        ) : null}
      </div>
      {state === "on" || state === "starting" ? (
        <Button type="button" variant="outline" onClick={stop}>
          <CameraOff aria-hidden /> إيقاف الكاميرا
        </Button>
      ) : (
        <Button type="button" variant="outline" onClick={start} className="min-h-12">
          <Camera aria-hidden /> مسح بالكاميرا
        </Button>
      )}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
