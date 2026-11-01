/**
 * منصة صورة المنتج (D-148): صور المنتجات مرفوعة غالباً بخلفية بيضاء بعد إزالة الخلفية، فتذوب في البطاقة البيضاء.
 * المنصة رملية فاتحة، والصورة تُدمج معها (multiply) فيأخذ الأبيض لون المنصة وتبقى ألوان المنتج، بهامش ثابت حوله.
 * الصورة بخلفية حقيقية (`fullBleed`) تُعرض كاملة كما هي.
 */
export const stageBox = (full = false) => (full ? "bg-muted" : "isolate bg-stage");
export const stageImg = (full = false) => (full ? "object-cover" : "object-contain p-[10%] mix-blend-multiply");
