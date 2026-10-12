import { describe, expect, it } from "vitest";
import { signToken, verifyToken } from "../src/server";

const SECRET = "test-secret-0123456789";

describe("signed tokens", () => {
  const now = 1_700_000_000_000;
  const token = signToken({ k: "statement", id: "abc", exp: now + 1000 }, SECRET);

  it("round-trips while valid", () => {
    expect(verifyToken(token, "statement", SECRET, now)).toEqual({ k: "statement", id: "abc", exp: now + 1000 });
  });
  it("rejects expiry, wrong kind, wrong secret and tampering", () => {
    expect(verifyToken(token, "statement", SECRET, now + 1001)).toBeNull();
    expect(verifyToken(token, "render", SECRET, now)).toBeNull();
    expect(verifyToken(token, "statement", "another-secret-0123456", now)).toBeNull();
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ k: "statement", id: "xyz", exp: now + 1000 })).toString("base64url");
    expect(verifyToken(`${forged}.${sig}`, "statement", SECRET, now)).toBeNull();
    expect(verifyToken(`${body}.${sig}x`, "statement", SECRET, now)).toBeNull();
    expect(verifyToken("garbage", "statement", SECRET, now)).toBeNull();
  });
});
