// The model for regimes: building one and saving it, reading one back by id,
// replacing the exercises of one, and deleting one.

import type { Pool, PoolClient } from "pg";
import { pool } from "./db.js";
import { getByIds, getByRegion } from "./exercises.js";
import { pickExercises } from "./gemini.js";
import type { RegimeEdit, RegimeItem } from "../types/index.js";

export type Regime = {
  id: string;
  muscle: string;
  bodyRegion: string;
  createdAt: string;
  updatedAt: string;
  regime: RegimeItem[];
  // Who made it, if anyone was signed in at the time - see ACCOUNTS.md. Not
  // enforced: this is a tag, not an ownership check.
  userId: string | null;
};

type RegimeRow = {
  id: string;
  muscle: string;
  body_region: string;
  created_at: Date;
  updated_at: Date;
  user_id: string | null;
};

type ItemRow = {
  exercise_id: string;
  name: string;
  description: string;
  sets: number;
  reps: number;
};

// Either the pool, for a read that stands on its own, or a client checked out
// of it, for a read that has to happen inside a transaction.
type Queryable = Pool | PoolClient;

// The columns a regime is built from, written once because four queries select
// exactly these and one selecting fewer would return a regime missing a field.
const REGIME_COLUMNS = "id, muscle, body_region, created_at, updated_at, user_id";

/** Thrown when an edit names an exercise the server cannot put a name to. */
export class UnknownExercise extends Error {
  constructor(readonly exerciseId: string) {
    super(`unknown exercise "${exerciseId}"`);
    this.name = "UnknownExercise";
  }
}

function fromDbRow(row: RegimeRow, items: RegimeItem[]): Regime {
  return {
    id: row.id,
    muscle: row.muscle,
    bodyRegion: row.body_region,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    regime: items,
    userId: row.user_id,
  };
}

// Postgres rejects a non-uuid compared against a uuid column, which would
// surface as a 500 for what is only a bad URL. Checked first, so it is a 404.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The exercises of one regime, in the order they were shown.
 *
 * Takes whatever connection the caller is already using, because the two
 * callers need different ones: a plain read can use the pool, but the read
 * inside `update` has to see the same transaction that is about to replace
 * these rows.
 */
async function readItems(runner: Queryable, regimeId: string): Promise<RegimeItem[]> {
  // `position` is what makes this come back in the order it was shown.
  const items = await runner.query<ItemRow>(
    `select exercise_id, name, description, sets, reps
       from regime_exercises
      where regime_id = $1
      order by position`,
    [regimeId]
  );

  // The stored snapshot, not today's catalogue: this is what the user was
  // actually shown, even if the catalogue has changed since.
  return items.rows.map((item) => ({
    id: item.exercise_id,
    name: item.name,
    description: item.description,
    sets: item.sets,
    reps: item.reps,
  }));
}

/**
 * Writes the exercises of one regime. Shared by create and update, which
 * differ only in whether there were rows there before.
 *
 * One insert with unnested arrays, rather than one round trip per exercise.
 * Positions are 1-based: the order the user was shown them in.
 */
async function insertItems(
  client: PoolClient,
  regimeId: string,
  items: RegimeItem[]
): Promise<void> {
  await client.query(
    `insert into regime_exercises
       (regime_id, position, exercise_id, name, description, sets, reps)
     select $1, * from unnest($2::int[], $3::text[], $4::text[], $5::text[], $6::int[], $7::int[])`,
    [
      regimeId,
      items.map((_, i) => i + 1),
      items.map((item) => item.id),
      items.map((item) => item.name),
      items.map((item) => item.description),
      items.map((item) => item.sets),
      items.map((item) => item.reps),
    ]
  );
}

/**
 * Builds a regime for `muscle`, saves it, and returns it, or null when there
 * is nothing to build one from.
 *
 * `userId` is optional and unenforced - a tag recording who was signed in
 * when the regime was made, not an ownership check. See ACCOUNTS.md.
 *
 * Saved before it is returned, so the id the caller hands out is one that can
 * actually be fetched back.
 */
export async function create(muscle: string, userId?: string): Promise<Regime | null> {
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
      `insert into regimes (muscle, body_region, user_id)
       values ($1, $2, $3)
       returning ${REGIME_COLUMNS}`,
      [muscle, match.region, userId ?? null]
    );

    const row = created.rows[0];

    await insertItems(client, row.id, items);

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

