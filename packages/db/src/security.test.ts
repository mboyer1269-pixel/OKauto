import { describe, expect, it } from "vitest";
import { hashPassword, hashToken, verifyPassword, verifyToken } from "./index.js";

describe("credential helpers", () => {
  it("hashes and verifies extension tokens", () => {
    const hash = hashToken("secret-token");
    expect(verifyToken("secret-token", hash)).toBe(true);
    expect(verifyToken("wrong-token", hash)).toBe(false);
  });

  it("hashes and verifies user passwords", () => {
    const hash = hashPassword("correct horse battery staple", "fixed-salt");
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(verifyPassword("incorrect", hash)).toBe(false);
  });
});
