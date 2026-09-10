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

export async function findByRegion(muscle: string): Promise<Exercise[]> {
  // body_region is stored with underscores ("lower_back"), but people type a
  // space ("lower back"), so match the two forms.
  const region = muscle.replace(/\s+/g, "_");

  const { rows } = await pool.query<ExerciseRow>(
    `select id, name, body_region, description
       from exercises
      where body_region ilike '%' || $1 || '%'`,
    [region]
  );

  return rows.map(toExercise);
}
