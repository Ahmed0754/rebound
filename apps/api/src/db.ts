import pg from "pg";

const connectionString = process.env.DATABASE_URL;

export const pool = new pg.Pool({
  connectionString,
  // Supabase terminates TLS with a certificate this client does not have the
  // chain for; the connection is still encrypted.
  ssl: { rejectUnauthorized: false },
});

export type ExerciseRow = {
  id: string;
  name: string;
  body_region: string;
  description: string;
};
