import { describe, it, expect } from "vitest";
import { hashPassword, hashToken, newToken, verifyNothing, verifyPassword } from "./auth.js";

describe("hashPassword / verifyPassword", () => {
  it("accepts the password a hash was made from", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
  });

  it("rejects any other password", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse batterY", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("never stores the password itself", async () => {
    expect(await hashPassword("correct horse battery")).not.toContain("correct horse battery");
  });

  // A fresh salt every time, so two people with the same password can't be spotted.
  it("gives two different hashes for the same password", async () => {
    expect(await hashPassword("same password")).not.toBe(await hashPassword("same password"));
  });

  it("records the scheme and cost alongside the hash", async () => {
    expect(await hashPassword("whatever123")).toMatch(/^scrypt\$131072\$8\$1\$[^$]+\$[^$]+$/);
  });

  it("rejects a malformed stored value instead of throwing", async () => {
    expect(await verifyPassword("anything", "not a hash")).toBe(false);
    expect(await verifyPassword("anything", "bcrypt$1$2$3$a$b")).toBe(false);
  });

  it("verifyNothing always says no", async () => {
    expect(await verifyNothing("decoy password")).toBe(false);
  });
});

describe("session tokens", () => {
  it("are different every time", () => {
    expect(newToken()).not.toBe(newToken());
  });

  it("are long enough to be unguessable and safe in a header", () => {
    expect(newToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("hash the same way every time, and not to themselves", () => {
    const token = newToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });
});
