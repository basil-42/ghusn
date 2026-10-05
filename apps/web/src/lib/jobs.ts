import { PgBoss } from "pg-boss";
import { expireUnpaidOrders } from "./orders";
import { deliverPendingPushes } from "./push";

/**
 * المهام الدورية (pg-boss على نفس Postgres، مخطط «pgboss» منفصل). تبدأ مرة واحدة مع الخادم
 * (src/instrumentation.ts). كل 5 دقائق: إلغاء طلبات بنكك المنتهية مهلتها (D-12، D-90)؛ كل دقيقة:
 * إرسال إشعارات الجوال التي لم تُرسل بعد (D-109).
 * pg-boss يضمن تنفيذ المهمة مرة واحدة حتى لو عمل أكثر من خادم.
 */

const EXPIRE_UNPAID = "expire-unpaid-orders";
/** احتياط إشعارات الجوال (D-109): ما لم يُرسل فور حدوثه (خادم أُعيد تشغيله) يُرسل خلال دقيقة. */
const DELIVER_PUSH = "deliver-pending-push";
/** مهمة الموافقة الضمنية على صور الهدايا — أُلغيت الميزة (D-99)، فيُحذف جدولها المحفوظ إن وُجد. */
const RETIRED_QUEUES = ["approve-overdue-gift-photos"];

const globalForJobs = globalThis as unknown as { ghusnJobs?: Promise<PgBoss | null> };

/** Prisma يقبل «?schema=public» في الرابط؛ pg لا يحتاجه. */
function connectionString(): string | null {
  const raw = process.env.DATABASE_URL;
  if (!raw) return null;
  const url = new URL(raw);
  url.searchParams.delete("schema");
  return url.toString();
}

async function start(): Promise<PgBoss | null> {
  const cs = connectionString();
  if (!cs) return null;
  const boss = new PgBoss({ connectionString: cs, schema: "pgboss", max: 2 });
  boss.on("error", (e) => console.error("[jobs]", e));
  await boss.start();
  await boss.createQueue(EXPIRE_UNPAID);
  await boss.schedule(EXPIRE_UNPAID, "*/5 * * * *");
  await boss.work(EXPIRE_UNPAID, async () => {
    const n = await expireUnpaidOrders();
    if (n) console.info(`[jobs] cancelled ${n} unpaid Bankak order(s)`);
  });
  await boss.createQueue(DELIVER_PUSH);
  await boss.schedule(DELIVER_PUSH, "* * * * *");
  await boss.work(DELIVER_PUSH, async () => {
    await deliverPendingPushes();
  });
  for (const name of RETIRED_QUEUES) {
    await boss.unschedule(name).catch(() => {});
    await boss.deleteQueue(name).catch(() => {});
  }
  return boss;
}

export function startJobs(): Promise<PgBoss | null> {
  // مرة واحدة لكل عملية (إعادة التحميل في التطوير لا تنشئ عاملاً ثانياً)
  globalForJobs.ghusnJobs ??= start().catch((e) => {
    console.error("[jobs] failed to start", e);
    globalForJobs.ghusnJobs = undefined;
    return null;
  });
  return globalForJobs.ghusnJobs;
}
