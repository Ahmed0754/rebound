// The model for regimes: building one and saving it, reading one back by id,
// replacing the exercises of one, and deleting one.

import type { Pool, PoolClient } from "pg";
import { pool } from "./db.js";
import {
  countCandidates,
  getByIds,
  getByRegion,
  getCandidates,
  type Candidate,
  type Exercise,
} from "./exercises.js";
import { proposeRegime, REQUEST_TIMEOUT_MS } from "./gemini.js";
import {
  checkRationales,
  DIFFICULTIES,
  validateRegime,
  widestLimits,
  type Answers,
  type Equipment,
  type Limits,
} from "../clinical.js";
import { asksFor, checkQuality, type QualityResult } from "../quality.js";
import type { RegimeEdit, RegimeItem, Unit } from "../types/index.js";

export type Regime = {
  id: string;
  muscle: string;
  bodyRegion: string;
  createdAt: string;
  updatedAt: string;
  regime: RegimeItem[];
  // The account that made it. Never null: `regimes.user_id` is `not null`, so
  // a regime cannot exist without an owner. `get`, `update` and `remove` only
  // ever find a regime for its owner.
  userId: string;
  // The limits the plan was validated against when it was generated. Null
  // for plans made before the limits were recorded.
  limits: Limits | null;
};

type RegimeRow = {
  id: string;
  muscle: string;
  body_region: string;
  created_at: Date;
  updated_at: Date;
  user_id: string;
  // jsonb, so `pg` has already parsed it.
  limits: Limits | null;
};

type ItemRow = {
  exercise_id: string;
  name: string;
  description: string;
  unit: string;
  sets: number;
  reps: number | null;
  hold_seconds: number | null;
  rationale: string | null;
};

// The columns an item is read back from, shared by `readItems` and `list`.
const ITEM_COLUMNS = "exercise_id, name, description, unit, sets, reps, hold_seconds, rationale";

// A check constraint holds `unit` to these two values, so the cast is safe.
function itemFromDbRow(item: ItemRow): RegimeItem {
  return {
    id: item.exercise_id,
    name: item.name,
    description: item.description,
    unit: item.unit as Unit,
    sets: item.sets,
    reps: item.reps,
    holdSeconds: item.hold_seconds,
    rationale: item.rationale,
  };
}

// Either the pool, for a read that stands on its own, or a client checked out
// of it, for a read that has to happen inside a transaction.
type Queryable = Pool | PoolClient;

// The columns a regime is built from, written once because four queries select
// exactly these and one selecting fewer would return a regime missing a field.
const REGIME_COLUMNS = "id, muscle, body_region, created_at, updated_at, user_id, limits";

/**
 * Thrown when a questionnaire's filters leave fewer exercises than the
 * smallest plan allowed.
 *
 * Nothing is loosened to make up the number: every filter is either a safety
 * restriction or equipment the person does not own, and quietly dropping
 * either to fill a plan is worse than saying no plan fits.
 */
export class TooFewCandidates extends Error {
  constructor(
    readonly found: number,
    readonly needed: number
  ) {
    super(
      `only ${found} exercise${found === 1 ? "" : "s"} fit these answers, and a plan needs at least ${needed}`
    );
    this.name = "TooFewCandidates";
  }
}

/**
 * Thrown when no valid plan came back inside the time budget: the model could
 * not be reached, or every answer failed the hard checks, even after being
 * told why (ADR 0024).
 *
 * Refused rather than patched, by decision (ADR 0022): there are
 * no presets to fall back to, and a plan assembled some other way would not
 * be what the user was told they were getting. Nothing is saved.
 */
export class GenerationFailed extends Error {
  constructor(readonly problems: string[]) {
    super("we couldn't build a plan right now - please try again in a few minutes");
    this.name = "GenerationFailed";
  }
}

/** Thrown when an edit doses an exercise in the wrong unit - reps for a hold. */
export class WrongUnit extends Error {
  constructor(
    readonly exerciseId: string,
    readonly unit: Unit
  ) {
    super(
      `"${exerciseId}" is dosed as ${unit === "hold" ? "a hold - send holdSeconds" : "reps - send reps"}`
    );
    this.name = "WrongUnit";
  }
}

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
    limits: row.limits,
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
    `select ${ITEM_COLUMNS}
       from regime_exercises
      where regime_id = $1
      order by position`,
    [regimeId]
  );

  // The stored snapshot, not today's catalogue: this is what the user was
  // actually shown, even if the catalogue has changed since.
  return items.rows.map(itemFromDbRow);
}

/**
 * Every regime belonging to `userId`, newest first.
 *
 * Two queries rather than one per regime: the regimes, then all of their
 * exercises at once, grouped here. An account with ten plans costs the same
 * round trips as one with one.
 */
