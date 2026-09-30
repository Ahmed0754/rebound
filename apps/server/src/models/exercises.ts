// The model for the exercise catalogue: the Exercise type, the body-region
// mapping (read from `region_muscles` and cached), and the queries that read
// exercises by region or by id.

import { pool } from "./db.js";

export type Exercise = {
  id: string;
  name: string;
  description: string;
};

type ExerciseRow = {
  id: string;
  name: string;
  instructions: string[];
};

type RegionMuscles = Record<string, string[]>;

type RegionRow = {
  region: string;
  muscles: string[];
};

/**
 * The body regions this app accepts, and the muscles worth training for each.
 *
 * No exercise catalogue ships this mapping. Every one of them indexes by the
 * muscle a movement trains, because they are built for people planning
 * workouts. We are asked about the joint that hurts, so "knee" has to be
 * translated into the muscles around it before the library can be searched.
 *
 * These are plausible groupings, not clinically reviewed ones. A real version
 * of this is authored with a physiotherapist - which is also why this lives in
 * `region_muscles` rather than in source: editing it should not require a
 * deploy.
 *
 * Read once per process and kept here after that. The mapping changes by
 * someone editing a table, not by a request, so there is nothing a later call
 * could see that this one missed. The promise itself is the cache: two
 * requests landing before the first query returns share it instead of firing
 * one each.
 */
let regionMusclesPromise: Promise<RegionMuscles> | null = null;

function getRegionMuscles(): Promise<RegionMuscles> {
  if (regionMusclesPromise === null) {
    regionMusclesPromise = pool
      .query<RegionRow>(`select region, muscles from region_muscles`)
      .then((result) => Object.fromEntries(result.rows.map((row) => [row.region, row.muscles])));
  }

  return regionMusclesPromise;
}

// The catalogue stores instructions as steps; the rest of the app wants one
// string. Joining here means no other file ever sees the array.
function fromDbRow(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    description: row.instructions.join(" "),
  };
}

/**
 * Picks the body region the user meant, or null when nothing fits.
 *
 * "my knees hurt" finds "knee" and "lower_back pain" finds "lower back", while
 * "lower leg" finds nothing rather than guessing. Matching is on whole words,
 * so "hip" is not found inside "ship". Irregular plurals are not handled:
 * "calves" finds nothing.
 */
function matchRegion(text: string, regionMuscles: RegionMuscles): string | null {
  const words = text
    .toLowerCase()
    // Anything that is not a letter becomes a gap, which also disarms `%`,
    // `_` and the rest before the value is ever used.
    .replace(/[^a-z]+/g, " ")
    .trim()
    .split(" ")
    // "knees" and "knee" should be the same word. Short words keep their "s",
    // so "abs" does not become "ab".
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word));

  // Padded so a region only matches whole words: " hip " is not in " ship ".
  const padded = ` ${words.join(" ")} `;
  let best: string | null = null;
  let bestAt = Infinity;

  // When two regions are named, the one mentioned first wins: someone typing
  // "knee and shoulder" is asking about the knee.
  for (const region of Object.keys(regionMuscles)) {
    const at = padded.indexOf(` ${region} `);

    if (at !== -1 && at < bestAt) {
      best = region;
      bestAt = at;
    }
  }

  return best;
}

/**
 * The exercises worth offering for what the user typed, with the region they
 * were matched for. Null when the text names no region this app knows.
 */
export async function getByRegion(
  muscle: string
): Promise<{ region: string; exercises: Exercise[] } | null> {
  // Cached after the first call in this process - see `getRegionMuscles`.
  const regionMuscles = await getRegionMuscles();
  const region = matchRegion(muscle, regionMuscles);

  if (region === null) {
    return null;
  }

  // `&&` is array overlap: keep a row if any muscle it trains is one this
  // region cares about. The muscle names come from `region_muscles`, not from
  // the user, so nothing typed reaches the query as a pattern.
  //
  // The 20 are picked at random because nothing here knows which exercises
  // suit this particular person - there is no onboarding yet, so no injury
  // detail to rank on. Random at least varies what gets offered instead of
  // always sending the same rows. Replacing this with a real ranking is the
  // point of the planned judge step, once onboarding exists to feed it.
  //
  // Not cached, unlike the mapping above: caching this result would mean
  // every request for "knee" gets the same 20 rows back forever, which is the
  // one thing `order by random()` exists to avoid.
  const result = await pool.query<ExerciseRow>(
    `select id, name, instructions
       from exercises
      where primary_muscles && $1
      order by random()
      limit 20`,
    [regionMuscles[region]]
  );

  return { region, exercises: result.rows.map(fromDbRow) };
}


// Rows this process has already read, keyed by id. The only writer of
// `exercises` is the offline seed script, never a request, so an id answered
// once needs no second round trip for the rest of the process's life - a
// reseed is picked up on the next restart, same as `getRegionMuscles`.
const exerciseCache = new Map<string, Exercise>();

/**
 * The catalogue rows for `ids`, keyed by id.
 *
 * An id that matches nothing is simply absent from the map rather than an
 * error here: only the caller knows whether a miss is a bad request or an
 * exercise that a re-seed has since dropped.
 */
export async function getByIds(ids: string[]): Promise<Map<string, Exercise>> {
  const found = new Map<string, Exercise>();
  const missing: string[] = [];

  for (const id of ids) {
    const cached = exerciseCache.get(id);

    if (cached === undefined) {
      missing.push(id);
    } else {
      found.set(id, cached);
    }
  }

  // `= any('{}')` is a valid query that matches nothing, but there is no
  // reason to spend a round trip discovering that - including when every id
  // asked for was already cached.
  if (missing.length === 0) {
    return found;
  }

  const result = await pool.query<ExerciseRow>(
    `select id, name, instructions
       from exercises
      where id = any($1)`,
    [missing]
  );

  for (const row of result.rows) {
    const exercise = fromDbRow(row);
    exerciseCache.set(row.id, exercise);
    found.set(row.id, exercise);
  }

  return found;
}

//data exists in the database
//any resuable data retrive from db should be casched to avoid repeated queries
//migrate data from here to supabase (CONST REGION_MUSCLES)
