"use client";

import { ImagePlus, Monitor, Smartphone, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { ImageInput } from "@/components/image-input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { useActionToast } from "@/components/ui/toast";
import type { AdminBanner } from "@/lib/banners";
import { cn } from "@/lib/utils";
import { deleteBannerAction, saveBannerAction, type FormState } from "./actions";
import { LINK_LABELS } from "./link-labels";

const field = "flex min-w-0 flex-col gap-1";
const label = "text-sm font-semibold";
const hint = "text-xs text-muted-foreground";

type LinkType = AdminBanner["linkType"];
type Option = { value: string; label: string };
export interface LinkOptions {
  categories: Option[];
  occasions: Option[];
  products: Option[];
}

const STEPS = ["الصور", "النص والرابط", "المدة والظهور"] as const;
const BACK = "/admin/banners";

/** رابط مؤقت لصورة مختارة (يُحرَّر عند الاستبدال أو الإغلاق). */
function useObjectUrl(file: File | null) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);
  return url;
}

/** تحذير إن كانت الصورة أصغر من المقاس المناسب (تبدو غير حادة). */
function useSmallWarning(url: string | null, minWidth: number) {
  const [width, setWidth] = useState<{ url: string; w: number } | null>(null);
  useEffect(() => {
    if (!url) return;
    const img = new Image();
    img.onload = () => setWidth({ url, w: img.naturalWidth });
    img.src = url;
  }, [url]);
  return url && width?.url === url && width.w < minWidth ? width.w : null;
}

/**
 * تحرير بانر في لوحة جانبية (D-122): معاينة حية بنفس شكل رئيسية المتجر (كمبيوتر/جوال، عربي/English)،
 * والحقول في ثلاث خطوات — كلها في نموذج واحد يُحفظ مرة واحدة. الصور بالسحب أو الاختيار.
 */
