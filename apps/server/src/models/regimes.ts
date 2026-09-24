//This is the model for saved regimes
//Writing one to the database, and reading the most recent one back.

import { pool } from "./db.js";
import type { RegimeItem } from "./regime.js";

export type SavedRegime = {
  id: string;
  muscle: string;
  bodyRegion: string;
  createdAt: string;
  regime: RegimeItem[];
};

type SavedRow = {
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

/**
 * Writes a regime and its exercises, and returns the new regime's id.
 *
 * Both inserts run inside one transaction: a regime row with no exercises is
 * not a regime, so either the whole thing lands or none of it does.
 */
export async function saveRegime(muscle: string, items: RegimeItem[]): Promise<string> {
  // Every item carries the region it was matched for, so the regime's own
  // region is just the one they all share.
  const bodyRegion = items[0].bodyRegion;

  // A transaction needs one connection for every statement, so take a client
  // out of the pool rather than using the pool's one-shot query.
  const client = await pool.connect();

  try {
    await client.query("begin");

    const created = await client.query<{ id: string }>(
      `insert into regimes (muscle, body_region)
       values ($1, $2)
       returning id`,
      [muscle, bodyRegion]
    );

    const id = created.rows[0].id;

    const positions: number[] = [];
    const exerciseIds: string[] = [];
    const names: string[] = [];
    const descriptions: string[] = [];
    const sets: number[] = [];
    const reps: number[] = [];

    for (let i = 0; i < items.length; i++) {
      // 1-based, because it is the position a person would read out loud.
      positions.push(i + 1);
      exerciseIds.push(items[i].id);
      names.push(items[i].name);
      descriptions.push(items[i].description);
      sets.push(items[i].sets);
      reps.push(items[i].reps);
    }

    // One insert with unnested arrays, rather than one round trip per exercise.
    await client.query(
      `insert into regime_exercises
         (regime_id, position, exercise_id, name, description, sets, reps)
       select $1, * from unnest($2::int[], $3::text[], $4::text[], $5::text[], $6::int[], $7::int[])`,
      [id, positions, exerciseIds, names, descriptions, sets, reps]
    );

    await client.query("commit");

    return id;
  } catch (error) {
    // Leave nothing half-written behind for the next request to trip over.
    await client.query("rollback");
    throw error;
  } finally {
    // Skipping this leaks the connection, and the pool runs out after a few.
    client.release();
  }
}

/**
 * The most recently saved regime, or null when nothing has been saved yet.
 *
 * There is one global "latest" because there are no accounts yet. Once a
 * regime belongs to a user, this takes a user id and the ordering stays
 * the same.
 */
export async function findLatestRegime(): Promise<SavedRegime | null> {
  const found = await pool.query<SavedRow>(
    `select id, muscle, body_region, created_at
       from regimes
      order by created_at desc
      limit 1`
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
    [row.id]
  );

  const regime: RegimeItem[] = [];

  for (const item of items.rows) {
    regime.push({
      id: item.exercise_id,
      name: item.name,
      // Stored on the regime, not read back from `exercises`: this is what the
      // user was actually shown, even if the catalogue has changed since.
      bodyRegion: row.body_region,
      description: item.description,
      sets: item.sets,
      reps: item.reps,
    });
  }

  return {
    id: row.id,
    muscle: row.muscle,
    bodyRegion: row.body_region,
    createdAt: row.created_at.toISOString(),
    regime,
  };
}
