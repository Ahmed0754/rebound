// Passwords and session tokens. Node's own crypto only, so no dependency, and
// no database, so the tests need none.
//
// A password is stored as an scrypt hash with a random salt, in one string
// that also records the cost, so the cost can be raised later without
// breaking the hashes already stored:
//
//   scrypt$<N>$<r>$<p>$<salt, base64>$<hash, base64>

import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// OWASP's minimum for scrypt: N = 2^17, r = 8, p = 1. About 100ms and 128MB
// per hash, which is the point - it makes guessing slow.
const COST = { N: 2 ** 17, r: 8, p: 1 };
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

// 128 * N * r bytes, plus headroom. Node's default (32MB) is below what N = 2^17 needs.
const MAX_MEMORY = 256 * 1024 * 1024;

export const PASSWORD = { min: 8, max: 128 } as const;

function derive(password: string, salt: Buffer, cost: typeof COST): Promise<Buffer> {
  const options: ScryptOptions = { ...cost, maxmem: MAX_MEMORY };

  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

/** Hashes a password for storing. Two calls with the same password give different strings. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, COST);

  return ["scrypt", COST.N, COST.r, COST.p, salt.toString("base64"), key.toString("base64")].join("$");
}

/** Whether `password` is the one `stored` was made from. False for anything malformed. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, N, r, p, salt, hash] = stored.split("$");

  if (scheme !== "scrypt" || salt === undefined || hash === undefined) {
    return false;
  }

  const expected = Buffer.from(hash, "base64");
  const key = await derive(password, Buffer.from(salt, "base64"), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });

  // Constant-time, so how long a wrong guess takes says nothing about how wrong it was.
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// Compared against when the username does not exist, so a missing account
// takes as long to reject as a wrong password - otherwise the response time
// tells anyone which usernames are real.
let decoy: Promise<string> | null = null;

export async function verifyNothing(password: string): Promise<false> {
  decoy ??= hashPassword("decoy password");
  await verifyPassword(password, await decoy);
  return false;
}

/** A new session token: 32 random bytes, safe to put in a header. Given to the client once. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * What the database stores in place of a token. A plain SHA-256 is enough
 * here, unlike for passwords: a token is 256 random bits, so there is nothing
 * to guess.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
