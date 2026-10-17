// The model for the exercise catalogue: the Exercise type, the body-region
// mapping (read from `region_muscles` and cached), and the queries that read
// exercises by region or by id.

import { pool } from "./db.js";
import type { Unit } from "../types/index.js";

export type Exercise = {
  id: string;
  name: string;
  description: string;
  // How it is dosed - see `unitOf`.
  unit: Unit;
};

type ExerciseRow = {
  id: string;
  name: string;
  instructions: string[];
  force: string | null;
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

/**
 * The body regions this app accepts, sorted.
 *
 * Exposed so a client can offer them as a fixed set of choices instead of a
 * text box, which is the difference between picking "lower back" and typing
 * "spleen" and finding out a request later. Sorted here because the query has
 * no `order by` - the mapping is keyed by region, so nothing else cares.
 *
 * The muscles each region maps to are deliberately not returned: which
 * muscles "knee" means is this server's business.
 */
export async function listRegions(): Promise<string[]> {
  return Object.keys(await getRegionMuscles()).sort();
}

/**
 * Reps or a hold, from the catalogue's own `force` tag: a `static` exercise is
 * a position you hold (a calf stretch, a plank), anything else is repeated.
 *
 * Decided here, from data, so the model never chooses it and cannot get it
 * wrong. The tag is not perfect - "90/90 Hamstring" is a held stretch tagged
 * `push` - and an override list for the known misses is the fix when one
 * matters.
 */
function unitOf(force: string | null): Unit {
  return force === "static" ? "hold" : "reps";
}

// The catalogue stores instructions as steps; the rest of the app wants one
// string. Joining here means no other file ever sees the array. One step per
// line, so a client can still show them as numbered steps.
function fromDbRow(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    description: row.instructions.join("\n"),
    unit: unitOf(row.force),
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
  // suit this particular person - this is the type-a-body-part path, with no
  // questionnaire behind it. Random at least varies what gets offered instead
  // of always sending the same rows. A plan built from onboarding answers
  // goes through `getCandidates` below instead.
  //
  // Not cached, unlike the mapping above: caching this result would mean
  // every request for "knee" gets the same 20 rows back forever, which is the
  // one thing `order by random()` exists to avoid.
  const result = await pool.query<ExerciseRow>(
    `select id, name, instructions, force
       from exercises
      where primary_muscles && $1
      order by random()
      limit 20`,
    [regionMuscles[region]]
  );

  return { region, exercises: result.rows.map(fromDbRow) };
}

/** An exercise with the catalogue fields the candidate filters were applied to. */
export type Candidate = Exercise & {
  primaryMuscles: string[];
  category: string;
  level: string;
  equipment: string | null;
  force: string | null;
  mechanic: string | null;
};

type CandidateRow = ExerciseRow & {
  primary_muscles: string[];
  category: string;
  level: string;
  equipment: string | null;
  mechanic: string | null;
};

// The questionnaire's filters, one fragment each, shared by `getCandidates`
// and `countCandidates` so the counts can never describe a different filter
// from the one that picks. Parameters are always $1 muscles, $2 equipment,
// $3 levels, $4 categories, $5 aggravators.
//
// A blank `equipment` in the catalogue counts as "body only" - 77 rows leave
// it out, and nearly all of them are bodyweight stretches. Reading blank as
// "needs something" instead would take half the stretches away from someone
// who owns nothing.
//
// An exclusion row matches when every pattern column it fills in matches. A
// null on the exercise side never matches a filled-in pattern, so an exercise
// the dataset left `force` blank on is not excluded by a `force` rule - the
// catalogue gives no grounds to say it pushes or pulls.
const IN_REGION = "e.primary_muscles && $1";
const HAS_EQUIPMENT = "coalesce(e.equipment, 'body only') = any($2)";
const AT_LEVEL = "e.level = any($3)";
const IN_CATEGORY = "e.category = any($4)";
const NOT_AGGRAVATING = `not exists (
          select 1
            from aggravator_exclusions x
           where x.aggravator = any($5)
             and (x.exercise_id is null or x.exercise_id = e.id)
             and (x.muscle is null or x.muscle = any(e.primary_muscles))
             and (x.force is null or x.force = e.force)
             and (x.mechanic is null or x.mechanic = e.mechanic)
             and (x.category is null or x.category = e.category)
        )`;

type CandidateFilters = {
  region: string;
  equipment: string[];
  levels: string[];
  categories: string[];
  // Matched against `aggravator_exclusions`, which says what each one rules out.
  aggravators: string[];
};

/**
 * How many exercises survive each filter in turn, each count including every
 * filter before it, or null when the region is not one this app knows.
 *
 * For showing someone how their answers narrowed the catalogue down. One
 * pass over the table rather than a query per stage.
 */
export async function countCandidates(options: CandidateFilters): Promise<{
  catalogue: number;
  region: number;
  equipment: number;
  level: number;
  category: number;
  aggravators: number;
} | null> {
  const regionMuscles = await getRegionMuscles();
  const muscles = regionMuscles[options.region];

  if (muscles === undefined) {
    return null;
  }

  const result = await pool.query(
    `with f as (
       select ${IN_REGION} as r,
              ${HAS_EQUIPMENT} as eq,
              ${AT_LEVEL} as lv,
              ${IN_CATEGORY} as cat,
              ${NOT_AGGRAVATING} as agg
         from exercises e
     )
     select count(*)::int as catalogue,
            count(*) filter (where r)::int as region,
            count(*) filter (where r and eq)::int as equipment,
            count(*) filter (where r and eq and lv)::int as level,
            count(*) filter (where r and eq and lv and cat)::int as category,
            count(*) filter (where r and eq and lv and cat and agg)::int as aggravators
       from f`,
    [muscles, options.equipment, options.levels, options.categories, options.aggravators]
  );

  return result.rows[0];
}

/**
 * The exercises a questionnaire allows for `region`, or null when the region
 * is not one this app knows.
 *
 * Every option is in the catalogue's own vocabulary - "dumbbell", not the
 * questionnaire's "dumbbells" - and this file never imports clinical.ts.
 * models/regimes.ts does the translating, so the data layer stays unaware of
 * the rules layer and the rules layer can be read on its own.
 *
 * Still `order by random()`, but now over the right exercises: nothing yet
 * ranks one allowed exercise above another, so random is what keeps the same
 * 20 from coming back every time.
 */
export async function getCandidates(
  options: CandidateFilters & { limit: number }
): Promise<Candidate[] | null> {
  const regionMuscles = await getRegionMuscles();
  const muscles = regionMuscles[options.region];

  if (muscles === undefined) {
    return null;
  }

  const result = await pool.query<CandidateRow>(
    `select e.id, e.name, e.instructions, e.primary_muscles, e.category, e.level,
            e.equipment, e.force, e.mechanic
       from exercises e
      where ${IN_REGION}
        and ${HAS_EQUIPMENT}
        and ${AT_LEVEL}
        and ${IN_CATEGORY}
        and ${NOT_AGGRAVATING}
      order by random()
      limit $6`,
    [
      muscles,
      options.equipment,
      options.levels,
      options.categories,
      options.aggravators,
      options.limit,
    ]
  );

  return result.rows.map((row) => ({
    ...fromDbRow(row),
    primaryMuscles: row.primary_muscles,
    category: row.category,
    level: row.level,
    equipment: row.equipment,
    force: row.force,
    mechanic: row.mechanic,
  }));
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
    `select id, name, instructions, force
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
