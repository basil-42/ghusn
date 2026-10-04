import { MAX_HOME_BANNERS } from "@ghusn/core";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { listBannerLinkOptions, listBannersForAdmin, type AdminBanner } from "@/lib/banners";
import { deleteBannerAction, moveBannerAction } from "./actions";
import { BannerForm } from "./banner-form";

export const metadata: Metadata = { title: "البانرات | غصن" };

const STATUS: Record<AdminBanner["status"], { label: string; variant: "success" | "warning" | "default" }> = {
  live: { label: "يظهر الآن", variant: "success" },
  scheduled: { label: "مجدول", variant: "warning" },
  ended: { label: "انتهت مدته", variant: "default" },
  off: { label: "موقوف", variant: "default" },
  overflow: { label: `لا يظهر — الحد ${MAX_HOME_BANNERS} بانرات`, variant: "warning" },
};

const iconButton =
  "inline-flex size-11 items-center justify-center rounded-xl border border-border hover:bg-muted disabled:opacity-40";

/** بانرات الرئيسية (D-101): حتى 3 بالترتيب، بلا بانر مفعّل يظهر بانر الهوية. */
export default async function BannersPage() {
  await requirePermission({ settings: ["update"] });
  const [banners, links] = await Promise.all([listBannersForAdmin(), listBannerLinkOptions()]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold">البانرات</h1>
        <p className="text-muted-foreground">
          تظهر أعلى الرئيسية بالترتيب وتتبدل كل 6 ثوانٍ — حتى {MAX_HOME_BANNERS} بانرات في نفس الوقت. البانر المجدول
          يظهر ويختفي بنفسه حسب التاريخ. بلا بانر مفعّل يظهر بانر الهوية.
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-2">
        {banners.map((b, i) => (
          <Card key={b.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {b.titleAr}
                    <Badge variant={STATUS[b.status].variant}>{STATUS[b.status].label}</Badge>
                  </CardTitle>
                  <CardDescription>
                    {b.startsOn || b.endsOn ? `${b.startsOn || "…"} ← ${b.endsOn || "…"}` : "دائم"}
                  </CardDescription>
                </div>
                <div className="flex shrink-0 gap-1">
                  <form action={moveBannerAction}>
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="direction" value="up" />
                    <button type="submit" aria-label="تحريك للأعلى" disabled={i === 0} className={iconButton}>
                      <ArrowUp aria-hidden className="size-4" />
                    </button>
                  </form>
                  <form action={moveBannerAction}>
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="direction" value="down" />
                    <button
                      type="submit"
                      aria-label="تحريك للأسفل"
                      disabled={i === banners.length - 1}
                      className={iconButton}
                    >
                      <ArrowDown aria-hidden className="size-4" />
                    </button>
                  </form>
                  <form action={deleteBannerAction}>
                    <input type="hidden" name="id" value={b.id} />
                    <button type="submit" aria-label="حذف البانر" className={`${iconButton} text-destructive`}>
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  </form>
                </div>
              </div>
            </CardHeader>
            <BannerForm initial={b} links={links} />
          </Card>
        ))}
        <Card>
          <CardHeader>
            <CardTitle>بانر جديد</CardTitle>
          </CardHeader>
          <BannerForm initial={null} links={links} />
        </Card>
      </div>
    </div>
  );
}
