import pg from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
}

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
