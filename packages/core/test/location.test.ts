import { describe, expect, it } from "vitest";
import { coordsToMapsUrl, normalizeLocation } from "../src/location";

describe("normalizeLocation (D-163)", () => {
  it("turns device coordinates into a Google Maps link", () => {
    expect(normalizeLocation("15.5961,32.5337")).toBe("https://www.google.com/maps?q=15.596100,32.533700");
    expect(normalizeLocation(" 15.6 , 32.5 ")).toBe("https://www.google.com/maps?q=15.600000,32.500000");
  });

  it("rejects out-of-range coordinates", () => {
    expect(normalizeLocation("95,32")).toBeNull();
    expect(coordsToMapsUrl(10, 200)).toBeNull();
  });

  it("accepts map links, also inside a WhatsApp message", () => {
    expect(normalizeLocation("https://maps.app.goo.gl/AbC123")).toBe("https://maps.app.goo.gl/AbC123");
    expect(normalizeLocation("موقعي: https://maps.google.com/?q=15.6,32.5 شكراً")).toBe(
      "https://maps.google.com/?q=15.6,32.5",
    );
    expect(normalizeLocation("http://www.google.com/maps/place/x/@15.6,32.5,17z")).toBe(
      "https://www.google.com/maps/place/x/@15.6,32.5,17z",
    );
    expect(normalizeLocation("https://maps.apple.com/?ll=15.6,32.5")).toBe("https://maps.apple.com/?ll=15.6,32.5");
  });

  it("rejects anything that isn't a map link", () => {
    expect(normalizeLocation("")).toBeNull();
    expect(normalizeLocation("الخرطوم بحري")).toBeNull();
    expect(normalizeLocation("https://evil.example.com/maps")).toBeNull();
    expect(normalizeLocation("https://www.google.com/search?q=x")).toBeNull();
    expect(normalizeLocation("https://goo.gl/abc")).toBeNull();
    expect(normalizeLocation("javascript:alert(1)")).toBeNull();
  });
});