export function BannerDrawer({
  initial,
  statusLabel,
  links,
}: {
  initial: AdminBanner | null;
  statusLabel?: string;
  links: LinkOptions;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(saveBannerAction, {});
  useActionToast(state);
  const [step, setStep] = useState(0);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [linkType, setLinkType] = useState<LinkType>(initial?.linkType ?? "PRODUCTS");
  const [text, setText] = useState({
    titleAr: initial?.titleAr ?? "",
    titleEn: initial?.titleEn ?? "",
    textAr: initial?.textAr ?? "",
    textEn: initial?.textEn ?? "",
    ctaAr: initial?.ctaAr ?? "تسوّق الآن",
    ctaEn: initial?.ctaEn ?? "Shop now",
    badgeAr: initial?.badgeAr ?? "",
    badgeEn: initial?.badgeEn ?? "",
  });
  const [desktopFile, setDesktopFile] = useState<File | null>(null);
  const [mobileFile, setMobileFile] = useState<File | null>(null);
  const [removeMobile, setRemoveMobile] = useState(false);
  const desktopUrl = useObjectUrl(desktopFile);
  const mobileUrl = useObjectUrl(mobileFile);
  const smallDesktop = useSmallWarning(desktopUrl, 1600);
  const smallMobile = useSmallWarning(mobileUrl, 800);

  useEffect(() => {
    if (state.success) router.push(BACK, { scroll: false });
  }, [state, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push(BACK, { scroll: false });
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [router]);

  const targets: Partial<Record<LinkType, Option[]>> = {
    CATEGORY: links.categories,
    OCCASION: links.occasions,
    PRODUCT: links.products,
  };
  const set = (k: keyof typeof text) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setText((t) => ({ ...t, [k]: e.target.value }));

  const desktopSrc = desktopUrl ?? initial?.previewUrl ?? null;
  const mobileSrc = mobileUrl ?? (removeMobile ? null : initial?.mobilePreviewUrl) ?? desktopSrc;
  const en = lang === "en";

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="banner-drawer-title">
      <Link href={BACK} scroll={false} aria-label="إغلاق" className="absolute inset-0 bg-forest/45" />
      <section className="absolute inset-y-0 end-0 flex w-full max-w-2xl flex-col bg-card shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id="banner-drawer-title" className="truncate font-display text-2xl font-bold">
              {initial ? text.titleAr || initial.titleAr : "بانر جديد"}
            </h2>
            <p className="text-sm text-muted-foreground">{statusLabel ?? "يُضاف في آخر الترتيب"}</p>
          </div>
          <Link
            href={BACK}
            scroll={false}
            aria-label="إغلاق"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border hover:bg-muted"
          >
            <X aria-hidden className="size-5" />
          </Link>
        </header>

        <form
          id="banner-form"
          action={action}
          // حقل مطلوب في خطوة مخفية: نفتح خطوته ليراه المتصفح ويركّز عليه
          onInvalidCapture={(e) => {
            const s = (e.target as HTMLElement).closest<HTMLElement>("[data-step]")?.dataset.step;
            if (s !== undefined) setStep(Number(s));
          }}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        >
          {initial ? <input type="hidden" name="id" value={initial.id} /> : null}

          {/* المعاينة الحية */}
          <div className="flex flex-col gap-2 border-b border-border bg-background px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="text-sm">معاينة حية</b>
              <div className="flex gap-1 rounded-xl bg-muted p-1 text-xs">
                <Toggle on={device === "desktop"} onClick={() => setDevice("desktop")}>
                  <Monitor aria-hidden className="size-3.5" /> كمبيوتر
                </Toggle>
                <Toggle on={device === "mobile"} onClick={() => setDevice("mobile")}>
                  <Smartphone aria-hidden className="size-3.5" /> جوال
                </Toggle>
                <Toggle on={en} onClick={() => setLang(en ? "ar" : "en")}>
                  English
                </Toggle>
              </div>
            </div>
            <BannerPreview
              device={device}
              lang={lang}
              src={device === "desktop" ? desktopSrc : mobileSrc}
              title={(en ? text.titleEn : text.titleAr) || (en ? "Banner title" : "عنوان البانر")}
              text={en ? text.textEn : text.textAr}
              cta={(en ? text.ctaEn : text.ctaAr) || (en ? "Shop now" : "تسوّق الآن")}
              badge={en ? text.badgeEn : text.badgeAr}
            />
          </div>

          <nav aria-label="خطوات" className="flex gap-1 border-b border-border px-5 pt-3">
            {STEPS.map((s, i) => (
              <button
                key={s}
                type="button"
                aria-current={step === i ? "step" : undefined}
                onClick={() => setStep(i)}
                className={cn(
                  "min-h-11 border-b-2 px-3 text-sm font-semibold",
                  step === i
                    ? "border-forest text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="tabular-nums">{i + 1}</span> · {s}
              </button>
            ))}
          </nav>

          <div className="flex flex-col gap-4 px-5 py-4">
            {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}

            {/* ١ · الصور */}
            <div data-step="0" className={cn("grid gap-4 sm:grid-cols-[2fr_1fr]", step !== 0 && "hidden")}>
              <Dropzone
                title={<>صورة الكمبيوتر {initial ? null : <span className="text-danger">*</span>}</>}
                hint="عريضة 2:1 — 1600×800 أو أكبر"
                name="image"
                required={!initial}
                pickedUrl={desktopUrl}
                current={initial?.imageUrl}
                onPicked={setDesktopFile}
                warning={smallDesktop ? `عرضها ${smallDesktop}px — قد تبدو غير حادة على الشاشات الكبيرة.` : null}
              />
              <div className="flex flex-col gap-2">
                <Dropzone
                  title={
                    <>
                      صورة الجوال <span className="font-normal text-muted-foreground">(اختيارية)</span>
                    </>
                  }
                  hint="طولية 4:5 — بدونها تُقص صورة الكمبيوتر من الوسط"
                  name="mobileImage"
                  pickedUrl={mobileUrl}
                  current={removeMobile ? null : initial?.mobileImageUrl}
                  onPicked={(f) => {
                    setMobileFile(f);
                    if (f) setRemoveMobile(false);
                    setDevice("mobile");
                  }}
                  warning={smallMobile ? `عرضها ${smallMobile}px — الأنسب 800px أو أكثر.` : null}
                  tall
                />
                {initial?.mobileImageUrl && !mobileFile ? (
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="removeMobileImage"
                      checked={removeMobile}
                      onChange={(e) => setRemoveMobile(e.target.checked)}
                      className="size-5 accent-forest"
                    />
                    حذف صورة الجوال
                  </label>
                ) : null}
              </div>
            </div>

            {/* ٢ · النص والرابط */}
            <div data-step="1" className={cn("grid gap-3 sm:grid-cols-2", step !== 1 && "hidden")}>
              <label className={field}>
                <span className={label}>العنوان بالعربي</span>
                <Input
                  name="titleAr"
                  value={text.titleAr}
                  onChange={set("titleAr")}
                  onFocus={() => setLang("ar")}
                  required
                  minLength={2}
                  maxLength={60}
                />
              </label>
              <label className={field}>
                <span className={label}>العنوان بالإنجليزي</span>
                <Input
                  name="titleEn"
                  value={text.titleEn}
                  onChange={set("titleEn")}
                  onFocus={() => setLang("en")}
                  required
                  minLength={2}
                  maxLength={60}
                  dir="ltr"
                />
              </label>
              <label className={field}>
                <span className={label}>النص بالعربي (اختياري)</span>
                <Input
                  name="textAr"
                  value={text.textAr}
                  onChange={set("textAr")}
                  onFocus={() => setLang("ar")}
                  maxLength={160}
                />
              </label>
              <label className={field}>
                <span className={label}>النص بالإنجليزي (اختياري)</span>
                <Input
                  name="textEn"
                  value={text.textEn}
                  onChange={set("textEn")}
                  onFocus={() => setLang("en")}
                  maxLength={160}
                  dir="ltr"
                />
              </label>
              <label className={field}>
                <span className={label}>نص الزر بالعربي</span>
                <Input
                  name="ctaAr"
                  value={text.ctaAr}
                  onChange={set("ctaAr")}
                  onFocus={() => setLang("ar")}
                  required
                  minLength={2}
                  maxLength={30}
                />
              </label>
              <label className={field}>
                <span className={label}>نص الزر بالإنجليزي</span>
                <Input
                  name="ctaEn"
                  value={text.ctaEn}
                  onChange={set("ctaEn")}
                  onFocus={() => setLang("en")}
                  required
                  minLength={2}
                  maxLength={30}
                  dir="ltr"
                />
              </label>
              <label className={field}>
                <span className={label}>الزر يفتح</span>
                <NativeSelect
                  name="linkType"
                  value={linkType}
                  onChange={(e) => setLinkType(e.target.value as LinkType)}
                >
                  {(Object.keys(LINK_LABELS) as LinkType[]).map((k) => (
                    <option key={k} value={k}>
                      {LINK_LABELS[k]}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              {/* قائمة لكل نوع، والظاهرة فقط تُرسل (الخادم يقرأ target_<النوع>) */}
              {(["CATEGORY", "OCCASION", "PRODUCT"] as const).map((k) =>
                linkType === k ? (
                  <label key={k} className={field}>
                    <span className={label}>{LINK_LABELS[k]}</span>
                    <NativeSelect
                      name={`target_${k}`}
                      required
                      defaultValue={initial?.linkType === k ? initial.linkTarget : ""}
                    >
                      <option value="">اختاري…</option>
                      {(targets[k] ?? []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                ) : null,
              )}
              <label className={field}>
                <span className={label}>شارة بالعربي (اختيارية)</span>
                <Input
                  name="badgeAr"
                  value={text.badgeAr}
                  onChange={set("badgeAr")}
                  onFocus={() => setLang("ar")}
                  maxLength={30}
                  placeholder="مثال: جديد، حتى 21 مارس"
                />
              </label>
              <label className={field}>
                <span className={label}>شارة بالإنجليزي (اختيارية)</span>
                <Input
                  name="badgeEn"
                  value={text.badgeEn}
                  onChange={set("badgeEn")}
                  onFocus={() => setLang("en")}
                  maxLength={30}
                  dir="ltr"
                  placeholder="e.g. New"
                />
              </label>
            </div>

            {/* ٣ · المدة والظهور */}
            <div data-step="2" className={cn("flex flex-col gap-3", step !== 2 && "hidden")}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={field}>
                  <span className={label}>يظهر من (اختياري)</span>
                  <Input type="date" name="startsOn" defaultValue={initial?.startsOn} dir="ltr" />
                </label>
                <label className={field}>
                  <span className={label}>حتى (اختياري)</span>
                  <Input type="date" name="endsOn" defaultValue={initial?.endsOn} dir="ltr" />
                </label>
              </div>
              <p className={hint}>
                بلا تاريخ = دائم. البانر المجدول يظهر ويختفي بنفسه حسب التاريخ (بتوقيت الخرطوم). يظهر في المتجر أول 3
                بانرات ظاهرة بالترتيب.
              </p>
            </div>
          </div>
        </form>

        {initial ? (
          <form id="banner-delete" action={deleteBannerAction} className="hidden">
            <input type="hidden" name="id" value={initial.id} />
          </form>
        ) : null}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <Button type="submit" form="banner-form" disabled={pending}>
              {pending ? "جارٍ الحفظ…" : initial ? "حفظ" : "إضافة البانر"}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" variant="outline" onClick={() => setStep(step + 1)}>
                التالي: {STEPS[step + 1]}
              </Button>
            ) : (
              <Link
                href={BACK}
                scroll={false}
                className="px-3 text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                إلغاء
              </Link>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                name="isActive"
                form="banner-form"
                defaultChecked={initial?.isActive ?? true}
                className="size-5 accent-forest"
              />
              مفعّل
            </label>
            {initial ? (
              <button
                type="submit"
                form="banner-delete"
                onClick={(e) => {
                  if (!confirm(`حذف بانر «${initial.titleAr}»؟`)) e.preventDefault();
                }}
                className="flex min-h-11 items-center gap-1.5 rounded-xl border border-danger/40 px-3 text-sm font-semibold text-danger hover:bg-danger/10"
              >
                <Trash2 aria-hidden className="size-4" /> حذف
              </button>
            ) : null}
          </div>
        </footer>
      </section>
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex min-h-8 items-center gap-1 rounded-lg px-2.5 font-semibold",
        on ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** صورة بالسحب والإفلات أو الاختيار — نفس حقل ImageInput (تصغير في المتصفح وحد الحجم). */
function Dropzone({
  title,
  hint: hintText,
  name,
  required,
  pickedUrl,
  current,
  onPicked,
  warning,
  tall,
}: {
  title: React.ReactNode;
  hint: string;
  name: string;
  required?: boolean;
  pickedUrl: string | null;
  current?: string | null;
  onPicked: (f: File | null) => void;
  warning: string | null;
  tall?: boolean;
}) {
  const ref = useRef<HTMLLabelElement>(null);
  const [over, setOver] = useState(false);
  const shown = pickedUrl ?? current ?? null;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className={label}>{title}</span>
      <label
        ref={ref}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const file = e.dataTransfer.files[0];
          const input = ref.current?.querySelector<HTMLInputElement>("input[type=file]");
          if (!file || !input || !file.type.startsWith("image/")) return;
          const list = new DataTransfer();
          list.items.add(file);
          input.files = list.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }}
        className={cn(
          "relative flex cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border-2 border-dashed p-4 text-center text-sm focus-within:ring-2 focus-within:ring-sage",
          tall ? "aspect-[4/5]" : "aspect-[2/1]",
          over ? "border-sage bg-sage/10" : "border-border bg-background hover:border-sage",
        )}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- معاينة محلية (blob) أو مصغّرة
          <img src={shown} alt="" className="absolute inset-0 size-full object-cover" />
        ) : null}
        <span
          className={cn(
            "relative flex flex-col items-center gap-1 rounded-xl px-3 py-2",
            shown && "bg-card/90 shadow-sm",
          )}
        >
          <ImagePlus aria-hidden className="size-6 text-sage" />
          <b>{shown ? "استبدال الصورة" : "اسحبي الصورة هنا أو اضغطي للاختيار"}</b>
          <span className="text-xs text-muted-foreground">{hintText}</span>
        </span>
        <ImageInput
          name={name}
          required={required}
          accept="image/jpeg,image/png,image/webp"
          onPicked={onPicked}
          className="sr-only"
        />
      </label>
      {warning ? <span className="text-xs font-semibold text-warning">{warning}</span> : null}
    </div>
  );
}

/** نفس تكوين بانر رئيسية المتجر (hero-carousel) مصغّراً: الصورة، التدرج، الشارة، العنوان، النص، الزر. */
function BannerPreview({
  device,
  lang,
  src,
  title,
  text,
  cta,
  badge,
}: {
  device: "desktop" | "mobile";
  lang: "ar" | "en";
  src: string | null;
  title: string;
  text: string;
  cta: string;
  badge: string;
}) {
  const mobile = device === "mobile";
  return (
    <div className="flex justify-center">
      <div
        dir={lang === "ar" ? "rtl" : "ltr"}
        lang={lang}
        className={cn(
          "relative isolate flex items-end overflow-hidden rounded-[14px] bg-forest text-ivory",
          mobile ? "aspect-[4/5] w-56" : "aspect-[2/1] w-full",
        )}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- معاينة محلية أو صورة البانر الحالية
          <img src={src} alt="" className="absolute inset-0 -z-20 size-full object-cover" />
        ) : (
          <span className="absolute inset-0 -z-20 flex items-start justify-center pt-6 text-xs text-ivory/60">
            اختاري صورة لترى المعاينة
          </span>
        )}
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 -z-10",
            mobile
              ? "bg-linear-to-t from-forest/95 via-forest/70 via-40% to-transparent to-75%"
              : lang === "ar"
                ? "bg-linear-to-l from-forest/90 via-forest/70 to-transparent to-70%"
                : "bg-linear-to-r from-forest/90 via-forest/70 to-transparent to-70%",
          )}
        />
        {badge ? (
          <span className="absolute start-3 top-3 rounded-full border border-ivory/25 bg-forest/75 px-2.5 py-0.5 text-[10px] font-semibold">
            {badge}
          </span>
        ) : null}
        <div className={cn("flex flex-col items-start gap-1.5 px-4 pb-5", !mobile && "max-w-[56%] px-6")}>
          <b className={cn("font-display leading-tight", mobile ? "text-lg" : "text-2xl")}>{title}</b>
          {text ? <span className="text-[11px] leading-relaxed text-ivory/85">{text}</span> : null}
          <span className="mt-0.5 inline-flex min-h-7 items-center rounded-md bg-ivory px-3 text-[11px] font-bold text-forest">
            {cta}
          </span>
        </div>
      </div>
    </div>
  );
}
