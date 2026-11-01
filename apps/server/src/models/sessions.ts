// The model for sessions: what logging in creates and logging out deletes.
// Only the token's hash is stored - see the sessions migration.

import { hashToken, newToken } from "../auth.js";
import { pool } from "./db.js";

// How long a login lasts. Not renewed by use: after a week, log in again.
const SESSION_DAYS = 7;

/** Starts a session for an account and returns its token. The token is not stored anywhere. */
export async function create(userId: string): Promise<string> {
  const token = newToken();

  await pool.query(
    `insert into sessions (token_hash, user_id, expires_at)
     values ($1, $2, now() + make_interval(days => $3))`,
    [hashToken(token), userId, SESSION_DAYS]
  );

  return token;
}

/** The account a token belongs to, or null when it is unknown or has expired. */
export async function userIdFor(token: string): Promise<string | null> {
  const found = await pool.query<{ user_id: string }>(
    `select user_id from sessions where token_hash = $1 and expires_at > now()`,
    [hashToken(token)]
  );

  return found.rows.length === 0 ? null : found.rows[0].user_id;
}

/** Ends one session. Ending one that is already gone is not an error. */
export async function remove(token: string): Promise<void> {
  await pool.query(`delete from sessions where token_hash = $1`, [hashToken(token)]);
}
