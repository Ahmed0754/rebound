import pg from "pg";

const connectionString = process.env.DATABASE_URL;

// Privileged connection: owns the tables, bypasses RLS entirely. Migrations,
// seed scripts, and admin tooling use this. Live request handling must not —
// see restrictedPool below.
export const pool = new pg.Pool({
  connectionString,
  // Supabase terminates TLS with a certificate this client does not have the
  // chain for; the connection is still encrypted.
  ssl: { rejectUnauthorized: false },
});

// Restricted connection: connects as `rebound_restricted`, which owns nothing
// and therefore cannot bypass RLS. Every query on this pool must run inside a
// transaction that does `SET LOCAL app.user_id = '<uuid>'` first — that GUC is
// what the RLS policies from migration 1756828800000 check. Undefined until
// RESTRICTED_DATABASE_URL is set (Phase F's withSession is what will use this
// for real; until then only the isolation test exercises it).
export const restrictedPool = process.env.RESTRICTED_DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.RESTRICTED_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : undefined;

export type ExerciseRow = {
  id: string;
  name: string;
  body_region: string;
  description: string;
};
