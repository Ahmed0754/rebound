/**
 * Loads the exercise catalogue from the committed free-exercise-db snapshot.
 * Schema is owned by migrations, not by this script. Re-runnable: it replaces
 * all rows rather than appending.
 *
 * The snapshot is a file in git, not an API call, so this is offline and
 * deterministic - the same rows on every machine and in CI. Refreshing it is a
 * manual `curl` of the source below, reviewed as a normal diff:
 *
 *   https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json
 */
import { pool } from "../src/models/db.js";
import catalogue from "../data/exercises.json" with { type: "json" };

type SourceExercise = {
  id: string;
  name: string;
  primaryMuscles: string[];
  instructions: string[];
  category: string;
  level: string;
};

// The dataset is a general gym catalogue. Olympic lifting, strongman and
// powerlifting are competition movements that nobody should meet while
// working around an injury, so they never enter the library at all.
const KEEP_CATEGORIES = ["strength", "stretching"];

async function main() {
  const rows: SourceExercise[] = [];

  for (const exercise of catalogue as SourceExercise[]) {
    if (!KEEP_CATEGORIES.includes(exercise.category)) {
      continue;
    }

    // A row with no muscles can never match a body region, and one with no
    // instructions has nothing to show the user.
    if (exercise.primaryMuscles.length === 0 || exercise.instructions.length === 0) {
      continue;
    }

    rows.push(exercise);
  }

  await pool.query("delete from exercises");

  // One INSERT with unnested arrays, rather than one round trip per row.
  // text[][] is passed as a json array of arrays: unnest cannot take a
  // two-dimensional array and give back one row per inner array.
  await pool.query(
    `insert into exercises (id, name, primary_muscles, instructions, category, level)
     select id, name, primary_muscles, instructions, category, level
       from jsonb_to_recordset($1::jsonb)
         as t(id text, name text, primary_muscles text[],
              instructions text[], category text, level text)`,
    [
      JSON.stringify(
        rows.map((e) => ({
          id: e.id,
          name: e.name,
          primary_muscles: e.primaryMuscles,
          instructions: e.instructions,
          category: e.category,
          level: e.level,
        }))
      ),
    ]
  );

  const { rows: counted } = await pool.query<{ count: string }>(
    "select count(*) from exercises"
  );
  console.log(`Seeded ${counted[0].count} exercises from free-exercise-db.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
