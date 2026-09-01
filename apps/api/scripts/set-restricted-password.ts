/**
 * One-off admin task: set the login password for the `rebound_restricted` role
 * created in migration 1756828800000. The migration deliberately leaves this
 * role unable to log in — see that migration's comment for why a password
 * isn't scripted into committed migration history.
 *
 * Usage: NEW_RESTRICTED_PASSWORD=... pnpm run db:set-restricted-password
 * (an env var, not a CLI arg, so it never round-trips through pnpm's and
 * dotenv-cli's own `--` argument forwarding). Reads DATABASE_URL (the
 * privileged connection) from the environment, same as every other script here.
 */
import { pool } from "../src/db.js";

const password = process.env.NEW_RESTRICTED_PASSWORD;

if (!password) {
  console.error("Usage: NEW_RESTRICTED_PASSWORD=... pnpm run db:set-restricted-password");
  process.exitCode = 1;
  process.exit();
}

await pool.query(`alter role rebound_restricted with password '${password.replace(/'/g, "''")}'`);
console.log("rebound_restricted password updated.");
await pool.end();
