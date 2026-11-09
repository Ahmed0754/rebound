// The model for pain check-ins: one per plan per day, listed and saved. Only
// ever called for a plan the controller has already found for its owner, so
// ownership is settled before anything here runs.

import { pool } from "./db.js";

export type CheckIn = {
  // The person's own date, "2026-11-02".
  day: string;
  pain: number;
  didExercises: boolean;
  updatedAt: string;
};

type CheckInRow = {
  day: string;
  pain: number;
  did_exercises: boolean;
  updated_at: Date;
};

// `day` as text: node-postgres turns a `date` into a Date at local midnight,
// which shifts it a day in any timezone behind UTC.
const COLUMNS = "to_char(day, 'YYYY-MM-DD') as day, pain, did_exercises, updated_at";

function fromDbRow(row: CheckInRow): CheckIn {
  return {
    day: row.day,
    pain: row.pain,
    didExercises: row.did_exercises,
    updatedAt: row.updated_at.toISOString(),
  };
}

/** A plan's check-ins, oldest first - the order a graph reads them in. */
export async function list(regimeId: string): Promise<CheckIn[]> {
  const found = await pool.query<CheckInRow>(
    `select ${COLUMNS} from pain_checkins where regime_id = $1 order by day`,
    [regimeId]
  );

  return found.rows.map(fromDbRow);
}

/** Saves a day's check-in, replacing one already saved for that day. */
export async function save(input: {
  regimeId: string;
  userId: string;
  day: string;
  pain: number;
  didExercises: boolean;
}): Promise<CheckIn> {
  const saved = await pool.query<CheckInRow>(
    `insert into pain_checkins (regime_id, user_id, day, pain, did_exercises)
     values ($1, $2, $3, $4, $5)
     on conflict (regime_id, day)
     do update set pain = excluded.pain, did_exercises = excluded.did_exercises, updated_at = now()
     returning ${COLUMNS}`,
    [input.regimeId, input.userId, input.day, input.pain, input.didExercises]
  );

  return fromDbRow(saved.rows[0]);
}

/**
 * Makes a plan's check-ins exactly this list, for testing from the admin page.
 * All of it, or none of it. Every row is saved as new, so the whole list counts
 * towards the trend even when the doses changed a moment ago.
 */
export async function replaceAll(
  regimeId: string,
  userId: string,
  checkIns: { day: string; pain: number; didExercises: boolean }[]
): Promise<CheckIn[]> {
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(`delete from pain_checkins where regime_id = $1`, [regimeId]);
    await client.query(
      `insert into pain_checkins (regime_id, user_id, day, pain, did_exercises)
       select $1, $2, * from unnest($3::date[], $4::smallint[], $5::boolean[])`,
      [
        regimeId,
        userId,
        checkIns.map((checkIn) => checkIn.day),
        checkIns.map((checkIn) => checkIn.pain),
        checkIns.map((checkIn) => checkIn.didExercises),
      ]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  return list(regimeId);
}
