import webpush from "web-push";

/**
 * مفاتيح إشعارات الجوال (VAPID — D-109): تُنشأ مرة واحدة وتُلصق في ملف ‎.env (وفي Coolify عند النشر).
 * تغييرها لاحقاً يوقف كل الأجهزة المفعّلة حتى تُفعَّل من جديد.
 */
const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY="${publicKey}"`);
console.log(`VAPID_PRIVATE_KEY="${privateKey}"`);
