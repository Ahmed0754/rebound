//This is the model for Data
//The exercise type, the body-region mapping, and the SQL query

import { pool } from "./db.js";

export type Exercise = {
  id: string;
  name: string;
  bodyRegion: string;
  description: string;
};

type ExerciseRow = {
  id: string;
  name: string;
  instructions: string[];
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
 * of this is authored with a physiotherapist.
 */
const REGION_MUSCLES: Record<string, string[]> = {
  knee: ["quadriceps", "hamstrings", "glutes", "calves"],
  hip: ["glutes", "abductors", "adductors", "quadriceps"],
  hamstring: ["hamstrings", "glutes"],
  calf: ["calves"],
  ankle: ["calves"],
  "lower back": ["lower back", "abdominals", "glutes"],
  shoulder: ["shoulders", "traps"],
  neck: ["neck", "traps"],
  elbow: ["biceps", "triceps", "forearms"],
  wrist: ["forearms"],
};

// The catalogue stores instructions as steps; the rest of the app wants one
// string. Joining here means no other file ever sees the array.
function toExercise(row: ExerciseRow, bodyRegion: string): Exercise {
  return {
    id: row.id,
    name: row.name,
    bodyRegion,
    description: row.instructions.join(" "),
  };
}

// Splits free text into comparable words: "My knees hurt!" -> ["my", "knee",
// "hurt"]. Punctuation goes (which is also what disarms `%` and `_`), stored
// regions lose their underscores, and a trailing plural "s" is dropped so
// "knees" and "knee" are the same word. Short words keep their "s": "abs" is
// not "ab".
function words(text: string): string[] {
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z\s_]/g, " ")
    .replace(/_/g, " ");

  const pieces = cleaned.split(/\s+/);
  const result: string[] = [];

  for (const piece of pieces) {
    // Splitting can leave empty strings at either end, so skip those.
    if (piece === "") {
      continue;
    }

    if (piece.length > 3 && piece.endsWith("s")) {
      result.push(piece.slice(0, -1));
    } else {
      result.push(piece);
    }
  }

  return result;
}

// True when `needle` appears in `haystack` as consecutive whole words.
function containsInOrder(haystack: string[], needle: string[]): boolean {
  // Try every position in `haystack` where `needle` would still fit.
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    let allMatch = true;

    // Compare the needle's words against the haystack's, starting at i.
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        allMatch = false;
        break;
      }
    }

    if (allMatch) {
      return true;
    }
  }

  return false;
}

/**
 * Picks the body region the user meant, or null if nothing fits.
 *
 * Matching is on whole words, so "my knees hurt" finds "knee" and "lower back
 * pain" finds "lower_back", while a stray "e" finds nothing. A region's full
 * name wins over one of its parts, so a two-word region is only reached by a
 * single word ("back") when nothing matched it outright.
 */
export function matchRegion(muscle: string, regions: string[]): string | null {
  const spoken = words(muscle);

  if (spoken.length === 0) {
    return null;
  }

  // First pass: a region whose whole name appears in what they said. Keep the
  // longest match, so "lower_back" wins over "back" when both fit.
  let best: string | null = null;
  let bestLength = 0;

  for (const region of regions) {
    const regionWords = words(region);

    if (containsInOrder(spoken, regionWords) && regionWords.length > bestLength) {
      best = region;
      bestLength = regionWords.length;
    }
  }

  if (best !== null) {
    return best;
  }

  // Second pass: nothing matched outright, so settle for the first region that
  // shares any single word with what they said.
  for (const region of regions) {
    for (const word of words(region)) {
      if (spoken.includes(word)) {
        return region;
      }
    }
  }

  return null;
}

export async function findByRegion(muscle: string): Promise<Exercise[]> {
  // The regions are a constant now, so picking one costs no database round trip.
  const region = matchRegion(muscle, Object.keys(REGION_MUSCLES));

  if (region === null) {
    return [];
  }

  // `&&` is array overlap: keep a row if any muscle it trains is one this
  // region cares about. The muscle names come from REGION_MUSCLES, not from
  // the user, so nothing typed reaches the query as a pattern.
  //
  // The 20 are picked at random because nothing here knows which exercises
  // suit this particular person - there is no onboarding yet, so no injury
  // detail to rank on. Random at least varies what gets offered instead of
  // always sending the same rows. Replacing this with a real ranking is the
  // point of the planned judge step, once onboarding exists to feed it.
  const exerciseResult = await pool.query<ExerciseRow>(
    `select id, name, instructions
       from exercises
      where primary_muscles && $1
      order by random()
      limit 20`,
    [REGION_MUSCLES[region]]
  );

  const exercises: Exercise[] = [];

  for (const row of exerciseResult.rows) {
    exercises.push(toExercise(row, region));
  }

  return exercises;
}
