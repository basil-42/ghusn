import { bannerPeriod, MAX_HOME_BANNERS, shopDay } from "@ghusn/core";
import { ExternalLink, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { listBannerLinkOptions, listBannersForAdmin, type AdminBanner } from "@/lib/banners";
import { daysLabel, formatShortDate } from "@/lib/format";
import { BannerDrawer } from "./banner-drawer";
import { BannerList, type BannerRow } from "./banner-list";
import { LINK_LABELS } from "./link-labels";

export const metadata: Metadata = { title: "البانرات | غصن" };

const ORDINAL = ["الأول", "الثاني", "الثالث"];
const date = (day: string) => formatShortDate(new Date(`${day}T12:00:00Z`));

function statusOf(b: AdminBanner, livePosition: number): BannerRow["status"] {
  switch (b.status) {
    case "live":
      return { label: `ظاهر · ${ORDINAL[livePosition] ?? ""}`, tone: "live", group: "live" };
    case "scheduled":
      return { label: "مجدول", tone: "scheduled", group: "scheduled" };
    case "overflow":
      return { label: `لا يظهر — الحد ${MAX_HOME_BANNERS}`, tone: "warn", group: "live" };
    case "ended":
      return { label: "منتهٍ", tone: "off", group: "off" };
    default:
      return { label: "موقوف", tone: "off", group: "off" };
  }
}

function periodOf(b: AdminBanner, today: string): BannerRow["period"] {
  const p = bannerPeriod(today, b.startsOn || null, b.endsOn || null);
  switch (p.kind) {
    case "until":
      return { main: `حتى ${date(p.end)}`, sub: p.daysLeft ? `باقي ${daysLabel(p.daysLeft)}` : "آخر يوم اليوم" };
    case "starts":
      return { main: `يبدأ ${date(p.start)}`, sub: `بعد ${daysLabel(p.daysUntil)}` };
    case "ended":
      return { main: `انتهى ${date(p.end)}` };
    default:
      return { main: "دائم", sub: "بلا تاريخ انتهاء" };
  }
}

/**
 * واجهة المتجر › البانرات (D-101، D-122): قائمة مختصرة بمعاينة الصورتين والحالة والمدة، ترتيب بالسحب،
 * والتحرير في لوحة جانبية (?edit=<id> أو ?edit=new) بمعاينة حية.
 */
export default async function BannersPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requirePermission({ settings: ["update"] });
  const [{ edit }, banners, links] = await Promise.all([searchParams, listBannersForAdmin(), listBannerLinkOptions()]);
  const today = shopDay(new Date());
  const names = {
    CATEGORY: new Map(links.categories.map((o) => [o.value, o.label])),
    OCCASION: new Map(links.occasions.map((o) => [o.value, o.label])),
    PRODUCT: new Map(links.products.map((o) => [o.value, o.label])),
  };
  let live = 0;
  const rows: BannerRow[] = banners.map((b) => {
    const status = statusOf(b, live);
    if (b.status === "live") live++;
    const target =
      b.linkType === "CATEGORY" || b.linkType === "OCCASION" || b.linkType === "PRODUCT"
        ? names[b.linkType].get(b.linkTarget)
        : null;
    return {
      id: b.id,
      titleAr: b.titleAr,
      sub: [b.titleEn, `زر «${b.ctaAr}»`, b.badgeAr ? `شارة «${b.badgeAr}»` : ""].filter(Boolean).join(" · "),
      imageUrl: b.imageUrl,
      mobileImageUrl: b.mobileImageUrl,
      link: target ? `${LINK_LABELS[b.linkType]}: ${target}` : LINK_LABELS[b.linkType],
      period: periodOf(b, today),
      status,
    };
  });
  const editing = edit === "new" ? "new" : (banners.find((b) => b.id === edit) ?? null);
  const editingRow = editing && editing !== "new" ? rows.find((r) => r.id === editing.id) : undefined;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-bold">البانرات</h1>
          <p className="text-sm text-muted-foreground">
            تظهر أعلى رئيسية المتجر بالترتيب وتتبدل كل 6 ثوانٍ — حتى {MAX_HOME_BANNERS} في نفس الوقت. بلا بانر ظاهر يظهر
            بانر الهوية.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-card px-4 text-sm font-semibold hover:bg-muted"
          >
            <ExternalLink aria-hidden className="size-4" /> معاينة المتجر
          </a>
          <Link
            href="/admin/banners?edit=new"
            scroll={false}
            className="flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
          >
            <Plus aria-hidden className="size-4" /> بانر جديد
          </Link>
        </div>
      </header>

      <BannerList rows={rows} max={MAX_HOME_BANNERS} />

      {editing ? (
        <BannerDrawer
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          statusLabel={editingRow?.status.label}
          links={links}
        />
      ) : null}
    </div>
  );
}
