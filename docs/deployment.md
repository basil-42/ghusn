# دليل النشر والتحديث — غصن (D-166)

> الهدف: نسخة تجريبية على `ghusn.store` من خادم Hostinger KVM2، تُحدَّث بعد كل دمج.
> أسماء الأزرار في Coolify وCloudflare قد تختلف قليلاً بين الإصدارات؛ الخطوات نفسها.

## الصورة الكاملة

```
العميل ← Cloudflare (DNS + SSL + حماية) ← خادم KVM2 (Ubuntu 24.04)
                                              └─ Coolify
                                                  ├─ Traefik (HTTPS، يوجّه ghusn.store للتطبيق)
                                                  ├─ التطبيق (Docker من Dockerfile في المستودع)
                                                  │    └─ مجلد دائم /data/uploads (الصور وإشعارات بنكك)
                                                  └─ PostgreSQL 16 (+ نسخ احتياطي مجدول)
```

- **كل نشر:** Coolify يسحب `main` من GitHub ← يبني الصورة ← عند التشغيل تُطبَّق الترحيلات (`prisma migrate deploy`) ← يعمل التطبيق ← يُفحص `/api/health` ← يُوجَّه إليه الزوار.
- النظام والمتجر تطبيق واحد على نفس النطاق: المتجر `https://ghusn.store` والنظام `https://ghusn.store/admin` ونقطة البيع `/pos`.

---

## أ. الإعداد لأول مرة

### 1) تجهيز الخادم (Hostinger)
1. hPanel ← VPS ← نظام التشغيل: **Ubuntu 24.04** (أو قالب **Coolify** الجاهز إن ظهر في قائمة التطبيقات — يغنيك عن الخطوة 2).
2. عيّن كلمة مرور root (أو أضف مفتاح SSH من جهازك — أفضل).
3. انسخ **عنوان IP** للخادم.
4. hPanel ← VPS ← **Firewall**: اسمح بالمنافذ `22` (SSH) و`80` و`443` و`8000` (لوحة Coolify مؤقتاً).

### 2) تثبيت Coolify
من Terminal على الماك:
```bash
ssh root@IP_الخادم
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```
بعد انتهاء التثبيت افتح `http://IP_الخادم:8000` وأنشئ حساب المدير (بريدك وكلمة مرور قوية).

