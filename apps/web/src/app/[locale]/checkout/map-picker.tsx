"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Loader2, LocateFixed, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface LatLng {
  lat: number;
  lng: number;
}

interface Result {
  name: string;
  detail: string;
  lat: number;
  lng: number;
}

const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const SAT_ATTR =
  '&copy; <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">MapTiler</a> ' + OSM_ATTR;

/**
 * منتقي موقع التوصيل (D-164): خريطة OpenStreetMap بملء الشاشة، والدبوس ثابت في الوسط والعميل يحرّك الخريطة
 * تحته، مع بحث عن الأحياء والمعالم (عبر خادمنا) وزر «موقعي الحالي»، وطبقة قمر صناعي إن ضُبط مفتاح MapTiler.
 * يُحمَّل هذا الملف (ومكتبة Leaflet) فقط عند فتح الخريطة.
 */
export default function MapPicker({
  start,
  zoom,
  satelliteKey,
  onConfirm,
  onClose,
}: {
  start: LatLng;
  zoom: number;
  satelliteKey: string | null;
  onConfirm: (p: LatLng) => void;
  onClose: () => void;
}) {
  const t = useTranslations("checkout");
  const locale = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<{ map: L.TileLayer; sat: L.TileLayer | null } | null>(null);
  const [center, setCenter] = useState<LatLng>(start);
  const [moved, setMoved] = useState(false);
  const [sat, setSat] = useState(false);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "done"; results: Result[] } | { kind: "error" }
  >({ kind: "idle" });
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
    const el = box.current;
    if (!el) return;
    const m = L.map(el, { zoomControl: false, attributionControl: true }).setView([start.lat, start.lng], zoom);
    m.attributionControl.setPrefix(false);
    const base = L.tileLayer(OSM, { maxZoom: 19, attribution: OSM_ATTR }).addTo(m);
    const satLayer = satelliteKey
      ? L.tileLayer(`https://api.maptiler.com/maps/satellite/{z}/{x}/{y}.jpg?key=${encodeURIComponent(satelliteKey)}`, {
          maxZoom: 20,
          attribution: SAT_ATTR,
        })
      : null;
    layers.current = { map: base, sat: satLayer };
    m.on("move", () => {
      const c = m.getCenter();
      setCenter({ lat: c.lat, lng: c.lng });
    });
    m.on("dragstart zoomstart", () => setMoved(true));
    map.current = m;
    // الحوار يظهر بعد أول رسم — نعيد حساب الحجم حتى لا تظهر الخريطة ناقصة
    const id = requestAnimationFrame(() => m.invalidateSize());
    return () => {
      cancelAnimationFrame(id);
      m.remove();
      map.current = null;
    };
    // تُنشأ الخريطة مرة واحدة عند الفتح
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSat = (on: boolean) => {
    const m = map.current;
    const l = layers.current;
    if (!m || !l?.sat || on === sat) return;
    if (on) {
      m.removeLayer(l.map);
      l.sat.addTo(m);
    } else {
      m.removeLayer(l.sat);
      l.map.addTo(m);
    }
    setSat(on);
  };

  const fly = (p: LatLng, z = 17) => {
    map.current?.setView([p.lat, p.lng], z);
    setMoved(true);
  };

  const runSearch = async () => {
    const term = q.trim();
    if (term.length < 2) return;
    setSearch({ kind: "loading" });
    try {
      const res = await fetch(`/api/v1/geocode?${new URLSearchParams({ q: term, locale })}`);
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { results: Result[] };
      setSearch({ kind: "done", results: body.results });
    } catch {
      setSearch({ kind: "error" });
    }
  };

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setGpsError(true);
      return;
    }
    setLocating(true);
    setGpsError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        fly({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setLocating(false);
        setGpsError(true);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  const results = search.kind === "done" ? search.results : null;

  // خارج نموذج الطلب (body): لا نماذج متداخلة، وEnter في البحث لا يرسل الطلب
  return createPortal(
    <dialog
      ref={dialog}
      aria-label={t("mapTitle")}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-ivory p-0 text-forest backdrop:bg-forest/40"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center gap-2 border-b border-line bg-card px-3 py-2">
          <b className="text-base">{t("mapTitle")}</b>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("mapClose")}
            className="ms-auto grid size-11 place-items-center rounded-full hover:bg-muted"
          >
            <X aria-hidden className="size-5" />
          </button>
        </header>

        <div className="relative min-h-0 flex-1">
          {/* Leaflet يفترض اتجاه LTR في حساباته — الخريطة نفسها ltr والواجهة حولها rtl */}
          <div ref={box} dir="ltr" className="absolute inset-0 z-0 bg-muted" />

          <div className="absolute inset-x-3 top-3 z-[1000] flex flex-col gap-1.5">
            <div role="search" className="flex h-12 items-center gap-2 rounded-xl bg-card ps-3 pe-1 shadow-lg">
              <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <input
                type="search"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  if (search.kind !== "loading") setSearch({ kind: "idle" });
                }}
                placeholder={t("mapSearch")}
                aria-label={t("mapSearch")}
                enterKeyHint="search"
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  void runSearch();
                }}
                className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none"
              />
              <button
                type="button"
                onClick={() => void runSearch()}
                disabled={q.trim().length < 2 || search.kind === "loading"}
                className="h-10 shrink-0 rounded-lg bg-forest px-3 text-sm font-bold text-ivory disabled:opacity-50"
              >
                {search.kind === "loading" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : t("mapSearchGo")}
              </button>
            </div>
            {results || search.kind === "error" ? (
              <div className="max-h-64 overflow-y-auto rounded-xl bg-card shadow-lg" aria-live="polite">
                {search.kind === "error" ? (
                  <p className="px-3 py-2.5 text-sm text-destructive">{t("mapSearchError")}</p>
                ) : results && results.length === 0 ? (
                  <p className="px-3 py-2.5 text-sm text-muted-foreground">{t("mapNoResults")}</p>
                ) : (
                  results?.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        fly(r);
                        setSearch({ kind: "idle" });
                        setQ(r.name);
                      }}
                      className="flex min-h-11 w-full flex-col items-start border-b border-line px-3 py-2 text-start last:border-0 hover:bg-muted"
                    >
                      <span className="text-sm font-semibold">{r.name}</span>
                      {r.detail ? <span className="text-xs text-muted-foreground">{r.detail}</span> : null}
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>

          {/* الدبوس ثابت في وسط الخريطة؛ رأسه السفلي هو النقطة المختارة */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 z-[999] size-2 -translate-1/2 rounded-full bg-forest/35"
          />
          <svg
            aria-hidden
            viewBox="0 0 38 48"
            className="pointer-events-none absolute left-1/2 top-1/2 z-[999] h-12 w-[38px] -translate-x-1/2 -translate-y-full drop-shadow-md"
          >
            <path d="M19 47C19 47 3 29 3 18a16 16 0 0 1 32 0c0 11-16 29-16 29z" className="fill-forest" />
            <circle cx="19" cy="18" r="6.5" className="fill-sand" />
          </svg>
          {!moved ? (
            <span className="pointer-events-none absolute left-1/2 top-[calc(50%-80px)] z-[999] -translate-x-1/2 whitespace-nowrap rounded-full bg-forest px-3 py-1 text-xs text-ivory">
              {t("mapHint")}
            </span>
          ) : null}

          <div className="absolute end-3 bottom-4 z-[1000] flex flex-col items-end gap-2">
            {gpsError ? (
              <p
                role="alert"
                className="max-w-56 rounded-lg bg-card px-2.5 py-1.5 text-xs font-semibold text-destructive shadow"
              >
                {t("locationDenied")}
              </p>
            ) : null}
            <button
              type="button"
              onClick={locate}
              aria-label={t("locateMe")}
              className="grid size-12 place-items-center rounded-full bg-card shadow-lg"
            >
              {locating ? (
                <Loader2 aria-hidden className="size-5 animate-spin" />
              ) : (
                <LocateFixed aria-hidden className="size-5" />
              )}
            </button>
          </div>

          {satelliteKey ? (
            <div
              role="group"
              aria-label={t("mapLayer")}
              className="absolute start-3 bottom-4 z-[1000] flex overflow-hidden rounded-xl bg-card text-xs font-semibold shadow-lg"
            >
              <button
                type="button"
                aria-pressed={!sat}
                onClick={() => toggleSat(false)}
                className="min-h-11 px-3 aria-pressed:bg-forest aria-pressed:text-ivory"
              >
                {t("mapStreets")}
              </button>
              <button
                type="button"
                aria-pressed={sat}
                onClick={() => toggleSat(true)}
                className="min-h-11 px-3 aria-pressed:bg-forest aria-pressed:text-ivory"
              >
                {t("mapSatellite")}
              </button>
            </div>
          ) : null}
        </div>

        <footer className="flex flex-col gap-2 border-t border-line bg-card px-3 pt-2.5 pb-[max(10px,env(safe-area-inset-bottom))]">
          <p dir="ltr" className="text-center text-xs text-muted-foreground tabular-nums">
            {center.lat.toFixed(5)}, {center.lng.toFixed(5)}
          </p>
          <button
            type="button"
            onClick={() => onConfirm(center)}
            className="h-12 rounded-xl bg-forest text-base font-bold text-ivory transition-[background-color,scale] duration-150 hover:bg-forest/90 motion-safe:active:scale-[.98]"
          >
            {t("mapConfirm")}
          </button>
        </footer>
      </div>
    </dialog>,
    document.body,
  );
}
