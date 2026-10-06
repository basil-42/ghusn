import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/session";
import { counterView } from "@/lib/stock-counts";
import { CountScreen, FinishCount } from "./count-screen";

export const metadata: Metadata = { title: "العد | غصن" };

/** شاشة العد (للجميع — عدّ أعمى بلا أرقام النظام) وصفحة إنهاء العد. */
export default async function CountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  await requirePermission({ stock: ["adjust"] });
  const { id } = await params;
  const { view } = await searchParams;
  const c = await counterView(id);
  if (!c) notFound();
  const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
  const recountMode = c.status === "SUBMITTED";
  const closed = c.status === "APPROVED" || c.status === "CANCELLED" || (recountMode && !c.recount.length);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-display text-2xl font-bold">{c.title}</h1>
          <bdi dir="ltr" className="text-sm text-muted-foreground">
            {c.number}
          </bdi>
        </div>
        <div className="flex items-center gap-3">
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span className="block h-full rounded-full bg-sage" style={{ width: `${pct}%` }} />
          </span>
          <bdi dir="ltr" className="text-sm font-semibold tabular-nums">
            {c.done} / {c.total}
          </bdi>
        </div>
      </header>

      {closed ? (
        <div className="flex flex-col gap-3">
          <Alert>
            {c.status === "APPROVED"
              ? "اعتُمد هذا الجرد."
              : c.status === "CANCELLED"
                ? "أُلغي هذا الجرد."
                : "أُرسل هذا الجرد وهو بانتظار المراجعة."}
          </Alert>
          <Button asChild variant="outline">
            <Link href="/admin/stock">المخزون</Link>
          </Button>
        </div>
      ) : view === "finish" && !recountMode ? (
        <FinishCount countId={c.id} pending={c.pending} pendingCount={c.pendingCount} done={c.done} />
      ) : (
        <CountScreen countId={c.id} recountMode={recountMode} recent={c.recent} recount={c.recount} />
      )}
    </div>
  );
}