### 3) النطاق على Cloudflare
1. أنشئ حساباً مجانياً على cloudflare.com ← **Add a site** ← `ghusn.store` ← الخطة Free.
2. Cloudflare يعطيك **خادمَي أسماء** (nameservers). ادخل لوحة الجهة التي اشتريت منها النطاق (Hostinger: Domains ← DNS / Nameservers ← Change nameservers؛ GoDaddy: My Products ← DNS ← Nameservers ← Change ← I'll use my own) وضع الاثنين مكان الحاليين.
3. انتظر حتى تظهر الحالة **Active** في Cloudflare (دقائق إلى ساعات).
4. Cloudflare ← DNS ← Records، أضف:

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `@` | IP الخادم | **DNS only** (رمادي) مؤقتاً |
| A | `www` | IP الخادم | **DNS only** (رمادي) مؤقتاً |

5. Cloudflare ← SSL/TLS ← Overview: **Full (strict)**.

> الرمادي أولاً حتى يصدر Coolify شهادة SSL بلا عوائق؛ نحوّله للبرتقالي في الخطوة 10.

### 4) ربط GitHub بـ Coolify
Coolify ← **Sources** ← **+ Add** ← GitHub App ← اتبع الخطوات، وعند التثبيت اختر **Only select repositories** ← `basil-42/ghusn`.

### 5) قاعدة البيانات
1. Coolify ← **Projects** ← **+ Add** ← الاسم `غصن` ← بيئة `production`.
2. داخلها **+ New** ← **PostgreSQL** ← الإصدار **16** ← الاسم `ghusn-db` ← **Start**.
3. انسخ **Postgres URL (internal)** — يبدأ بـ `postgres://...@ghusn-db...:5432/...` (للخطوة 7).
4. تبويب **Backups** ← فعّل جدولاً يومياً (مثلاً `0 3 * * *`). الوجهة الخارجية (Backblaze B2) في القسم ج.

### 6) التطبيق
1. في نفس المشروع **+ New** ← **Private Repository (with GitHub App)** ← `basil-42/ghusn` ← الفرع `main`.
2. **Build Pack: Dockerfile** (الملف في جذر المستودع).
3. **Domains:** `https://ghusn.store,https://www.ghusn.store` — والمنفذ **Ports Exposes:** `3000`.
4. فعّل **Auto Deploy** (النشر تلقائياً عند كل دمج في `main`).

### 7) متغيرات البيئة
التطبيق ← **Environment Variables** (اترك «Build Variable» غير مفعّل):

| المتغير | القيمة |
|---|---|
| `DATABASE_URL` | الرابط الداخلي من الخطوة 5 |
| `APP_URL` | `https://ghusn.store` |
| `BETTER_AUTH_URL` | `https://ghusn.store` |
| `BETTER_AUTH_SECRET` | ناتج `openssl rand -base64 32` على الماك — **لا تغيّره بعد التشغيل** (يخرج الجميع) |
| `MAPTILER_KEY` | اختياري — طبقة القمر الصناعي (D-164) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | اختياري — إشعارات الجوال (`pnpm push:keys` على الماك ينشئها) |
| `UMAMI_SCRIPT_URL` / `UMAMI_WEBSITE_ID` | اختياري — قياس الزيارات |

`UPLOAD_DIR=/data/uploads` و`CHROMIUM_PATH` مضبوطان في الصورة نفسها.

### 8) مجلد الصور الدائم
التطبيق ← **Persistent Storage** ← **+ Add** ← Volume: الاسم `ghusn-uploads`، **Destination Path:** `/data/uploads`.
> بدونه تضيع صور المنتجات وإشعارات بنكك عند كل تحديث.

### 9) أول نشر
1. **Deploy** وتابع **Logs** — البناء يأخذ 5–10 دقائق أول مرة.
2. عند النجاح تظهر الحالة **Running (healthy)**.
3. التطبيق ← **Terminal** (داخل حاوية التطبيق)، مرة واحدة فقط:
```bash
pnpm db:seed        # العملات، المحافظ، الأقسام التسعة
pnpm owner:setup    # اسمك ورقم هاتفك وكلمة المرور للدخول
```
> لا تشغّل `db:seed` مرة ثانية بعد تعديل الأقسام (يعيد أسماءها وترتيبها). ولا `db:fresh` أو `db:demo` على الخادم أبداً.

### 10) التحقق والتحويل للبرتقالي
1. افتح `https://ghusn.store` و`https://ghusn.store/login` و`https://ghusn.store/api/health` (يجب `{"ok":true}`).
2. Cloudflare ← DNS ← حوّل السجلين إلى **Proxied** (برتقالي) ← تأكد أن الموقع ما زال يعمل.
3. Cloudflare ← SSL/TLS ← Edge Certificates ← **Always Use HTTPS: On**.

### 11) الضبط داخل النظام
بنفس ترتيب `docs/trial-run.md`: سعر الصرف، حساب بنكك (الضبط ← المتجر)، المستخدمون (أخواتك)، الأقسام والمنتجات، التغليف وأسعاره، البانرات.

---

## ب. التحديث (كل مرة)

1. أنا أفتح طلب الدمج، CI ينجح، وأنت تقول «ادمج».
2. **إن كان في التحديث تغيير لقاعدة البيانات** (أذكره لك صراحة): Coolify ← `ghusn-db` ← Backups ← **Backup Now** قبل الدمج.
3. بعد الدمج ينشر Coolify تلقائياً (أو اضغط **Redeploy**). الترحيلات تُطبَّق وحدها عند تشغيل النسخة الجديدة، والنسخة القديمة تبقى تخدم حتى تصبح الجديدة سليمة.
4. تحقق: الحالة **healthy**، و`/api/health`، وافتح الصفحة التي تغيّرت.

**على الماك** يبقى التحديث كما هو (`git pull` ثم `pnpm install` و`pnpm db:migrate` عند الحاجة).

### التراجع
- Coolify ← التطبيق ← **Deployments** ← اختر نشراً سابقاً ← **Rollback** (يعود الكود فوراً).
- الترحيلات لا تُلغى تلقائياً. إن كان الخلل في قاعدة البيانات نفسها: أخبرني قبل أي شيء، والحل الأخير استعادة نسخة **Backup Now** من الخطوة 2.

---

## ج. النسخ الاحتياطي خارج الخادم (قبل الإطلاق الفعلي)
1. أنشئ حساباً على Backblaze B2 ← Bucket خاص `ghusn-backups` ← Application Key بصلاحية هذا الـ Bucket فقط.
2. Coolify ← **S3 Storages** ← **+ Add**: Endpoint الخاص بالـ Bucket (مثل `https://s3.us-west-004.backblazeb2.com`)، المفتاح والسر، الاسم.
3. `ghusn-db` ← Backups ← اختر هذا التخزين للجدول اليومي، واحتفظ بآخر 30 نسخة.
4. **الصور** (`ghusn-uploads`) غير مشمولة — تنتقل إلى Cloudflare R2 في خطوة لاحقة (D-32).

## د. خيارات أثناء التجربة
- **قفل الموقع عن العامة:** Cloudflare ← Zero Trust ← Access ← Application لـ `ghusn.store` ← سياسة: بريدك وبريد أخواتك فقط (رمز يصل بالبريد). يُزال القفل عند الافتتاح.
- **إغلاق المنفذ 8000:** Coolify ← Settings ← Instance Domain: `https://coolify.ghusn.store` (سجل A رمادي له)، ثم احذف المنفذ 8000 من جدار الحماية.

## هـ. مشاكل شائعة

| العرض | السبب والحل |
|---|---|
| البناء فشل في `pnpm install` | انقطاع شبكة مؤقت ← **Redeploy** |
| الحالة unhealthy و`/api/health` = 503 | `DATABASE_URL` خطأ أو القاعدة متوقفة ← تحقق من الرابط الداخلي وأن `ghusn-db` يعمل |
| خطأ في السجل عن `BETTER_AUTH_SECRET` | المتغير غير مضبوط ← الخطوة 7 |
| الصور اختفت بعد التحديث | المجلد الدائم غير مضاف ← الخطوة 8 |
| خطأ شهادة SSL أو «Too many redirects» | Cloudflare على Flexible ← اجعله **Full (strict)** |
| الدخول يرجع لصفحة الدخول | `APP_URL`/`BETTER_AUTH_URL` لا يطابقان الرابط الذي تفتحه (مع/بدون www) |
