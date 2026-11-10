/**
 * منصة صورة المنتج (D-148 ← D-149 ← D-154): صور المحل مصوّرة بخلفيتها وتُعرض كاملة افتراضياً (`fullBleed`)؛
 * الصورة المقصوصة الخلفية (بيضاء) تبقى خياراً «بهامش».
 * الصورة «بهامش» تُعرض على أبيض بهامش ثابت حولها، وإطار رفيع حول المصغّرات.
 */
export const stageBox = (full = false) => (full ? "bg-muted" : "bg-card");
export const stageImg = (full = false) => (full ? "object-cover" : "object-contain p-[10%]");
