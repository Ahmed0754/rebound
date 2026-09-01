/**
 * Cross-user RLS isolation test, run against the real database.
 *
 * v1's version of this test self-skipped when database credentials were
 * absent from CI, so the build reported green having never actually proven
 * isolation — see DATA_MODEL.md's "RLS decisions" section. This test fails
 * instead of skipping when it cannot run, on purpose.
 *
 * It connects through `rebound_restricted` (the role migration 1756828800000
 * created, which owns nothing and so cannot bypass RLS), sets `app.user_id`
 * per transaction the same way Phase F's `withSession` will, and proves two
 * different users cannot see or write each other's rows.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PoolClient } from "pg";
import { pool, restrictedPool } from "./db.js";

if (!restrictedPool) {
  describe("cross-user RLS isolation", () => {
    it("fails, rather than skipping, when RESTRICTED_DATABASE_URL is not set", () => {
      throw new Error(
        "RESTRICTED_DATABASE_URL is not set, so the isolation test cannot run. " +
          "This must fail the build, not skip — an isolation test that quietly " +
          "skips is exactly the v1 failure this test exists to not repeat. Set a " +
          "password on rebound_restricted (apps/api/scripts/set-restricted-password.ts) " +
          "and add the connection string to .env / CI secrets."
      );
    });
  });
} else {
  const pool_ = restrictedPool; // narrowed once, non-null for the rest of the file

  const userA = { id: randomUUID(), email: `isolation-a-${Date.now()}@test.local` };
  const userB = { id: randomUUID(), email: `isolation-b-${Date.now()}@test.local` };

  async function asUser<T>(userId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool_.connect();
    try {
      await client.query("begin");
      // set_config(..., true) is transaction-scoped — equivalent to SET LOCAL,
      // but parameterized, so a user id never gets string-interpolated into SQL.
      await client.query(`select set_config('app.user_id', $1, true)`, [userId]);
      const result = await fn(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    // Fixtures are created via the privileged pool, which bypasses RLS —
    // exactly why it must never be the connection live request handling uses.
    await pool.query(`insert into users (id, email) values ($1, $2), ($3, $4)`, [
      userA.id,
      userA.email,
      userB.id,
      userB.email,
    ]);
    await pool.query(
      `insert into session_logs (user_id, date, pain_score) values ($1, current_date, 2)`,
      [userA.id]
    );
  });

  afterAll(async () => {
    await pool.query(`delete from session_logs where user_id = any($1::uuid[])`, [
      [userA.id, userB.id],
    ]);
    await pool.query(`delete from users where id = any($1::uuid[])`, [[userA.id, userB.id]]);
    await pool.end();
    await pool_.end();
  });

  describe("cross-user RLS isolation", () => {
    it("lets a user read their own session_logs row", async () => {
      const { rows } = await asUser(userA.id, (c) =>
        c.query("select * from session_logs where user_id = $1", [userA.id])
      );
      expect(rows).toHaveLength(1);
    });

    it("blocks a different user from reading that row", async () => {
      const { rows } = await asUser(userB.id, (c) =>
        c.query("select * from session_logs where user_id = $1", [userA.id])
      );
      expect(rows).toHaveLength(0);
    });

    it("blocks a different user from writing a row that claims another user's id", async () => {
      await expect(
        asUser(userB.id, (c) =>
          c.query(
            `insert into session_logs (user_id, date, pain_score) values ($1, current_date + 1, 3)`,
            [userA.id]
          )
        )
      ).rejects.toThrow();
    });

    it("blocks reading another user's row in the users table itself", async () => {
      const { rows } = await asUser(userB.id, (c) =>
        c.query("select * from users where id = $1", [userA.id])
      );
      expect(rows).toHaveLength(0);
    });

    it("still lets a user read their own row in the users table", async () => {
      const { rows } = await asUser(userA.id, (c) =>
        c.query("select * from users where id = $1", [userA.id])
      );
      expect(rows).toHaveLength(1);
    });
  });
}
