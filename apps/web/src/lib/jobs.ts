import { PgBoss } from "pg-boss";
import { expireUnpaidOrders } from "./orders";
import {
  cleanupNotifications,
  runBankakReminders,
  runEscalations,
  runExpiringBatchAlerts,
  runLowStockAlerts,
  sendDailySummary,
} from "./notification-sweeps";
import { deliverPendingPushes } from "./push";
import { runCountReminders } from "./stock-counts";

/**
 * المهام الدورية (pg-boss على نفس Postgres، مخطط «pgboss» منفصل). تبدأ مرة واحدة مع الخادم
 * (src/instrumentation.ts). كل 5 دقائق: إلغاء طلبات بنكك المنتهية مهلتها (D-12، D-90)؛ كل دقيقة:
 * إرسال إشعارات الجوال التي لم تُرسل بعد (D-109).
 * pg-boss يضمن تنفيذ المهمة مرة واحدة حتى لو عمل أكثر من خادم.
 */

const EXPIRE_UNPAID = "expire-unpaid-orders";
/** احتياط إشعارات الجوال (D-109): ما لم يُرسل فور حدوثه (خادم أُعيد تشغيله) يُرسل خلال دقيقة. */
const DELIVER_PUSH = "deliver-pending-push";
/** الإشعارات المجدولة (D-109): التصعيد وتذكير بنكك كل دقيقة، المخزون كل ساعة، الملخص 10 م، التنظيف ليلاً. */
const NOTIFY_MINUTE = "notifications-minute";
const NOTIFY_HOURLY = "notifications-hourly";
const DAILY_SUMMARY = "notifications-daily-summary";
const CLEANUP = "notifications-cleanup";
/** تذكير الجرد الأسبوعي (D-112): السبت 10 ص — قسم الأسبوع، والجرد الكامل كل 90 يوماً، والرصيد السالب. */
const COUNT_REMINDER = "stock-count-reminder";
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
  const khartoum = { tz: "Africa/Khartoum" };
  const scheduled: [string, string, () => Promise<unknown>][] = [
    [NOTIFY_MINUTE, "* * * * *", async () => (await runEscalations()) + (await runBankakReminders())],
    [NOTIFY_HOURLY, "7 * * * *", async () => (await runLowStockAlerts()) + (await runExpiringBatchAlerts())],
    [DAILY_SUMMARY, "0 22 * * *", () => sendDailySummary()],
    [CLEANUP, "20 4 * * *", () => cleanupNotifications()],
    [COUNT_REMINDER, "0 10 * * 6", () => runCountReminders()],
  ];
  for (const [name, cron, run] of scheduled) {
    await boss.createQueue(name);
    await boss.schedule(name, cron, undefined, khartoum);
    await boss.work(name, async () => {
      await run();
      // ما أنشأته الجولة يُرسل للجوال فوراً
      if (name !== CLEANUP) await deliverPendingPushes();
    });
  }
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
