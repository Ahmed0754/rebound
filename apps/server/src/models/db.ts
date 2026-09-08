import pg from "pg";

// One connection pool, shared by the request handler and the seed script.
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // Supabase terminates TLS with a certificate this client does not have the
  // chain for; the connection is still encrypted.
  ssl: { rejectUnauthorized: false },
});
