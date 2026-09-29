/**
 * محدِّد محاولات بسيط في الذاكرة (نافذة منزلقة). كافٍ لخادم واحد (D-31)؛
 * يُفرَّغ عند إعادة تشغيل الخادم. عند تشغيل أكثر من نسخة يُنقل إلى Postgres.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  private recent(key: string, now: number): number[] {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  isLimited(key: string, now = Date.now()): boolean {
    return this.recent(key, now).length >= this.max;
  }

  hit(key: string, now = Date.now()): void {
    this.hits.set(key, [...this.recent(key, now), now]);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}

/** عنوان العميل خلف Cloudflare/Coolify. */
export function clientIp(h: Headers): string {
  return (
    h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown"
  );
}
