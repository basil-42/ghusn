import { describe, expect, it } from "vitest";
import { formatPhone, internalEmailForPhone, normalizePhone, toLatinDigits } from "../src";

describe("normalizePhone", () => {
  it.each([
    ["0912345678", "+249912345678"],
    ["912345678", "+249912345678"],
    ["+249 91 234 5678", "+249912345678"],
    ["00249912345678", "+249912345678"],
    ["٠٩١٢٣٤٥٦٧٨", "+249912345678"],
    ["۰۹۱۲۳۴۵۶۷۸", "+249912345678"],
    ["  0912-345-678 ", "+249912345678"],
    ["+974 5500 0000", "+97455000000"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(["", "abc", "12", "091234567890123", "+249 12"])("rejects %j", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe("helpers", () => {
  it("converts Arabic-Indic digits", () => {
    expect(toLatinDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
  });
  it("builds an undeliverable internal email", () => {
    expect(internalEmailForPhone("+249912345678")).toBe("249912345678@phone.ghusn.invalid");
  });
});

describe("formatPhone", () => {
  it("groups an E.164 number for display", () => {
    expect(formatPhone("+249912345678")).toBe("+249 91 234 5678");
    expect(formatPhone("+97455123344")).toBe("+974 5512 3344");
    expect(formatPhone("abc")).toBe("abc");
  });
});
