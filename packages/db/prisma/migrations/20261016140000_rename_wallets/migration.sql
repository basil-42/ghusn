-- D-144: أسماء العلب كما يقولها المحل. بيانات فقط — لا تغيير في البنية.
UPDATE "Wallet" SET "name" = 'الخزنة' WHERE "name" = 'صندوق المحل'
  AND NOT EXISTS (SELECT 1 FROM "Wallet" WHERE "name" = 'الخزنة');
UPDATE "Wallet" SET "name" = 'محفظة الريال – قطر' WHERE "name" = 'حساب باسل – قطر'
  AND NOT EXISTS (SELECT 1 FROM "Wallet" WHERE "name" = 'محفظة الريال – قطر');
