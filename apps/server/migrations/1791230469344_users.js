/**
 * The account a regime will eventually belong to. No password and no session
 * table: this is not authentication, and identity is trusted as sent - see
 * ACCOUNTS.md. Regimes are not yet linked to a user; this migration only
 * creates the accounts themselves.
 *
 * RLS enabled with no policy at all, which denies everything to `anon` and
 * `authenticated`. Supabase publishes every table in `public` over its HTTP
 * API, so without this anyone holding the project's anon key could read and
 * write accounts. The API server connects as the table owner, which bypasses
 * RLS, so it is unaffected.
 */

export const up = (pgm) => {
  pgm.createTable("users", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    username: { type: "text", notNull: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  // Unique on the lowercased name, not on the column: otherwise "Sam" and
  // "sam" are two accounts nobody can tell apart. Queries must match this
  // expression - `where lower(username) = lower($1)` - or they will not use
  // the index.
  pgm.sql(`create unique index users_username_lower on users (lower(username))`);

  pgm.sql(`alter table users enable row level security`);
};

export const down = (pgm) => {
  pgm.dropTable("users");
};
