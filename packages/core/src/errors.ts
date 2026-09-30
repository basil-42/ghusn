export type CoreErrorCode =
  | "INVALID_RATE"
  | "INVALID_QUANTITY"
  | "INVALID_MARGIN"
  | "INVALID_AMOUNT"
  | "EMPTY_SHIPMENT"
  | "EMPTY_CART"
  | "INVALID_TRANSITION";

/** خطأ منطق عمل بكود ثابت، حتى تعرضه الواجهة برسالة عربية مناسبة. */
export class CoreError extends Error {
  constructor(
    readonly code: CoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CoreError";
  }
}
