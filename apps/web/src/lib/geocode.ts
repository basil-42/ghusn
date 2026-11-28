/**
 * البحث عن الأحياء والمعالم لمنتقي الموقع (D-164) عبر Nominatim (OpenStreetMap) من الخادم لا من المتصفح:
 * العميل لا يتصل بطرف ثالث، ونلتزم بسياسة الخدمة — تعريف التطبيق في User-Agent، وطلب واحد في الثانية على
 * الأكثر لكل الخادم، وتخزين النتائج، والبحث عند الضغط فقط (لا أثناء الكتابة).
 * https://operations.osmfoundation.org/policies/nominatim/
 */

export interface GeocodeResult {
  name: string;
  detail: string;
  lat: number;
  lng: number;
}

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
/** العاصمة المثلثة أولاً (تفضيل لا حصر). */
const VIEWBOX = "32.30,15.90,32.80,15.35";
const CACHE_MAX = 500;
const CACHE_MS = 24 * 60 * 60 * 1000;

const cache = new Map<string, { at: number; data: GeocodeResult[] }>();
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

/** يحوّل رد Nominatim إلى نتائج مختصرة؛ يتجاهل أي عنصر ناقص. */
export function parseNominatim(raw: unknown): GeocodeResult[] {
  if (!Array.isArray(raw)) return [];
  const out: GeocodeResult[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    const full = typeof r.display_name === "string" ? r.display_name : "";
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !full) continue;
    const parts = full.split(/[,،]\s*/).filter(Boolean);
    const name = (typeof r.name === "string" && r.name) || parts[0] || full;
    const detail = parts
      .filter((p) => p !== name && !/^\d+$/.test(p))
      .slice(0, 3)
      .join("، ");
    out.push({ name, detail, lat, lng });
  }
  return out;
}

/** طلب واحد في الثانية على الأكثر لكل الخادم. */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCall + 1000 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function geocode(q: string, locale: "ar" | "en"): Promise<GeocodeResult[]> {
  const key = `${locale}:${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({
    q,
    format: "jsonv2",
    countrycodes: "sd",
    viewbox: VIEWBOX,
    limit: "6",
    "accept-language": locale,
  }).toString();
  const app = process.env.APP_URL ?? "http://localhost:3000";
  const data = await throttled(async () => {
    const res = await fetch(url, {
      headers: { "User-Agent": `GhusnStore/1.0 (+${app})`, Referer: app },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`nominatim ${res.status}`);
    return parseNominatim(await res.json());
  });

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), data });
  return data;
}
