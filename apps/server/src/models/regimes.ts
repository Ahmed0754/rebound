// The model for regimes: building one and saving it, and reading one back by id.

import { pool } from "./db.js";
import { getByRegion } from "./exercises.js";
import { pickExercises } from "./gemini.js";
import type { RegimeItem } from "../types/index.js";

export type Regime = {
  id: string;
  muscle: string;
  bodyRegion: string;
  createdAt: string;
  regime: RegimeItem[];
};

type RegimeRow = {
  id: string;
  muscle: string;
  body_region: string;
  created_at: Date;
};

type ItemRow = {
  exercise_id: string;
  name: string;
  description: string;
  sets: number;
  reps: number;
};

function fromDbRow(row: RegimeRow, items: RegimeItem[]): Regime {
  return {
    id: row.id,
    muscle: row.muscle,
    bodyRegion: row.body_region,
    createdAt: row.created_at.toISOString(),
    regime: items,
  };
}

/**
 * Builds a regime for `muscle`, saves it, and returns it, or null when there
 * is nothing to build one from.
 *
 * Saved before it is returned, so the id the caller hands out is one that can
 * actually be fetched back.
 */
export async function create(muscle: string): Promise<Regime | null> {
  const match = await getByRegion(muscle);

  if (match === null || match.exercises.length === 0) {
    return null;
  }

  const items = await pickExercises(muscle, match.exercises);

  if (items.length === 0) {
    return null;
  }

  // A transaction needs one connection for every statement, so take a client
  // out of the pool rather than using the pool's one-shot query.
  const client = await pool.connect();

  try {
    await client.query("begin");

    const created = await client.query<RegimeRow>(
      `insert into regimes (muscle, body_region)
       values ($1, $2)
       returning id, muscle, body_region, created_at`,
      [muscle, match.region]
    );

    const row = created.rows[0];

    // One insert with unnested arrays, rather than one round trip per exercise.
    // Positions are 1-based: the order the user was shown them in.
    await client.query(
      `insert into regime_exercises
         (regime_id, position, exercise_id, name, description, sets, reps)
       select $1, * from unnest($2::int[], $3::text[], $4::text[], $5::text[], $6::int[], $7::int[])`,
      [
        row.id,
        items.map((_, i) => i + 1),
        items.map((item) => item.id),
        items.map((item) => item.name),
        items.map((item) => item.description),
        items.map((item) => item.sets),
        items.map((item) => item.reps),
      ]
    );

    await client.query("commit");

    return fromDbRow(row, items);
  } catch (error) {
    // A regime row with no exercises is not a regime, so none of it is kept.
    await client.query("rollback");
    throw error;
  } finally {
    // Skipping this leaks the connection, and the pool runs out after a few.
    client.release();
  }
}

// Postgres rejects a non-uuid compared against a uuid column, which would
// surface as a 500 for what is only a bad URL. Checked first, so it is a 404.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One regime by id, or null when no regime has that id, malformed ids included. */
export async function get(id: string): Promise<Regime | null> {
  if (!UUID.test(id)) {
    return null;
  }

  const found = await pool.query<RegimeRow>(
    `select id, muscle, body_region, created_at
       from regimes
      where id = $1`,
    [id]
  );

  if (found.rows.length === 0) {
    return null;
  }

  const row = found.rows[0];

  // `position` is what makes this come back in the order it was shown.
  const items = await pool.query<ItemRow>(
    `select exercise_id, name, description, sets, reps
       from regime_exercises
      where regime_id = $1
      order by position`,
    [id]
  );

  return fromDbRow(
    row,
    // The stored snapshot, not today's catalogue: this is what the user was
    // actually shown, even if the catalogue has changed since.
    items.rows.map((item) => ({
      id: item.exercise_id,
      name: item.name,
      description: item.description,
      sets: item.sets,
      reps: item.reps,
    }))
  );
}
