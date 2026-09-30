/**
 * Moves the body-region-to-muscle mapping out of the `REGION_MUSCLES` constant
 * in `models/exercises.ts` and into its own table.
 *
 * That constant was source code: changing which muscles "knee" maps to meant
 * editing a `.ts` file and shipping a deploy. The mapping is not exercise data
 * and nobody claims it is clinically reviewed - see the comment that used to
 * sit above it - so it is exactly the kind of thing a physiotherapist should
 * eventually be able to edit without touching the app's code. A table is the
 * first step toward that, even before anything writes to it but this seed.
 *
 * Same RLS shape as `exercises`: world-readable, no write policy, so only the
 * table owner (migrations, for now) can change it.
 */

const REGIONS = [
  ["knee", ["quadriceps", "hamstrings", "glutes", "calves"]],
  ["hip", ["glutes", "abductors", "adductors", "quadriceps"]],
  ["hamstring", ["hamstrings", "glutes"]],
  ["calf", ["calves"]],
  ["ankle", ["calves"]],
  ["lower back", ["lower back", "abdominals", "glutes"]],
  ["shoulder", ["shoulders", "traps"]],
  ["neck", ["neck", "traps"]],
  ["elbow", ["biceps", "triceps", "forearms"]],
  ["wrist", ["forearms"]],
];

// Every value here is a literal this file wrote, never user input, but a
// region name with a stray apostrophe would still break an inlined string -
// this is the same doubling Postgres itself uses to escape one.
const quote = (value) => `'${value.replace(/'/g, "''")}'`;

export const up = (pgm) => {
  pgm.createTable("region_muscles", {
    region: { type: "text", primaryKey: true },
    muscles: { type: "text[]", notNull: true },
  });

  pgm.sql(`alter table region_muscles enable row level security`);

  pgm.sql(`
    create policy "region_muscles are publicly readable"
      on region_muscles for select
      to anon, authenticated
      using (true)
  `);

  const rows = REGIONS.map(
    ([region, muscles]) =>
      `(${quote(region)}, array[${muscles.map(quote).join(", ")}]::text[])`
  ).join(",\n    ");

  pgm.sql(`insert into region_muscles (region, muscles) values\n    ${rows}`);
};

export const down = (pgm) => {
  pgm.sql(`drop policy if exists "region_muscles are publicly readable" on region_muscles`);
  pgm.dropTable("region_muscles");
};
