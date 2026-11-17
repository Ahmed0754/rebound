// The model for finished workouts: one per plan per day. Only ever called for
// a plan the controller has already found for its owner, as with check-ins.

import { pool } from "./db.js";

// One exercise as it was done: every set at the plan's dose that day.
export type DoneExercise = {
  id: string;
  name: string;
  unit: "reps" | "hold";
  sets: number;
  reps: number | null;
  holdSeconds: number | null;
};

export type Workout = {
  // The person's own date, "2026-11-17".
  day: string;
  completedAt: string;
  exercises: DoneExercise[];
};

type WorkoutRow = { day: string; completed_at: Date; exercises: DoneExercise[] };

// `day` as text, for the same reason as in models/checkins.ts.
const COLUMNS = "to_char(day, 'YYYY-MM-DD') as day, completed_at, exercises";

function fromDbRow(row: WorkoutRow): Workout {
  return { day: row.day, completedAt: row.completed_at.toISOString(), exercises: row.exercises };
}

/** A plan's finished workouts, newest first. */
export async function list(regimeId: string): Promise<Workout[]> {
  const found = await pool.query<WorkoutRow>(
    `select ${COLUMNS} from workout_sessions where regime_id = $1 order by day desc`,
    [regimeId]
  );

  return found.rows.map(fromDbRow);
}

/**
 * Records `day`'s workout as done. Finishing a second time the same day keeps
 * the first record, so sending it twice is harmless; the record is returned
 * either way.
 */
export async function complete(input: {
  regimeId: string;
  userId: string;
  day: string;
  exercises: DoneExercise[];
}): Promise<Workout> {
  const inserted = await pool.query<WorkoutRow>(
    `insert into workout_sessions (regime_id, user_id, day, exercises)
     values ($1, $2, $3, $4)
     on conflict (regime_id, day) do nothing
     returning ${COLUMNS}`,
    [input.regimeId, input.userId, input.day, JSON.stringify(input.exercises)]
  );

  if (inserted.rows.length > 0) {
    return fromDbRow(inserted.rows[0]);
  }

  const existing = await pool.query<WorkoutRow>(
    `select ${COLUMNS} from workout_sessions where regime_id = $1 and day = $2`,
    [input.regimeId, input.day]
  );

  return fromDbRow(existing.rows[0]);
}
