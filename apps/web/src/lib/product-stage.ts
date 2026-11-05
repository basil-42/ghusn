/**
 * منصة صورة المنتج (D-148 ← D-149): صور المنتجات مرفوعة غالباً بخلفية بيضاء بعد إزالة الخلفية.
 * الصورة تبقى على أبيض نقي كما صُوّرت، بهامش ثابت حوله، والفصل يأتي من الوصف الرملي تحتها
 * (`bg-stage` في بطاقة المنتج) وإطار رفيع حول المصغّرات.
 * الصورة بخلفية حقيقية (`fullBleed`) تُعرض كاملة كما هي.
 */
export const stageBox = (full = false) => (full ? "bg-muted" : "bg-card");
export const stageImg = (full = false) => (full ? "object-cover" : "object-contain p-[10%]");