export async function list(userId: string): Promise<Regime[]> {
  const found = await pool.query<RegimeRow>(
    `select ${REGIME_COLUMNS}
       from regimes
      where user_id = $1
      order by created_at desc`,
    [userId]
  );

  if (found.rows.length === 0) {
    return [];
  }

  const items = await pool.query<ItemRow & { regime_id: string }>(
    `select regime_id, ${ITEM_COLUMNS}
       from regime_exercises
      where regime_id = any($1)
      order by regime_id, position`,
    [found.rows.map((row) => row.id)]
  );

  // `order by position` above means each regime's exercises arrive in the
  // order they were shown, and pushing in turn preserves it.
  const byRegime = new Map<string, RegimeItem[]>();

  for (const item of items.rows) {
    const list = byRegime.get(item.regime_id) ?? [];

    list.push(itemFromDbRow(item));

    byRegime.set(item.regime_id, list);
  }

  return found.rows.map((row) => fromDbRow(row, byRegime.get(row.id) ?? []));
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
       (regime_id, position, exercise_id, name, description, unit, sets, reps,
        hold_seconds, rationale)
     select $1, * from unnest($2::int[], $3::text[], $4::text[], $5::text[], $6::text[],
                              $7::int[], $8::int[], $9::int[], $10::text[])`,
    [
      regimeId,
      items.map((_, i) => i + 1),
      items.map((item) => item.id),
      items.map((item) => item.name),
      items.map((item) => item.description),
      items.map((item) => item.unit),
      items.map((item) => item.sets),
      items.map((item) => item.reps),
      items.map((item) => item.holdSeconds),
      items.map((item) => item.rationale),
    ]
  );
}

// The questionnaire's equipment answers, in the catalogue's own names. Lives
// here because this is the one file that sits between the two vocabularies:
// clinical.ts does not know the catalogue, and exercises.ts must not know the
// questionnaire.
//
// "body only" is not listed because everyone has it - it is added for every
// answer in `toCandidateQuery`. Kettlebells are not counted as dumbbells, and
// foam rollers and exercise balls only count as a full gym: the questionnaire
// does not ask about them, so nobody is assumed to own one.
const CATALOGUE_EQUIPMENT: Record<Equipment, string[]> = {
  none: [],
  bands: ["bands"],
  dumbbells: ["dumbbell"],
  full_gym: [
    "bands",
    "dumbbell",
    "barbell",
    "cable",
    "machine",
    "kettlebells",
    "e-z curl bar",
    "exercise ball",
    "medicine ball",
    "foam roll",
    "other",
  ],
};

// How many candidates Gemini is shown. Same number the typed path sends.
const CANDIDATE_LIMIT = 20;

/**
 * Turns answers and the limits derived from them into the options
 * `getCandidates` takes. Pure, so the translation - which is where v1 lost
 * its equipment filter - is testable without a database.
 */
export function toCandidateQuery(answers: Answers, limits: Limits) {
  const equipment = new Set(["body only"]);

  for (const owned of answers.equipment) {
    for (const name of CATALOGUE_EQUIPMENT[owned]) {
      equipment.add(name);
    }
  }

  return {
    region: answers.region,
    equipment: [...equipment],
    // Every level up to and including the cap: a cap of "intermediate" still
    // allows beginner exercises.
    levels: DIFFICULTIES.slice(0, DIFFICULTIES.indexOf(limits.difficultyCap) + 1),
    categories: [...limits.categories],
    aggravators: [...answers.aggravators],
    limit: CANDIDATE_LIMIT,
  };
}

/**
 * The exercises a questionnaire allows, before Gemini chooses among them.
 * Null when the region is unknown. The same call `create` makes, exposed so
 * the pool can be inspected on its own.
 */
export function getCandidatesFor(answers: Answers, limits: Limits): Promise<Candidate[] | null> {
  return getCandidates(toCandidateQuery(answers, limits));
}

/**
 * How a questionnaire narrows the catalogue down: the count left after each
 * filter, and how many of those the model is then shown. Null when the region
 * is unknown. Counts, not rows - this is for showing someone the shape of the
 * selection, not for building a plan.
 */
export async function getFunnelFor(answers: Answers, limits: Limits) {
  const counts = await countCandidates(toCandidateQuery(answers, limits));

  if (counts === null) {
    return null;
  }

  return { ...counts, shown: Math.min(counts.aggravators, CANDIDATE_LIMIT) };
}

// Every attempt at a plan, retries included, has to fit inside this, by
// decision (ADR 0024). A plan still being retried after 20 seconds is not
// worth the wait it costs the person on the other end.
const GENERATION_BUDGET_MS = 20_000;

// No attempt starts with less than this left: a call cut off before Gemini can
// answer is wasted, and the time is better spent returning what there is.
const MIN_ATTEMPT_MS = 4_000;

// A backstop, not the limit. Without it, a model failing instantly would be
// called over and over until the budget ran out.
const MAX_ATTEMPTS = 5;

/** What the quality checks made of the plan that was saved. Stored, not returned. */
export type Quality = QualityResult & {
  attempts: number;
  // The misses of the first plan that passed the hard checks, before any retry
  // told the model about the criteria - how well it does unprompted.
  firstMissed: string[];
};

/**
 * Asks Gemini for a plan, checks it, and keeps asking until one passes or the
 * time budget runs out (ADR 0024).
 *
 * Two tiers. The hard checks - `validateRegime` and `checkRationales` - decide
 * whether a plan can be saved at all. The quality checks decide whether it is
 * worth trying again for a better one. A failed call, a rejected plan and a
 * quality miss each cost an attempt, and every retry is told what was wrong,
 * so it is a correction rather than a re-roll.
 *
 * Quality is only checked when the candidates carry the catalogue's tags,
 * which only questionnaire candidates do. When the budget runs out, the plan
 * that passed the hard checks with the fewest misses is the one returned.
 * Throws `GenerationFailed` when no attempt passed the hard checks.
 */
async function generate(input: {
  region: string;
  candidates: Exercise[];
  limits: Limits;
  answers?: Answers;
  freeText?: string | null;
  // The same candidates with their catalogue tags, from a questionnaire.
  tagged?: Candidate[];
}): Promise<{ items: RegimeItem[]; quality: Quality | null }> {
  const { tagged, ...request } = input;
  const byId = new Map(input.candidates.map((candidate) => [candidate.id, candidate]));
  const allowed = new Map(input.candidates.map((candidate) => [candidate.id, candidate.unit]));
  const tags = new Map((tagged ?? []).map((candidate) => [candidate.id, candidate]));
  const deadline = Date.now() + GENERATION_BUDGET_MS;
  let problems: string[] = [];
  let best: { items: RegimeItem[]; result: QualityResult } | null = null;
  let firstMissed: string[] | null = null;
  let attempts = 0;

  while (attempts < MAX_ATTEMPTS) {
    const left = deadline - Date.now();

    if (left < MIN_ATTEMPT_MS) {
      break;
    }

    attempts++;
    let proposal;

    try {
      proposal = await proposeRegime({
        ...request,
        rejection: problems,
        timeoutMs: Math.min(REQUEST_TIMEOUT_MS, left),
      });
    } catch (error) {
      console.error(`regime generation failed (attempt ${attempts})`, error);
      problems = [];
      continue;
    }

    const verdict = validateRegime(proposal.draft, input.limits, allowed);
    const hard = [...(verdict.ok ? [] : verdict.problems), ...checkRationales(proposal.rationales)];

    if (hard.length > 0) {
      console.error(`regime rejected (attempt ${attempts})`, hard);
      problems = hard;
      continue;
    }

    // Every id is known by now - the validator rejected any that were not.
    const items = proposal.draft.map((item) => {
      const source = byId.get(item.id)!;

      return {
        id: item.id,
        name: source.name,
        description: source.description,
        unit: item.unit,
        sets: item.sets,
        reps: item.reps,
        holdSeconds: item.holdSeconds,
        rationale: proposal.rationales.get(item.id) ?? null,
      };
    });

    if (tagged === undefined || input.answers === undefined) {
      return { items, quality: null };
    }

    const result = checkQuality(
      items.map((item) => tags.get(item.id)!),
      tagged,
      { region: input.region, answers: input.answers, limits: input.limits }
    );

    firstMissed ??= result.missed;

    if (best === null || result.missed.length < best.result.missed.length) {
      best = { items, result };
    }

    if (result.missed.length === 0) {
      break;
    }

    console.error(`regime missed quality criteria (attempt ${attempts})`, result.missed);
    problems = asksFor(result.missed);
  }

  if (best === null) {
    throw new GenerationFailed(problems);
  }

  return { items: best.items, quality: { ...best.result, attempts, firstMissed: firstMissed ?? [] } };
}

/**
 * Builds a regime, saves it, and returns it, or null when there is nothing to
 * build one from.
 *
 * `userId` is required - `regimes.user_id` is `not null`. `onboarding` is
 * not: the original "type a body part" screen has no questionnaire behind it,
 * so it draws from `getByRegion` and is held only to the widest limits. With a
 * questionnaire, the candidates come from `getCandidates` and the plan is held
 * to the limits its answers produced.
 *
 * Throws `TooFewCandidates` when the filters leave too little to build the
 * smallest allowed plan from, and `GenerationFailed` when no valid plan came
 * back from the model.
 *
 * An options object so the next field added here is not a fourth argument.
 */
export async function create(input: {
  muscle: string;
  userId: string;
  onboarding?: { answers: Answers; limits: Limits; freeText: string | null };
}): Promise<Regime | null> {
  const { muscle, userId, onboarding } = input;
  const limits = onboarding?.limits ?? widestLimits();
  let region: string;
  let exercises: Exercise[];
  let tagged: Candidate[] | undefined;

  if (onboarding === undefined) {
    const match = await getByRegion(muscle);

    if (match === null || match.exercises.length === 0) {
      return null;
    }

    region = match.region;
    exercises = match.exercises;
  } else {
    const candidates = await getCandidatesFor(onboarding.answers, onboarding.limits);

    if (candidates === null) {
      return null;
    }

    region = onboarding.answers.region;
    // The model is only ever sent the plain exercise fields (see
    // `userContent`), so the catalogue tags can travel with the candidates:
    // the quality checks need them.
    exercises = candidates;
    tagged = candidates;
  }

  if (exercises.length < limits.count.min) {
    throw new TooFewCandidates(exercises.length, limits.count.min);
  }

  const { items, quality } = await generate({
    region,
    candidates: exercises,
    limits,
    answers: onboarding?.answers,
    freeText: onboarding?.freeText,
    tagged,
  });

  // A transaction needs one connection for every statement, so take a client
  // out of the pool rather than using the pool's one-shot query.
  const client = await pool.connect();

  try {
    await client.query("begin");

    const created = await client.query<RegimeRow>(
      `insert into regimes (muscle, body_region, user_id, limits, quality)
       values ($1, $2, $3, $4, $5)
       returning ${REGIME_COLUMNS}`,
      [muscle, region, userId, JSON.stringify(limits), quality === null ? null : JSON.stringify(quality)]
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

/**
 * One regime by id, or null when `userId` has no regime with that id -
 * another account's included, malformed ids too.
 */
export async function get(id: string, userId: string): Promise<Regime | null> {
  if (!UUID.test(id)) {
    return null;
  }

  const found = await pool.query<RegimeRow>(
    `select ${REGIME_COLUMNS}
       from regimes
      where id = $1 and user_id = $2`,
    [id, userId]
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
    const kept = stored.get(pick.id);
    const source = kept ?? catalogue.get(pick.id);

    if (source === undefined) {
      throw new UnknownExercise(pick.id);
    }

    // The unit an exercise was saved with wins over today's catalogue, for
    // the same reason the stored text does.
    const unit = source.unit;

    if ((unit === "reps" && pick.reps === null) || (unit === "hold" && pick.holdSeconds === null)) {
      throw new WrongUnit(pick.id, unit);
    }

    // The rationale explained a particular dose. Kept while the dose is
    // unchanged, dropped once the edit has changed what it was explaining.
    const unchanged =
      kept !== undefined &&
      kept.sets === pick.sets &&
      kept.reps === (unit === "reps" ? pick.reps : null) &&
      kept.holdSeconds === (unit === "hold" ? pick.holdSeconds : null);

    return {
      id: pick.id,
      name: source.name,
      description: source.description,
      unit,
      sets: pick.sets,
      reps: unit === "reps" ? pick.reps : null,
      holdSeconds: unit === "hold" ? pick.holdSeconds : null,
      rationale: unchanged ? kept.rationale : null,
    };
  });
}

/**
 * Replaces the exercises of one regime and returns it as it now stands, or
 * null when `userId` has no regime with that id. Throws `UnknownExercise` when an edit names
 * an exercise that is neither already in the regime nor in the catalogue.
 *
 * Replace, not update in place: the number of exercises can change, and
 * `position` is half the primary key, so there is no row to update when the
 * list grows or shrinks.
 */
export async function update(
  id: string,
  userId: string,
  picks: RegimeEdit[]
): Promise<Regime | null> {
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
        where id = $1 and user_id = $2
        for update`,
      [id, userId]
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
 * Deletes one of `userId`'s regimes, and reports whether there was one to delete.
 *
 * The exercises go with it without being named here: `regime_exercises.regime_id`
 * is declared `on delete cascade`, so this is one statement and needs no
 * transaction.
 *
 * Deliberately a hard delete. A soft one (`deleted_at`) is probably what a
 * user-facing "delete my plan" wants once there is history worth keeping, but
 * that filter would then have to be added to every read, so it is not worth
 * carrying before there is anything to keep.
 */
export async function remove(id: string, userId: string): Promise<boolean> {
  if (!UUID.test(id)) {
    return false;
  }

  const deleted = await pool.query(`delete from regimes where id = $1 and user_id = $2`, [id, userId]);

  return deleted.rowCount === 1;
}
