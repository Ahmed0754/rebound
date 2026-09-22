// This file talks to the database. It turns whatever body part the user typed
// (like "my knees hurt") into a real match in the database, then fetches every
// exercise stored for that body part.

import { pool } from "./db.js";

// The shape used everywhere else in the app.
export type Exercise = {
  id: string;
  name: string;
  bodyRegion: string;
  description: string;
};

// The shape the row actually comes back as from Postgres.
type ExerciseRow = {
  id: string;
  name: string;
  body_region: string;
  description: string;
};

// Postgres uses snake_case column names (body_region); the rest of the app
// uses camelCase (bodyRegion). This is the one place that converts between them.
function toExercise(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    bodyRegion: row.body_region,
    description: row.description,
  };
}

// Breaks a sentence down into a clean list of words so it can be compared.
// Example: "My knees hurt!" becomes ["my", "knee", "hurt"].
// - punctuation is removed
// - underscores (like in "lower_back") become spaces
// - a trailing "s" is dropped so "knees" matches "knee" (but "abs" stays "abs")
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

// Checks whether the words in "needle" appear together, in order, inside "haystack".
// This is what lets a two-word region like "lower back" get matched as one phrase.
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

// Figures out which stored body region the user meant, or null if none match.
// First tries to match the full region name (e.g. "lower back"), and only
// falls back to matching just one word if nothing matched fully.
export function matchRegion(muscle: string, regions: string[]): string | null {
  const spoken = words(muscle);

  if (spoken.length === 0) {
    return null;
  }

  // First pass: try to match a region's full name. Keep the longest match, so
  // "lower_back" wins over "back" when both fit.
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

// Main function: takes what the user typed and returns the matching exercises.
export async function findByRegion(muscle: string): Promise<Exercise[]> {
  // First, get the list of body regions that actually exist in the database.
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

  // Fetch every exercise for that region. The region value is passed in
  // safely as a parameter ($1) rather than pasted into the query string.
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
