"use client";

/**
 * تفعيل إشعارات الجوال على هذا الجهاز (D-109): إذن المتصفح ← اشتراك Push بالمفتاح العام ← حفظه في الخادم.
 * آيفون يدعمها فقط بعد «إضافة إلى الشاشة الرئيسية» (iOS 16.4+). عامل الخدمة لا يُسجَّل في التطوير.
 */

export type PushState = "unsupported" | "ios-install" | "dev" | "denied" | "off" | "on";

export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** «Chrome · أندرويد» — للتعرف على الجهاز في التفضيلات. */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung Internet"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "متصفح";
  const os = /Android/.test(ua)
    ? "أندرويد"
    : isIos()
      ? "آيفون"
      : /Windows/.test(ua)
        ? "ويندوز"
        : /Mac OS X/.test(ua)
          ? "ماك"
          : /Linux/.test(ua)
            ? "لينكس"
            : "جهاز";
  return `${browser} · ${os}`;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + "===".slice((base64url.length + 3) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** عامل الخدمة الجاهز، أو null خلال 4 ثوانٍ (التطوير، أو متصفح يمنعه). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
  ]);
}

export async function currentEndpoint(): Promise<string | null> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub?.endpoint ?? null;
}

export async function pushState(): Promise<PushState> {
  if (isIos() && !isStandalone()) return "ios-install";
  if (!("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  if (process.env.NODE_ENV !== "production") return "dev";
  return (await currentEndpoint()) ? "on" : "off";
}

/** يطلب الإذن ويشترك ويحفظ. يعيد الحالة الجديدة. */
export async function enablePush(publicKey: string): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const reg = await registration();
  if (!reg) return "dev";
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  const json = sub.toJSON();
  const res = await fetch("/api/v1/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, label: deviceLabel() }),
  });
  if (!res.ok) throw new Error(`subscribe ${res.status}`);
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await fetch("/api/v1/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  return "off";
}
