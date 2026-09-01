/**
 * Initial schema. Captures the `exercises` table that previously lived in
 * db/schema.sql and was applied by a drop-and-reseed script.
 *
 * RLS is enabled here, not left off. Supabase exposes tables in the `public`
 * schema through PostgREST, and a table without RLS is reachable with the
 * project's anon key regardless of what application code does. v1 shipped seven
 * tables exposed exactly this way. Shared-library tables get RLS *on* with a
 * permissive read policy — never RLS off.
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
