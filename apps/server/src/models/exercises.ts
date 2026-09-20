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
  return text
    .toLowerCase()
    .replace(/[^a-z\s_]/g, " ")
    .replace(/_/g, " ")
    .split(/\s+/)
    .filter((word) => word !== "")
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word));
}

// True when `needle` appears in `haystack` as consecutive whole words.
function containsInOrder(haystack: string[], needle: string[]): boolean {
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((word, j) => haystack[i + j] === word)) {
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

  const whole = regions.filter((region) => containsInOrder(spoken, words(region)));

  if (whole.length > 0) {
    return whole.sort((a, b) => words(b).length - words(a).length)[0];
  }

  const partial = regions.filter((region) => words(region).some((word) => spoken.includes(word)));

  return partial[0] ?? null;
}

export async function findByRegion(muscle: string): Promise<Exercise[]> {
  const { rows: regionRows } = await pool.query<{ body_region: string }>(
    "select distinct body_region from exercises"
  );

  const region = matchRegion(muscle, regionRows.map((row) => row.body_region));

  if (region === null) {
    return [];
  }

  // An exact match on a region name we just read back out of the table, so
  // nothing the user typed reaches the query as a pattern.
  const { rows } = await pool.query<ExerciseRow>(
    `select id, name, body_region, description
       from exercises
      where body_region = $1`,
    [region]
  );

  return rows.map(toExercise);
}
