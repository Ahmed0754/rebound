/**
 * Creates the one table this app uses: `exercises`.
 *
 * RLS is enabled with a read-only policy. Supabase exposes every table in the
 * `public` schema over its HTTP API, so a table with RLS switched off is
 * readable by anyone holding the project's anon key. Reads of the exercise
 * library are meant to be public; writes are not, and no write policy exists,
 * so only the table owner (the seed script) can change rows.
 */

export const up = (pgm) => {
  pgm.createTable("exercises", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    name: { type: "text", notNull: true },
    body_region: { type: "text", notNull: true },
    description: { type: "text", notNull: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.createIndex("exercises", "body_region");

  pgm.sql(`alter table exercises enable row level security`);

  // Shared library content: world-readable, writable only by the table owner
  // (which bypasses RLS). No insert/update/delete policy exists, so anon and
  // authenticated cannot write.
  pgm.sql(`
    create policy "exercises are publicly readable"
      on exercises for select
      to anon, authenticated
      using (true)
  `);
};

export const down = (pgm) => {
  pgm.sql(`drop policy if exists "exercises are publicly readable" on exercises`);
  pgm.dropTable("exercises");
};
