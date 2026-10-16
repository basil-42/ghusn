#!/usr/bin/env node
/**
 * تصفير النظام للتجربة أو قبل الإطلاق (D-141):
 *   pnpm db:fresh
 * 1) نسخة احتياطية من القاعدة في backups/   2) حذف كل البيانات وإعادة بناء الجداول (migrate reset)
 * 3) البيانات الأساسية بلا أسعار تجريبية (seed)   4) حذف الصور المرفوعة   5) حساب المالك (owner:setup)
 *
 * يرفض العمل على قاعدة ليست على هذا الجهاز أو مع NODE_ENV=production، ويطلب كتابة «صفر» قبل الحذف.
 * بدون أسئلة (للاختبار): GHUSN_FRESH_CONFIRM=صفر ومعه OWNER_PHONE و OWNER_PASSWORD.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = "ghusn-db"; // docker-compose.yml
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "db", CONTAINER]);

function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!existsSync(file)) fail("لا يوجد ملف .env في جذر المشروع (انسخه من .env.example).");
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", ...opts });
  return r.status === 0;
}

async function ask(rl, question) {
  return (await rl.question(question)).trim();
}

/** نسخة pg_dump (custom format): من حاوية docker إن وُجدت، وإلا pg_dump على الجهاز. */
function backup(url, file) {
  const fd = openSync(file, "w");
  try {
    const viaDocker = spawnSync(
      "docker",
      ["exec", CONTAINER, "pg_dump", "-U", decodeURIComponent(url.username), "-Fc", url.pathname.slice(1)],
      { stdio: ["ignore", fd, "ignore"] },
    );
    if (viaDocker.status === 0) return true;
  } finally {
    closeSync(fd);
  }
  const plain = new URL(url);
  plain.search = ""; // pg_dump لا يفهم ?schema=public
  const local = spawnSync("pg_dump", ["-Fc", "-f", file, plain.toString()], { stdio: ["ignore", "ignore", "inherit"] });
  return local.status === 0;
}

async function main() {
  loadEnv();
  if (process.env.NODE_ENV === "production") fail("NODE_ENV=production — التصفير للتطوير والتجربة فقط.");
  if (!process.env.DATABASE_URL) fail("DATABASE_URL غير موجود في .env.");
  const url = new URL(process.env.DATABASE_URL);
  if (!LOCAL_HOSTS.has(url.hostname)) {
    fail(`القاعدة على «${url.hostname}» وليست على هذا الجهاز — التصفير مرفوض.`);
  }
  const uploads = path.resolve(process.env.UPLOAD_DIR ?? path.join(ROOT, "apps/web/uploads"));

  console.log("\nتصفير غصن — سيُحذف كل شيء نهائياً:");
  console.log(
    `  • قاعدة البيانات «${url.pathname.slice(1)}» على ${url.hostname}: الطلبات، المبيعات، الشحنات، المخزون، الحركات، المستخدمون`,
  );
  console.log(`  • الصور المرفوعة: ${uploads}`);
  console.log(
    "ويبقى بعده: العملات، العلب الثلاث (الخزنة، بنكك، محفظة الريال – قطر — فارغة)، الأقسام التسعة، وحساب المالك.\n",
  );

  const rl = createInterface({ input: stdin, output: stdout });
  let answer = process.env.GHUSN_FRESH_CONFIRM;
  if (answer === undefined) answer = await ask(rl, "للمتابعة اكتب «صفر» (أو reset): ");
  if (!["صفر", "صفّر", "reset", "RESET"].includes(answer)) {
    rl.close();
    console.log("أُلغي — لم يتغير شيء.");
    return;
  }

  // 1) نسخة احتياطية
  const backups = path.join(ROOT, "backups");
  mkdirSync(backups, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
  const file = path.join(backups, `ghusn-${stamp}.dump`);
  console.log("\n[1/5] نسخة احتياطية…");
  const saved = backup(url, file) && statSync(file).size > 0;
  if (saved) {
    console.log(`  ✓ ${path.relative(ROOT, file)}`);
  } else {
    rmSync(file, { force: true });
    // بدون أسئلة: لا متابعة بلا نسخة إلا بطلب صريح
    const go = process.env.GHUSN_FRESH_CONFIRM
      ? (process.env.GHUSN_FRESH_NO_BACKUP ?? "n")
      : await ask(rl, "  تعذّرت النسخة الاحتياطية (القاعدة متوقفة؟ أو لا docker ولا pg_dump). متابعة بدونها؟ (y/N): ");
    if (go.toLowerCase() !== "y") {
      rl.close();
      console.log("أُلغي — لم يتغير شيء.");
      return;
    }
  }
  rl.close();

  // 2) حذف كل البيانات وإعادة بناء الجداول
  console.log("\n[2/5] تصفير القاعدة (migrate reset)…");
  if (
    !run("pnpm", [
      "--filter",
      "@ghusn/db",
      "exec",
      "dotenv",
      "-e",
      "../../.env",
      "--",
      "prisma",
      "migrate",
      "reset",
      "--force",
      "--skip-seed",
    ])
  ) {
    fail("فشل التصفير — راجع الرسالة أعلاه (هل القاعدة تعمل؟ pnpm db:up).");
  }

  // 3) البيانات الأساسية
  console.log("\n[3/5] البيانات الأساسية…");
  if (!run("pnpm", ["db:seed"])) fail("فشل إدخال البيانات الأساسية.");

  // 4) الصور
  console.log("\n[4/5] حذف الصور المرفوعة…");
  rmSync(uploads, { recursive: true, force: true });
  console.log("  ✓ حُذفت");

  // 5) حساب المالك
  console.log("\n[5/5] حساب المالك:");
  if (!run("pnpm", ["owner:setup"])) fail("لم يُجهَّز حساب المالك — شغّله لاحقاً: pnpm owner:setup");

  console.log(`
✓ النظام فارغ وجاهز.

قبل أي شيء:
  1. في المتصفح: localhost:3000 ← أدوات المطوّر ← Application ← Clear site data
     (فواتير نقطة البيع غير المرسلة محفوظة في المتصفح — بدون هذا قد تُرسَل للقاعدة الجديدة)
     افعلها في كل متصفح/جهاز فُتحت منه نقطة البيع.
  2. pnpm dev ثم أدخل سعر الجنيه الحقيقي من «سعر الصرف» قبل أي شحنة أو تسعير.
`);
  if (saved) {
    console.log(`للرجوع للنسخة الاحتياطية:
  docker exec -i ${CONTAINER} pg_restore -U ${decodeURIComponent(url.username)} -d ${url.pathname.slice(1)} --clean --if-exists < ${path.relative(ROOT, file)}
`);
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
