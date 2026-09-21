//This is the model for Data
//The exercise type, SQL query

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
  body_region: string;
  description: string;
};

// Postgres columns are snake_case; the rest of the app uses camelCase.
// Translating here means no other file ever sees `body_region`.
function toExercise(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    bodyRegion: row.body_region,
    description: row.description,
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
  const regionResult = await pool.query<{ body_region: string }>(
    "select distinct body_region from exercises"
  );

  // matchRegion compares plain strings, so pull the names out of the rows.
  const regions: string[] = [];

  for (const row of regionResult.rows) {
    regions.push(row.body_region);
  }

  const region = matchRegion(muscle, regions);

  if (region === null) {
    return [];
  }

  // An exact match on a region name we just read back out of the table, so
  // nothing the user typed reaches the query as a pattern.
  const exerciseResult = await pool.query<ExerciseRow>(
    `select id, name, body_region, description
       from exercises
      where body_region = $1`,
    [region]
  );

  const exercises: Exercise[] = [];

  for (const row of exerciseResult.rows) {
    exercises.push(toExercise(row));
  }

  return exercises;
}
