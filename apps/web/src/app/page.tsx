import { prisma } from "@ghusn/db";
import Link from "next/link";

// هذه الصفحة تُقرأ من قاعدة البيانات في كل زيارة
export const dynamic = "force-dynamic";

async function getStatus() {
  try {
    const [categories, rates] = await Promise.all([
      prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.exchangeRate.findMany({ orderBy: { effectiveAt: "desc" }, include: { currency: true } }),
    ]);
    return { ok: true as const, categories, rates };
  } catch (error) {
    return { ok: false as const, error: String(error) };
  }
}

export default async function Home() {
  const status = await getStatus();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 px-5 py-16">
      <header className="flex flex-col gap-3">
        <span className="text-sm font-semibold tracking-wide text-sage">ghusn.store · بيئة التطوير</span>
        <h1 className="font-display text-5xl font-bold">غصن</h1>
        <p className="font-display text-2xl text-sage">هدايا تُصنع لتُذكر</p>
        <Link href="/admin" className="w-fit rounded-xl bg-forest px-5 py-3 font-semibold text-ivory">
          دخول لوحة الإدارة
        </Link>
      </header>

      <section className="rounded-2xl border border-line bg-white p-6">
        <h2 className="mb-3 text-lg font-bold">حالة الاتصال بقاعدة البيانات</h2>
        {status.ok ? (
          <p className="font-semibold text-sage">
            ✓ متصل — {status.categories.length} أقسام و {status.rates.length} أسعار صرف
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-danger">✗ غير متصل. تأكد أن Docker يعمل ثم شغّل: pnpm db:up</p>
            <code dir="ltr" className="block overflow-x-auto rounded bg-ivory p-3 text-xs">
              {status.error.slice(0, 300)}
            </code>
          </div>
        )}
      </section>

      {status.ok && (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">الأقسام</h2>
            <div className="flex flex-wrap gap-2">
              {status.categories.map((c) => (
                <span key={c.id} className="rounded-full bg-white px-4 py-1.5 text-sm font-medium">
                  {c.nameAr}
                </span>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">أسعار الصرف (كم وحدة = 1 دولار)</h2>
            <div className="overflow-hidden rounded-2xl border border-line bg-white">
              {status.rates.map((r) => (
                <div key={r.id} className="flex justify-between border-b border-line px-5 py-3 last:border-0">
                  <span>{r.currency.nameAr}</span>
                  <span dir="ltr" className="font-semibold tabular-nums">
                    {Number(r.unitsPerUsd).toLocaleString("en-US")} {r.currencyCode}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
