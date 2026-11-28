# صورة التشغيل على الخادم (D-166) — يبنيها Coolify من المستودع عند كل نشر.
# صورة واحدة كاملة (لا standalone): فيها أدوات الصيانة (owner:setup، db:seed، prisma) لتُشغَّل من طرفية Coolify.
FROM node:22-bookworm-slim

ENV NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# chromium: كشوف الشركاء PDF (D-130). openssl: محرّك Prisma. curl: فحص الصحة. الخطوط: العربية في PDF
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-noto-core fonts-noto-color-emoji openssl curl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable

WORKDIR /app

# الاعتماديات أولاً (تُخزَّن مؤقتاً بين النشرات ما لم يتغير القفل)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/db/prisma packages/db/prisma
RUN pnpm install --frozen-lockfile

COPY . .
# البناء لا يحتاج القاعدة (صفحات المتجر تُعرض عند الطلب)
RUN pnpm build

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    CHROMIUM_PATH=/usr/bin/chromium \
    UPLOAD_DIR=/data/uploads

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

# عند كل تشغيل: تطبيق الترحيلات الجديدة ثم تشغيل التطبيق
CMD ["sh", "-c", "pnpm --filter @ghusn/db migrate:deploy && exec pnpm --filter @ghusn/web start"]
