/** أسباب المرتجع الثابتة (D-129) — تُستخدم في نقطة البيع والتقارير. */
export const RETURN_REASONS = ["SIZE", "DEFECT", "CHANGED_MIND", "DAMAGED", "WRONG_ITEM", "OTHER"] as const;
export type ReturnReasonCode = (typeof RETURN_REASONS)[number];

export const RETURN_REASON_LABELS: Record<ReturnReasonCode, string> = {
  SIZE: "مقاس أو لون",
  DEFECT: "عيب مصنعي",
  CHANGED_MIND: "غيّر رأيه",
  DAMAGED: "تالف عند الاستلام",
  WRONG_ITEM: "صنف خطأ",
  OTHER: "أخرى",
};

export const reasonLabel = (code: string | null | undefined) =>
  code && code in RETURN_REASON_LABELS ? RETURN_REASON_LABELS[code as ReturnReasonCode] : "غير محدد";
