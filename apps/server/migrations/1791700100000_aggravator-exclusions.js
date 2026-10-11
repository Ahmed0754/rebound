/**
 * Which exercises to leave out for someone who said a movement makes it worse.
 *
 * THIS TABLE IS THE WEAKEST LINK IN ONBOARDING, AND NO CLINICIAN HAS REVIEWED
 * IT. free-exercise-db has no movement-pattern tags, so turning "stairs hurt"
 * into "leave these out" is a judgement call made by people who are not
 * physiotherapists. It is a table, like `region_muscles`, so that one can
 * correct it without a deploy - and it is the first thing to put in front of
 * one.
 *
 * A row excludes either one named exercise (`exercise_id`), or every exercise
 * matching all of its non-null pattern columns. Matching on muscle alone was
 * tried and is too blunt: "stairs" excluding every quadriceps exercise would
 * also take the quad stretches out of a knee plan, which is the opposite of
 * what someone with stair pain needs.
 *
 * `sitting` has no rows on purpose. Pain on sitting usually means flexion
 * intolerance, and nothing in this dataset says which exercises flex the spine
 * well enough to write a pattern for it.
 *
 * Same RLS shape as `region_muscles`: world-readable, no write policy.
 */

// [aggravator, { exercise_id } | { muscle, force, mechanic, category }]
const ROWS = [
  // Loaded knee extension: squats, lunges, step-ups, leg press.
  ["stairs", { muscle: "quadriceps", force: "push", category: "strength" }],

  // Pressing and raising the arm: overhead presses, lateral and front raises.
  ["overhead", { muscle: "shoulders", force: "push", category: "strength" }],

  // Plyometrics never reach the catalogue (see scripts/seed.ts), so only the
  // jumping and sprinting that the dataset files under strength are left.
  ["impact", { exercise_id: "Freehand_Jump_Squat" }],
  ["impact", { exercise_id: "Weighted_Jump_Squat" }],
  ["impact", { exercise_id: "Frog_Hops" }],
  ["impact", { exercise_id: "Lunge_Sprint" }],
  ["impact", { exercise_id: "Wind_Sprints" }],

  // Bending forward under load: deadlifts, good mornings, back extensions,
  // and the clean family.
  ["loaded_flexion", { muscle: "lower back", category: "strength" }],
  ["loaded_flexion", { muscle: "hamstrings", force: "pull", mechanic: "compound", category: "strength" }],
];

// Every value here is a literal this file wrote, never user input - same
// doubling as in the region_muscles migration.
const quote = (value) => (value === undefined ? "null" : `'${value.replace(/'/g, "''")}'`);

export const up = (pgm) => {
  pgm.createTable("aggravator_exclusions", {
    id: { type: "integer", primaryKey: true, sequenceGenerated: { precedence: "ALWAYS" } },
    aggravator: { type: "text", notNull: true },
    exercise_id: { type: "text" },
    muscle: { type: "text" },
    force: { type: "text" },
    mechanic: { type: "text" },
    category: { type: "text" },
  });

  // A row with every column null would match every exercise and empty every
  // plan for anyone who ticked that aggravator.
  pgm.addConstraint("aggravator_exclusions", "aggravator_exclusions_not_blank", {
    check: "num_nonnulls(exercise_id, muscle, force, mechanic, category) > 0",
  });

  pgm.createIndex("aggravator_exclusions", "aggravator");

  pgm.sql(`alter table aggravator_exclusions enable row level security`);

  pgm.sql(`
    create policy "aggravator_exclusions are publicly readable"
      on aggravator_exclusions for select
      to anon, authenticated
      using (true)
  `);

  const values = ROWS.map(
    ([aggravator, row]) =>
      `(${[aggravator, row.exercise_id, row.muscle, row.force, row.mechanic, row.category]
        .map(quote)
        .join(", ")})`
  ).join(",\n    ");

  pgm.sql(`
    insert into aggravator_exclusions
      (aggravator, exercise_id, muscle, force, mechanic, category)
    values
    ${values}
  `);
};

export const down = (pgm) => {
  pgm.sql(`drop policy if exists "aggravator_exclusions are publicly readable" on aggravator_exclusions`);
  pgm.dropTable("aggravator_exclusions");
};