/** One regime by id, or null when no regime has that id, malformed ids included. */
export async function get(id: string): Promise<Regime | null> {
  if (!UUID.test(id)) {
    return null;
  }

  const found = await pool.query<RegimeRow>(
    `select ${REGIME_COLUMNS}
       from regimes
      where id = $1`,
    [id]
  );

  if (found.rows.length === 0) {
    return null;
  }

  return fromDbRow(found.rows[0], await readItems(pool, id));
}

/**
 * Turns an edit into the items to store.
 *
 * Name and description never come from the request. A saved regime is the
 * record of what the app told someone, so the text is taken from what is
 * already stored, and from the catalogue only for an exercise being added.
 *
 * Stored rows are preferred over the catalogue, so an exercise that a re-seed
 * has since dropped still survives an edit of a regime that contains it.
 */
async function resolveItems(
  client: PoolClient,
  regimeId: string,
  picks: RegimeEdit[]
): Promise<RegimeItem[]> {
  const stored = new Map((await readItems(client, regimeId)).map((item) => [item.id, item]));

  // Only the ids being added need looking up; the rest are already in hand.
  const catalogue = await getByIds(
    picks.filter((pick) => !stored.has(pick.id)).map((pick) => pick.id)
  );

  return picks.map((pick) => {
    const source = stored.get(pick.id) ?? catalogue.get(pick.id);

    if (source === undefined) {
      throw new UnknownExercise(pick.id);
    }

    return {
      id: pick.id,
      name: source.name,
      description: source.description,
      sets: pick.sets,
      reps: pick.reps,
    };
  });
}

/**
 * Replaces the exercises of one regime and returns it as it now stands, or
 * null when no regime has that id. Throws `UnknownExercise` when an edit names
 * an exercise that is neither already in the regime nor in the catalogue.
 *
 * Replace, not update in place: the number of exercises can change, and
 * `position` is half the primary key, so there is no row to update when the
 * list grows or shrinks.
 *
 * NO OWNERSHIP CHECK EXISTS. Anyone holding an id can rewrite that regime.
 * That is only tolerable while regimes belong to nobody; the commit that adds
 * `user_id` has to add `and user_id = $2` here, or accounts ship with every
 * user able to edit every other user's plan.
 */
export async function update(id: string, picks: RegimeEdit[]): Promise<Regime | null> {
  if (!UUID.test(id)) {
    return null;
  }

  const client = await pool.connect();

  try {
    await client.query("begin");

    // `for update` puts the existence check inside the transaction: the regime
    // cannot be deleted between being found and having its rows rewritten, and
    // two edits arriving at once are applied one after the other rather than
    // interleaved.
    const found = await client.query<RegimeRow>(
      `select ${REGIME_COLUMNS}
         from regimes
        where id = $1
        for update`,
      [id]
    );

    if (found.rows.length === 0) {
      await client.query("rollback");
      return null;
    }

    const items = await resolveItems(client, id, picks);

    await client.query(`delete from regime_exercises where regime_id = $1`, [id]);
    await insertItems(client, id, items);

    // The only column on the regime itself that an edit changes. `created_at`
    // stays the moment it was generated.
    const touched = await client.query<RegimeRow>(
      `update regimes
          set updated_at = now()
        where id = $1
        returning ${REGIME_COLUMNS}`,
      [id]
    );

    await client.query("commit");

    return fromDbRow(touched.rows[0], items);
  } catch (error) {
    // Half a replacement is worse than none: by this point the old rows may
    // already be gone.
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Deletes one regime, and reports whether there was one to delete.
 *
 * The exercises go with it without being named here: `regime_exercises.regime_id`
 * is declared `on delete cascade`, so this is one statement and needs no
 * transaction.
 *
 * Deliberately a hard delete. A soft one (`deleted_at`) is probably what a
 * user-facing "delete my plan" wants once there is history worth keeping, but
 * that filter would then have to be added to every read, so it is not worth
 * carrying before there is anything to keep.
 *
 * NO OWNERSHIP CHECK EXISTS - see `update` above. This one destroys data, so
 * of the two it is the more urgent to fix when `user_id` arrives.
 */
export async function remove(id: string): Promise<boolean> {
  if (!UUID.test(id)) {
    return false;
  }

  const deleted = await pool.query(`delete from regimes where id = $1`, [id]);

  return deleted.rowCount === 1;
}
