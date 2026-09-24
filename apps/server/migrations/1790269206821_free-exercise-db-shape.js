/**
 * Reshapes `exercises` to match free-exercise-db, the public-domain dataset
 * that replaces the 30 hand-written mock rows.
 *
 * The old shape stored one `body_region` per row, because we wrote those rows
 * ourselves. Real exercise data has no such column: every catalogue on the
 * market indexes by the muscle a movement trains, not by the joint that hurts.
 * The injury-site mapping now lives in `REGION_MUSCLES` in `models/exercises.ts`,
 * so this table holds only what the dataset actually ships.
 *
 * The table is dropped and recreated rather than altered: every column changes,
 * the primary key changes from a generated uuid to the dataset's own slug, and
 * no row in it is worth preserving.
 */

export const up = (pgm) => {
  pgm.sql(`drop policy if exists "exercises are publicly readable" on exercises`);
  pgm.dropTable("exercises");

  pgm.createTable("exercises", {
    // The dataset's own slug, e.g. "3_4_Sit-Up". Using it as the key makes
    // re-seeding idempotent without a lookup, and it is also the image path.
    id: { type: "text", primaryKey: true },
    name: { type: "text", notNull: true },
    // What the movement trains. This is what a body region is matched against.
    primary_muscles: { type: "text[]", notNull: true },
    // Kept as the dataset's steps rather than one blob, so the UI can render
    // them as a numbered list later without re-splitting a string.
    instructions: { type: "text[]", notNull: true },
    // "strength" | "stretching" | "plyometrics" | "powerlifting" | ...
    category: { type: "text", notNull: true },
    // "beginner" | "intermediate" | "expert". Lifting difficulty, NOT a
    // clinical safety rating - nothing in this dataset knows about injuries.
    level: { type: "text", notNull: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  // Every regime query filters on muscle overlap, and GIN is the index type
  // that can answer the array-overlap operator (&&).
  pgm.createIndex("exercises", "primary_muscles", { method: "gin" });

  pgm.sql(`alter table exercises enable row level security`);

  // Unchanged from the initial schema: shared library content is world-readable,
  // and with no write policy only the table owner (the seed script) can change it.
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

  pgm.createTable("exercises", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    name: { type: "text", notNull: true },
    body_region: { type: "text", notNull: true },
    description: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createIndex("exercises", "body_region");

  pgm.sql(`alter table exercises enable row level security`);
  pgm.sql(`
    create policy "exercises are publicly readable"
      on exercises for select
      to anon, authenticated
      using (true)
  `);
};
