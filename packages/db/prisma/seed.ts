// بيانات أولية: العملات، سعر صرف تجريبي، المحافظ، الأقسام، ومستخدم المالك
import { PrismaClient, RateSource, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const currencies = [
    { code: "USD", nameAr: "دولار أمريكي", nameEn: "US Dollar", symbol: "$", isBase: true },
    { code: "SDG", nameAr: "جنيه سوداني", nameEn: "Sudanese Pound", symbol: "ج.س", decimals: 0 },
    { code: "QAR", nameAr: "ريال قطري", nameEn: "Qatari Riyal", symbol: "ر.ق" },
    { code: "CNY", nameAr: "يوان صيني", nameEn: "Chinese Yuan", symbol: "¥" },
    { code: "EGP", nameAr: "جنيه مصري", nameEn: "Egyptian Pound", symbol: "ج.م" },
  ];
  for (const c of currencies) {
    await prisma.currency.upsert({ where: { code: c.code }, update: c, create: c });
  }

  // أسعار تجريبية فقط — عدّلها من لوحة الإدارة لاحقاً
  const rates = [
    { currencyCode: "USD", unitsPerUsd: "1", source: RateSource.FIXED_PEG, note: "عملة الأساس" },
    { currencyCode: "QAR", unitsPerUsd: "3.64", source: RateSource.FIXED_PEG, note: "مربوط بالدولار" },
    { currencyCode: "SDG", unitsPerUsd: "2500", source: RateSource.PARALLEL_MARKET, note: "سعر تجريبي" },
    { currencyCode: "CNY", unitsPerUsd: "7.2", source: RateSource.BANK, note: "سعر تجريبي" },
    { currencyCode: "EGP", unitsPerUsd: "48", source: RateSource.BANK, note: "سعر تجريبي" },
  ];
  if ((await prisma.exchangeRate.count()) === 0) {
    await prisma.exchangeRate.createMany({ data: rates });
  }

  const wallets = [
    { name: "حساب باسل – قطر", currencyCode: "QAR" },
    { name: "صندوق المحل", currencyCode: "SDG" },
    { name: "بنكك", currencyCode: "SDG" },
  ];
  if ((await prisma.wallet.count()) === 0) {
    await prisma.wallet.createMany({ data: wallets });
  }

  const categories = [
    ["flowers", "ورود", "Flowers"],
    ["womens-perfumes", "عطور نسائية", "Women's Perfumes"],
    ["mens-perfumes", "عطور رجالية", "Men's Perfumes"],
    ["watches", "ساعات", "Watches"],
    ["beauty", "تجميل", "Beauty"],
    ["teddy-bears", "دباديب", "Teddy Bears"],
    ["clothing", "ملبوسات", "Clothing"],
    ["shilas", "شيلات", "Shilas"],
    ["wrapping", "تغليف", "Wrapping"],
  ];
  for (const [i, [slug, nameAr, nameEn]] of categories.entries()) {
    await prisma.category.upsert({
      where: { slug },
      update: { nameAr, nameEn, sortOrder: i },
      create: { slug, nameAr, nameEn, sortOrder: i },
    });
  }

  await prisma.user.upsert({
    where: { email: "owner@ghusn.store" },
    update: {},
    create: { name: "باسل", email: "owner@ghusn.store", role: Role.OWNER },
  });

  console.log("✓ تم إدخال البيانات الأولية");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
