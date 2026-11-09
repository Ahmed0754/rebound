// The model for a plan's adjustment history: applying a suggestion from the
// pain trend, listing what has been applied, and undoing it. The doses and
// the record of changing them are written in one transaction, so neither can
// exist without the other.

import { sameDoses } from "../clinical.js";
import type { RegimeEdit, RegimeItem, Unit } from "../types/index.js";
import { pool } from "./db.js";
import { readItems, replaceItems, resolveItems, type Regime } from "./regimes.js";

type Dose = { sets: number; reps: number | null; holdSeconds: number | null };

export type AdjustmentEvent = {
  id: string;
  trend: "better" | "worse";
  earlier: number;
  recent: number;
  createdAt: string;
  undoneAt: string | null;
  // Only the exercises whose dose moved.
  changes: { id: string; name: string; unit: Unit; from: Dose; to: Dose }[];
  // True for the one change that undo would reverse, while the plan still
  // stands as that change left it.
  undoable: boolean;
};

type EventRow = {
  id: string;
  trend: "better" | "worse";
  earlier: number;
  recent: number;
  // jsonb, so `pg` has already parsed them.
  doses_before: RegimeItem[];
  doses_after: RegimeItem[];
  created_at: Date;
  undone_at: Date | null;
};

const COLUMNS = "id, trend, earlier, recent, doses_before, doses_after, created_at, undone_at";

// A plan has about one change a week at most, so this is months of history.
const HISTORY_LIMIT = 20;

/** Thrown when the plan moved on after the suggestion was worked out. */
export class StaleAdjustment extends Error {
  constructor() {
    super("your plan has changed since this suggestion was made");
    this.name = "StaleAdjustment";
  }
}

/** Thrown when there is nothing undo could safely reverse. */
export class CannotUndo extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "CannotUndo";
  }
}

const doseOf = ({ sets, reps, holdSeconds }: RegimeItem): Dose => ({ sets, reps, holdSeconds });

function changesBetween(before: RegimeItem[], after: RegimeItem[]): AdjustmentEvent["changes"] {
  const was = new Map(before.map((item) => [item.id, item]));

  return after.flatMap((item) => {
    const old = was.get(item.id);

    if (old === undefined || (old.sets === item.sets && old.reps === item.reps && old.holdSeconds === item.holdSeconds)) {
      return [];
    }

    return [{ id: item.id, name: item.name, unit: item.unit, from: doseOf(old), to: doseOf(item) }];
  });
}

/**
 * Saves a suggestion's doses and records that it happened. Null when `userId`
 * has no such plan. Throws `StaleAdjustment` when the plan no longer has the
 * doses in `expected`, which the suggestion was worked out from: the check is
 * inside the lock, so a double-clicked Apply can't step the plan twice.
 */
export async function apply(input: {
  regimeId: string;
  userId: string;
  expected: RegimeItem[];
  picks: RegimeEdit[];
  trend: "better" | "worse";
  earlier: number;
  recent: number;
}): Promise<Regime | null> {
  const { regimeId, userId, expected, picks, trend, earlier, recent } = input;

  return replaceItems(regimeId, userId, async (client) => {
    const before = await readItems(client, regimeId);

    if (!sameDoses(before, expected)) {
      throw new StaleAdjustment();
    }

    const after = await resolveItems(client, regimeId, picks);

    await client.query(
      `insert into adjustment_events
         (regime_id, user_id, trend, earlier, recent, doses_before, doses_after)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [regimeId, userId, trend, earlier, recent, JSON.stringify(before), JSON.stringify(after)]
    );

    return after;
  });
}

/**
 * Puts a plan back as it was before its latest change that hasn't been undone,
 * rationales included. Repeating it walks further back. Null when `userId` has
 * no such plan.
 *
 * Throws `CannotUndo` when there is no change to reverse, or when the doses
 * were edited by hand afterwards: undoing then would silently throw that edit away.
 */
export async function undo(regimeId: string, userId: string): Promise<Regime | null> {
  return replaceItems(regimeId, userId, async (client) => {
    const found = await client.query<EventRow>(
      `select ${COLUMNS}
         from adjustment_events
        where regime_id = $1 and undone_at is null
        order by created_at desc
        limit 1`,
      [regimeId]
    );

    const event = found.rows[0];

    if (event === undefined) {
      throw new CannotUndo("there is no change to undo");
    }

    if (!sameDoses(await readItems(client, regimeId), event.doses_after)) {
      throw new CannotUndo("the doses have been edited since, so this change can't be undone");
    }

    await client.query(`update adjustment_events set undone_at = now() where id = $1`, [event.id]);

    return event.doses_before;
  });
}

/** A plan's history, newest first. Only ever called for a plan found for its owner. */
export async function list(regime: Regime): Promise<AdjustmentEvent[]> {
  const found = await pool.query<EventRow>(
    `select ${COLUMNS}
       from adjustment_events
      where regime_id = $1
      order by created_at desc
      limit $2`,
    [regime.id, HISTORY_LIMIT]
  );

  const latest = found.rows.find((row) => row.undone_at === null);

  return found.rows.map((row) => ({
    id: row.id,
    trend: row.trend,
    earlier: row.earlier,
    recent: row.recent,
    createdAt: row.created_at.toISOString(),
    undoneAt: row.undone_at === null ? null : row.undone_at.toISOString(),
    changes: changesBetween(row.doses_before, row.doses_after),
    undoable: row === latest && sameDoses(regime.regime, row.doses_after),
  }));
}
