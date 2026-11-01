/**
 * Real accounts: a password per user, and a table of the sessions logging in
 * creates. Replaces the trusted `X-User-Id` header of ADR 0014.
 *
 * `password_hash` is an scrypt hash with its own salt (see src/auth.ts), never
 * the password. It is nullable because the test accounts made before this
 * have no password and nobody can set one for them; they simply cannot log
 * in. Deleting them is left to whoever owns them, since this database is
 * shared.
 *
 * A session row holds a SHA-256 of the token, not the token: someone who can
 * read this table still cannot act as anyone. Deleting an account deletes its
 * sessions, so a deleted account is logged out everywhere at once.
 *
 * RLS enabled with no policy, for the same reason as `users`: Supabase serves
 * every table in `public` over its HTTP API, and the API server connects as
 * the owner, which bypasses RLS.
 */

export const up = (pgm) => {
  pgm.addColumns("users", {
    password_hash: { type: "text" },
  });

  pgm.createTable("sessions", {
    token_hash: { type: "text", primaryKey: true },
    user_id: {
      type: "uuid",
      notNull: true,
      references: "users",
      onDelete: "CASCADE",
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    expires_at: { type: "timestamptz", notNull: true },
  });

  pgm.createIndex("sessions", "user_id");

  pgm.sql(`alter table sessions enable row level security`);
};

export const down = (pgm) => {
  pgm.dropTable("sessions");
  pgm.dropColumns("users", ["password_hash"]);
};
