import { describe, expect, it } from "vitest";
import {
  ORDER_MESSAGE_KEYS,
  renderOrderMessage,
  suggestedOrderMessages,
  whatsappMessageUrl,
  type OrderMessageContext,
} from "../src";

const ctx = (over: Partial<OrderMessageContext>): OrderMessageContext => ({
  status: "NEW",
  fulfillment: "DELIVERY",
  paymentMethod: "COD",
  proofRejected: false,
  paid: false,
  previousStatus: null,
  autoCancelled: false,
  ...over,
});
const vars = {
  name: "سارة",
  number: "GHS-2026-000157",
  amount: "185,000",
  link: "https://ghusn.store/o/abc",
  signature: "غصن — هدايا تُصنع لتُذكر",
  deadline: "7 أكتوبر 4:30 م",
  address: "الخرطوم، شارع المك نمر",
  hours: "يومياً 10 ص – 10 م",
};

describe("suggestedOrderMessages", () => {
  it("suggests the message for each status", () => {
    expect(suggestedOrderMessages(ctx({ status: "NEW" })).primary).toBe("RECEIVED");
    expect(suggestedOrderMessages(ctx({ status: "AWAITING_PAYMENT", paymentMethod: "BANKAK" }))).toEqual({
      primary: "AWAITING_TRANSFER",
      others: ["PAYMENT_REMINDER", "ITEM_UNAVAILABLE"],
    });
    expect(suggestedOrderMessages(ctx({ status: "AWAITING_PAYMENT", proofRejected: true })).primary).toBe(
      "PROOF_REJECTED",
    );
    expect(suggestedOrderMessages(ctx({ status: "CONFIRMED", paymentMethod: "BANKAK" })).primary).toBe(
      "PAYMENT_CONFIRMED",
    );
    expect(suggestedOrderMessages(ctx({ status: "CONFIRMED", paymentMethod: "COD" })).primary).toBe("RECEIVED");
    expect(suggestedOrderMessages(ctx({ status: "PREPARING" }))).toEqual({
      primary: null,
      others: ["ITEM_UNAVAILABLE"],
    });
    expect(suggestedOrderMessages(ctx({ status: "READY", fulfillment: "PICKUP" })).primary).toBe("READY_PICKUP");
    expect(suggestedOrderMessages(ctx({ status: "READY", fulfillment: "DELIVERY" })).primary).toBeNull();
    expect(suggestedOrderMessages(ctx({ status: "READY", previousStatus: "OUT_FOR_DELIVERY" })).primary).toBe(
      "DELIVERY_FAILED",
    );
    expect(suggestedOrderMessages(ctx({ status: "OUT_FOR_DELIVERY" })).primary).toBe("OUT_FOR_DELIVERY");
    expect(suggestedOrderMessages(ctx({ status: "DELIVERED" }))).toEqual({ primary: "DELIVERED", others: [] });
  });

  it("picks the right cancellation message", () => {
    expect(suggestedOrderMessages(ctx({ status: "CANCELLED", autoCancelled: true })).primary).toBe("CANCELLED_UNPAID");
    expect(suggestedOrderMessages(ctx({ status: "CANCELLED", paid: true })).primary).toBe("CANCELLED_REFUND");
    expect(suggestedOrderMessages(ctx({ status: "CANCELLED" })).primary).toBe("CANCELLED");
  });
});

describe("renderOrderMessage", () => {
  it("fills the variables and ends with the signature (never a variable at the end)", () => {
    for (const key of ORDER_MESSAGE_KEYS) {
      for (const locale of ["ar", "en"] as const) {
        const text = renderOrderMessage(key, { ...vars, reason: "سبب", item: "عطر", recipient: null }, locale);
        expect(text.split("\n").at(-1)).toBe(vars.signature);
        expect(text).not.toMatch(/undefined|null|\{/);
      }
    }
  });

  it("writes the received message as approved", () => {
    expect(renderOrderMessage("RECEIVED", vars)).toBe(
      [
        "مرحباً سارة 🌿",
        "استلمنا طلبك رقم GHS-2026-000157 بقيمة 185,000 ج.س، وسنبدأ تجهيزه قريباً.",
        "تابع حالة طلبك من هنا: https://ghusn.store/o/abc",
        "غصن — هدايا تُصنع لتُذكر",
      ].join("\n"),
    );
  });

  it("adds address and opening hours for pickup, skipping missing lines", () => {
    const t = renderOrderMessage("READY_PICKUP", vars);
    expect(t).toContain("العنوان: الخرطوم، شارع المك نمر");
    expect(t).toContain("ساعات العمل: يومياً 10 ص – 10 م");
    const bare = renderOrderMessage("READY_PICKUP", { ...vars, address: null, hours: "" });
    expect(bare).not.toContain("العنوان");
    expect(bare).not.toContain("ساعات العمل");
  });

  it("uses the gift wording toward the sender when there is a recipient", () => {
    expect(renderOrderMessage("OUT_FOR_DELIVERY", { ...vars, recipient: "أمي" })).toContain("هديتك إلى أمي في الطريق");
    expect(renderOrderMessage("DELIVERED", { ...vars, recipient: "أمي" })).toContain("وصلت هديتك إلى أمي");
    expect(renderOrderMessage("DELIVERED", vars)).toContain("وصل طلبك رقم GHS-2026-000157");
  });

  it("falls back to a plain signature when the setting is empty", () => {
    expect(
      renderOrderMessage("PAYMENT_CONFIRMED", { ...vars, signature: " " })
        .split("\n")
        .at(-1),
    ).toBe("غصن");
    expect(
      renderOrderMessage("PAYMENT_CONFIRMED", { ...vars, signature: "" }, "en")
        .split("\n")
        .at(-1),
    ).toBe("Ghusn");
  });

  it("builds a wa.me link with the customer number", () => {
    expect(whatsappMessageUrl("+249912345678", "مرحباً 🌿")).toBe(
      `https://wa.me/249912345678?text=${encodeURIComponent("مرحباً 🌿")}`,
    );
  });
});
