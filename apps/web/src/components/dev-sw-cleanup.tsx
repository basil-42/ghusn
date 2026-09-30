/**
 * في التطوير فقط: عامل خدمة نقطة البيع (D-82) من نسخة سابقة يقدّم ملفات `/_next/static` القديمة
 * (أسماؤها ثابتة في التطوير) فينكسر العرض قبل أي كود React. هذا السكربت يعمل قبل ملفات التطبيق:
 * إن وُجد عامل يتحكم في الصفحة يُلغى وتُمسح ذاكرته ثم تُعاد الصفحة مرة واحدة.
 */
const DEV_SW_CLEANUP = `(function(){var s=navigator.serviceWorker;if(!s||!s.controller)return;
s.getRegistrations().then(function(r){return Promise.all(r.map(function(x){return x.unregister()}))})
.then(function(){return window.caches?caches.keys():[]})
.then(function(k){return Promise.all(k.filter(function(n){return n.indexOf("ghusn-pos-")===0}).map(function(n){return caches.delete(n)}))})
.then(function(){location.reload()});})();`;

/**
 * يوضع في قالب التشغيل (الإدارة ونقطة البيع) فقط: هناك سُجّل العامل وانكسر العرض، وهذا القالب لا
 * يُعاد رسمه في المتصفح. لا يوضع في قالب المتجر: تبديل اللغة يعيد رسمه فيحذّر React من وسم <script>.
 * (instrumentation-client لا يكفي: كوده ضمن الملفات التي يقدّمها العامل القديم من ذاكرته.)
 */
export function DevServiceWorkerCleanup() {
  if (process.env.NODE_ENV === "production") return null;
  return <script dangerouslySetInnerHTML={{ __html: DEV_SW_CLEANUP }} />;
}
