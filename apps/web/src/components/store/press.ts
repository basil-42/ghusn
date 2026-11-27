/**
 * أثر الضغط على أزرار المتجر الأيقونية (D-158): الجوال لا يُظهر «المرور» (hover)، فلحظة الضغط يصغر الزر
 * قليلاً وتظهر خلفه خلفية رملية — يعرف الزبون أن ضغطته وصلت. «تقليل الحركة» يُبقي اللون بلا تصغير.
 */
export const PRESS =
  "transition-[background-color,scale] duration-150 active:bg-muted motion-safe:active:scale-[.92] motion-reduce:transition-none";

/** صفوف القوائم (روابط بعرض كامل): لون الضغط فقط بلا تصغير. */
export const PRESS_ROW = "transition-colors duration-150 active:bg-muted motion-reduce:transition-none";
