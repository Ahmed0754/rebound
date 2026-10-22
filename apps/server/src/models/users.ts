// The model for accounts: sign up, find for logging in, get, remove. A
// password is hashed before it reaches the database, and the hash never
// leaves this file except to be checked - `User` has no field for it.

import { hashPassword } from "../auth.js";
import { pool } from "./db.js";

export type User = {
  id: string;
  username: string;
  createdAt: string;
};

type UserRow = {
  id: string;
  username: string;
  created_at: Date;
};

const USER_COLUMNS = "id, username, created_at";

// Postgres rejects a non-uuid compared against a uuid column, which would
// surface as a 500 for what is only a bad id. Same regex as models/regimes.ts.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Postgres's unique_violation code, raised by the users_username_lower index.
const UNIQUE_VIOLATION = "23505";

/** Thrown when a username is already taken. */
export class DuplicateUsername extends Error {
  constructor(readonly username: string) {
    super(`username "${username}" is taken`);
    this.name = "DuplicateUsername";
  }
}

function fromDbRow(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Creates an account with a password and returns it.
 *
 * Lets the unique index raise the conflict rather than checking first:
 * checking first is a race between the check and the insert.
 */
export async function create(username: string, password: string): Promise<User> {
  const passwordHash = await hashPassword(password);

  try {
    const created = await pool.query<UserRow>(
      `insert into users (username, password_hash) values ($1, $2) returning ${USER_COLUMNS}`,
      [username, passwordHash]
    );

    return fromDbRow(created.rows[0]);
  } catch (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      throw new DuplicateUsername(username);
    }

    throw error;
  }
}

/**
 * An account and its password hash, for checking a login. Null when there is
 * no such username, and for the test accounts made before passwords, which
 * have no hash and so cannot log in.
 */
export async function findForLogin(
  username: string
): Promise<{ user: User; passwordHash: string } | null> {
  // `lower(username)` so the query uses the users_username_lower index.
  const found = await pool.query<UserRow & { password_hash: string | null }>(
    `select ${USER_COLUMNS}, password_hash from users where lower(username) = lower($1)`,
    [username]
  );

  const row = found.rows[0];

  if (row === undefined || row.password_hash === null) {
    return null;
  }

  return { user: fromDbRow(row), passwordHash: row.password_hash };
}

/** One account by id, or null when no account has that id, malformed ids included. */
export async function get(id: string): Promise<User | null> {
  if (!UUID.test(id)) {
    return null;
  }

  const found = await pool.query<UserRow>(`select ${USER_COLUMNS} from users where id = $1`, [
    id,
  ]);

  return found.rows.length === 0 ? null : fromDbRow(found.rows[0]);
}

/**
 * Deletes one account, and reports whether there was one to delete. Its
 * plans, questionnaires and sessions go with it (`on delete cascade`).
 */
export async function remove(id: string): Promise<boolean> {
  if (!UUID.test(id)) {
    return false;
  }

  const deleted = await pool.query(`delete from users where id = $1`, [id]);

  return deleted.rowCount === 1;
}
