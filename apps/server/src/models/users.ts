// The model for accounts: create, list, get, remove. No passwords and no
// sessions - see ACCOUNTS.md. Every account is a test account.

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
 * Creates an account and returns it.
 *
 * Lets the unique index raise the conflict rather than checking first:
 * checking first is a race between the check and the insert.
 */
export async function create(username: string): Promise<User> {
  try {
    const created = await pool.query<UserRow>(
      `insert into users (username) values ($1) returning ${USER_COLUMNS}`,
      [username]
    );

    return fromDbRow(created.rows[0]);
  } catch (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      throw new DuplicateUsername(username);
    }

    throw error;
  }
}

/** Every account, newest first - so testing has something to pick from. */
export async function list(): Promise<User[]> {
  const found = await pool.query<UserRow>(
    `select ${USER_COLUMNS} from users order by created_at desc`
  );

  return found.rows.map(fromDbRow);
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

/** Deletes one account, and reports whether there was one to delete. */
export async function remove(id: string): Promise<boolean> {
  if (!UUID.test(id)) {
    return false;
  }

  const deleted = await pool.query(`delete from users where id = $1`, [id]);

  return deleted.rowCount === 1;
}
