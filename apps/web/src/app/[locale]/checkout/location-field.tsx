"use client";

import { normalizeLocation } from "@ghusn/core";
import { Loader2, Map as MapIcon, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useId, useState } from "react";
import type { LatLng } from "./map-picker";

// Leaflet وصور الخريطة لا تُحمَّل إلا عند الضغط على «حدّد على الخريطة» (D-164)
const MapPicker = dynamic(() => import("./map-picker"), { ssr: false });

/** مراكز مدن التوصيل — الخريطة تفتح على المدينة المختارة. */
const CITY_CENTERS: Record<string, LatLng> = {
  KHARTOUM: { lat: 15.5007, lng: 32.5599 },
  BAHRI: { lat: 15.6406, lng: 32.5503 },
  OMDURMAN: { lat: 15.6445, lng: 32.4777 },
};

type State =
  { kind: "idle" } | { kind: "locating" } | { kind: "set"; value: string; label: string } | { kind: "error" };

/**
 * موقع التوصيل (D-163): «حدّد موقعي الحالي» يأخذ الإحداثيات من الهاتف بعد موافقة العميل، أو يلصق رابطاً من
 * الخرائط/واتساب، أو يحدّده على الخريطة (D-164). القيمة تُرسل في حقل مخفي «location» والخادم يتحقق منها من جديد (normalizeLocation).
 */
export function LocationField({ inputClass, satelliteKey }: { inputClass: string; satelliteKey: string | null }) {
  const t = useTranslations("checkout");
  const id = useId();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [picker, setPicker] = useState<LatLng | null>(null);

  const setCoords = (lat: number, lng: number) => {
    const a = lat.toFixed(6);
    const b = lng.toFixed(6);
    setState({ kind: "set", value: `${a},${b}`, label: `${a}, ${b}` });
  };

  const openMap = (e: React.MouseEvent<HTMLButtonElement>) => {
    // المدينة من حقل الاختيار في النموذج نفسه؛ وإن لم تُختر فالخرطوم
    const city = e.currentTarget.form?.elements.namedItem("city");
    const chosen = city instanceof RadioNodeList ? city.value : "";
    setPicker(CITY_CENTERS[chosen] ?? CITY_CENTERS.KHARTOUM!);
  };
  const [paste, setPaste] = useState("");
  const pasted = paste.trim() ? normalizeLocation(paste) : null;
  const value = state.kind === "set" ? state.value : (pasted ?? "");

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setState({ kind: "error" });
      return;
    }
    setState({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords(pos.coords.latitude, pos.coords.longitude),
      () => setState({ kind: "error" }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span id={id} className="text-[13px] font-semibold">
        {t("location")}
      </span>
      <input type="hidden" name="location" value={value} />
      {state.kind === "set" ? (
        <div
          aria-labelledby={id}
          className="flex items-center gap-3 rounded-xl border-[1.5px] border-sage bg-sage/10 px-3 py-2.5"
        >
          <MapPin aria-hidden className="size-5 shrink-0 text-forest" strokeWidth={1.8} />
          <span className="min-w-0 flex-1">
            <b className="block text-sm text-forest">✓ {t("locationSet")}</b>
            <span dir="ltr" className="block text-xs text-muted-foreground tabular-nums">
              {state.label}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setState({ kind: "idle" })}
            className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold text-forest hover:bg-muted"
          >
            {t("locationChange")}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl border-[1.5px] border-dashed border-sage p-3">
          <button
            type="button"
            onClick={locate}
            disabled={state.kind === "locating"}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-forest px-4 text-sm font-bold text-ivory transition-[background-color,scale] duration-150 hover:bg-forest/90 disabled:opacity-70 motion-safe:active:scale-[.98]"
          >
            {state.kind === "locating" ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <MapPin aria-hidden className="size-4" strokeWidth={2} />
            )}
            {state.kind === "locating" ? t("locating") : t("locateMe")}
          </button>
          <button
            type="button"
            onClick={openMap}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-forest bg-card px-4 text-sm font-bold text-forest transition-[background-color,scale] duration-150 hover:bg-muted motion-safe:active:scale-[.98]"
          >
            <MapIcon aria-hidden className="size-4" strokeWidth={2} />
            {t("pickOnMap")}
          </button>
          {state.kind === "error" ? (
            <p role="alert" className="text-xs font-semibold text-destructive">
              {t("locationDenied")}
            </p>
          ) : null}
          <label className="flex flex-col gap-1">
            <span className="text-center text-xs text-muted-foreground">{t("locationOrPaste")}</span>
            <input
              type="url"
              inputMode="url"
              dir="ltr"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="https://maps.app.goo.gl/…"
              aria-label={t("locationPaste")}
              aria-invalid={paste.trim() && !pasted ? true : undefined}
              className={inputClass}
            />
          </label>
          {paste.trim() ? (
            pasted ? (
              <p className="text-xs font-semibold text-sage">✓ {t("locationSet")}</p>
            ) : (
              <p className="text-xs font-semibold text-destructive">{t("locationInvalid")}</p>
            )
          ) : null}
        </div>
      )}
      {picker ? (
        <MapPicker
          start={picker}
          zoom={13}
          satelliteKey={satelliteKey}
          onClose={() => setPicker(null)}
          onConfirm={(p) => {
            setCoords(p.lat, p.lng);
            setPicker(null);
          }}
        />
      ) : null}
    </div>
  );
}
