# غصن — Ghusn

مستودع نظام ومتجر غصن (Turborepo + pnpm).

```
apps/web        ← Next.js: المتجر + لوحة الإدارة + API
packages/db     ← Prisma: مخطط قاعدة البيانات والبيانات الأولية
docker-compose  ← قاعدة بيانات Postgres للتطوير
```

> **لـ Claude Code:** ابدأ بقراءة `CLAUDE.md` ثم `docs/README.md`.

## التشغيل على جهازك

```bash
cp .env.example .env     # مرة واحدة فقط
pnpm install             # تنزيل المكتبات
pnpm db:up               # تشغيل قاعدة البيانات (يجب أن يكون OrbStack أو Docker يعمل)
pnpm db:migrate          # إنشاء الجداول (يطبّق الترحيلات الموجودة؛ يطلب اسماً فقط عند تعديل المخطط)
pnpm db:seed             # إدخال العملات والأقسام
pnpm dev                 # تشغيل الموقع على http://localhost:3000
```

## أوامر مفيدة

| الأمر | ماذا يفعل |
|---|---|
| `pnpm db:studio` | يفتح قاعدة البيانات في المتصفح لتراها وتعدّلها |
| `pnpm db:down` | يوقف قاعدة البيانات |
| `pnpm build` | يبني نسخة الإنتاج |
