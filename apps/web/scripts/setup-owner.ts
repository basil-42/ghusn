/**
 * إعداد حساب المالك: الاسم ورقم الهاتف وكلمة السر — يُشغَّل مرة عند التجهيز أو لاستعادة الدخول.
 *   pnpm owner:setup
 * بدون أسئلة (للخوادم والاختبارات): OWNER_NAME و OWNER_PHONE و OWNER_PASSWORD في البيئة.
 */
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { internalEmailForPhone, normalizePhone } from "@ghusn/core";
import { prisma } from "@ghusn/db";
import { hashPassword } from "better-auth/crypto";

const PASSWORD_MIN = 8;

async function ask(): Promise<{ name: string; phone: string; password: string }> {
  const { OWNER_NAME, OWNER_PHONE, OWNER_PASSWORD } = process.env;
  if (OWNER_PHONE && OWNER_PASSWORD) {
    return { name: OWNER_NAME ?? "باسل", phone: OWNER_PHONE, password: OWNER_PASSWORD };
  }
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const name = (await rl.question("الاسم [باسل]: ")).trim() || "باسل";
    const phone = await rl.question("رقم الهاتف (مثل +974xxxxxxxx أو 0912345678): ");
    const password = await rl.question(`كلمة السر (${PASSWORD_MIN} أحرف على الأقل): `);
    return { name, phone, password };
  } finally {
    rl.close();
  }
}

async function main() {
  const input = await ask();
  const phoneNumber = normalizePhone(input.phone);
  if (!phoneNumber) throw new Error("رقم الهاتف غير صحيح");
  if (input.password.length < PASSWORD_MIN) throw new Error(`كلمة السر أقل من ${PASSWORD_MIN} أحرف`);

  const holder = await prisma.user.findUnique({ where: { phoneNumber } });
  if (holder && holder.role !== "OWNER") throw new Error("هذا الرقم مسجّل لمستخدم آخر ليس مالكاً");

  const hashed = await hashPassword(input.password);
  const owner = await prisma.$transaction(async (tx) => {
    const existing = holder ?? (await tx.user.findFirst({ where: { role: "OWNER" }, orderBy: { createdAt: "asc" } }));
    const user = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: { name: input.name, phoneNumber, banned: false, banReason: null, banExpires: null },
        })
      : await tx.user.create({
          data: { name: input.name, phoneNumber, email: internalEmailForPhone(phoneNumber), role: "OWNER" },
        });

    const account = await tx.account.findFirst({ where: { userId: user.id, providerId: "credential" } });
    if (account) {
      await tx.account.update({ where: { id: account.id }, data: { password: hashed } });
    } else {
      await tx.account.create({
        data: { userId: user.id, accountId: user.id, providerId: "credential", password: hashed },
      });
    }
    // كلمة سر جديدة ← إنهاء أي جلسات قديمة
    await tx.session.deleteMany({ where: { userId: user.id } });
    return user;
  });

  console.log(`✓ حساب المالك جاهز: ${owner.name} — ${owner.phoneNumber}`);
}

main()
  .catch((e: unknown) => {
    console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
