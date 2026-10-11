import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";

/**
 * بطاقة معاينة الرابط (D-126): صورة 1200×630 تظهر حين يُلصق رابط المتجر في واتساب وغيره — صورة المنتج
 * في جهة، وفي الأخرى الشعار والقسم والاسم والسعر. النص يُرسم بـ Pango (عبر Sharp) لأنه يربط الحروف العربية
 * ويرتّب الكلمات من اليمين لليسار؛ مولّد Next (satori) يعكس ترتيب الكلمات العربية ولا يقرأ جداول Amiri.
 */

const W = 1200;
const H = 630;
const PAD = 56;
const IMAGE_W = 600;
const TEXT_W = W - IMAGE_W - PAD * 2;
const FOREST = "#2F3B2C";
const IVORY = "#F5F1E8";
const MUTED = "#5F6B54";

const FONT_DIR = path.join(process.cwd(), "src/fonts/og");
const FONT_FILES = [
  "amiri-arabic-700.ttf",
  "amiri-latin-700.ttf",
  "cormorant-latin-700.ttf",
  "plex-arabic-700.ttf",
  "plex-latin-700.ttf",
];
const BRAND_DIR = path.join(process.cwd(), "public/brand");

/** تسجيل خطوط الهوية في fontconfig مرة واحدة (sharp يضيف ملف «fontfile» لمجموعة الخطوط). */
let fontsReady: Promise<void> | null = null;
function registerFonts(): Promise<void> {
  fontsReady ??= (async () => {
    for (const f of FONT_FILES) {
      await sharp({ text: { text: ".", fontfile: path.join(FONT_DIR, f) } })
        .png()
        .toBuffer();
    }
  })();
  return fontsReady;
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface Rendered {
  input: Buffer;
  width: number;
  height: number;
}

async function text(value: string, font: string, color: string, align: "left" | "right"): Promise<Rendered> {
  const { data, info } = await sharp({
    text: {
      text: `<span foreground="${color}">${escape(value)}</span>`,
      font,
      width: TEXT_W,
      align,
      rgba: true,
      dpi: 72,
      wrap: "word",
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { input: data, width: info.width, height: info.height };
}

/** العنوان: يصغر الخط حتى يسع ثلاثة أسطر، وإلا يُقص بـ «…». */
async function title(value: string, align: "left" | "right"): Promise<Rendered> {
  // عناوين الهوية: Amiri للعربية وCormorant Garamond للإنجليزية (brand-identity §3)
  const family = align === "right" ? "Amiri Bold" : "Cormorant Garamond Bold";
  for (const size of [62, 54, 46]) {
    const r = await text(value, `${family} ${size}`, FOREST, align);
    if (r.height <= 250) return r;
  }
  return text(`${value.slice(0, 60).trim()}…`, `${family} 46`, FOREST, align);
}

export interface ShareCardInput {
  /** صورة المنتج أو المناسبة (أي صيغة يقرؤها Sharp) */
  image: Buffer | null;
  title: string;
  /** سطر صغير فوق العنوان (القسم، «مناسبة») */
  kicker?: string | null;
  /** السعر منسّقاً («185,000 ج.س») — بلا سعر للمناسبات والمنتج غير المتاح */
  price?: string | null;
  tagline: string;
  locale: "ar" | "en";
}

export async function renderShareCard(input: ShareCardInput): Promise<Buffer> {
  await registerFonts();
  const rtl = input.locale === "ar";
  const align = rtl ? "right" : "left";
  // العربية: الصورة يميناً والنص يساراً بمحاذاة اليمين (كما في التصور)؛ الإنجليزية معكوسة
  const imageLeft = rtl ? W - IMAGE_W : 0;
  const textStart = rtl ? PAD : IMAGE_W + PAD;
  const at = (width: number) => (rtl ? textStart + TEXT_W - width : textStart);

  const photo = input.image
    ? await sharp(input.image).resize(IMAGE_W, H, { fit: "cover", position: "attention" }).toBuffer()
    : await sharp(path.join(BRAND_DIR, "pattern-sage.svg")).resize(IMAGE_W, H, { fit: "cover" }).toBuffer();

  const logo = await sharp(path.join(BRAND_DIR, rtl ? "logo-ar-mark-forest.svg" : "logo-en-mark-forest.svg"), {
    density: 300,
  })
    .resize({ height: 64 })
    .png()
    .toBuffer({ resolveWithObject: true });

  const [kicker, head, price, tagline] = await Promise.all([
    input.kicker ? text(input.kicker, "IBM Plex Sans Arabic Bold 26", MUTED, align) : null,
    title(input.title, align),
    input.price ? text(input.price, "IBM Plex Sans Arabic Bold 34", IVORY, align) : null,
    text(input.tagline, "IBM Plex Sans Arabic Bold 22", MUTED, align),
  ]);

  // المجموعة الوسطى (القسم، الاسم، السعر) في منتصف المساحة بين الشعار والسطر الأخير
  const top = PAD + logo.info.height + 24;
  const bottom = H - PAD - tagline.height - 24;
  const badge = price ? { w: price.width + 40, h: price.height + 20 } : null;
  const group = (kicker ? kicker.height + 12 : 0) + head.height + (badge ? 20 + badge.h : 0);
  let y = Math.max(top, top + Math.round((bottom - top - group) / 2));

  const layers: OverlayOptions[] = [
    { input: photo, left: imageLeft, top: 0 },
    { input: logo.data, left: at(logo.info.width), top: PAD },
  ];
  if (kicker) {
    layers.push({ input: kicker.input, left: at(kicker.width), top: y });
    y += kicker.height + 12;
  }
  layers.push({ input: head.input, left: at(head.width), top: y });
  y += head.height + 20;
  if (price && badge) {
    const pill = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${badge.w}" height="${badge.h}"><rect width="100%" height="100%" rx="14" fill="${FOREST}"/></svg>`,
    );
    layers.push({ input: pill, left: at(badge.w), top: y });
    layers.push({ input: price.input, left: at(badge.w) + 20, top: y + 10 });
  }
  layers.push({ input: tagline.input, left: at(tagline.width), top: H - PAD - tagline.height });

  return sharp({ create: { width: W, height: H, channels: 3, background: IVORY } })
    .composite(layers)
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toBuffer();
}
