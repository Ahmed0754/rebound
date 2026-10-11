// The model for onboarding responses: saving one set of answers and reading
// it back. One row, so no transaction.

import { pool } from "./db.js";
import type {
  ActivityLevel,
  AgeBand,
  Aggravator,
  Answers,
  Condition,
  Equipment,
  Goal,
  Onset,
  RedFlag,
  Screening,
  SessionMinutes,
} from "../clinical.js";

// The free-text note and what screening made of it. Kept apart from `answers`
// because the rules in clinical.ts never read prose - only the classifier and
// the generation prompt do.
export type Note = {
  freeText: string | null;
  screening: Screening;
  screeningCategories: string[];
  screeningQuote: string | null;
  screeningModel: string | null;
};

export type Onboarding = {
  id: string;
  userId: string;
  answers: Answers;
  note: Note;
  createdAt: string;
};

type OnboardingRow = {
  id: string;
  user_id: string;
  goal: string;
  region: string;
  onset: string;
  pain_now: number;
  aggravators: string[];
  red_flags: string[];
  age_band: string;
  conditions: string[];
  equipment: string[];
  activity_level: string;
  session_minutes: number;
  free_text: string | null;
  screening: string;
  screening_categories: string[];
  screening_quote: string | null;
  screening_model: string | null;
  created_at: Date;
};

const COLUMNS = `id, user_id, goal, region, onset, pain_now, aggravators,
                 red_flags, age_band, conditions, equipment, activity_level,
                 session_minutes, free_text, screening, screening_categories,
                 screening_quote, screening_model, created_at`;

// Same shape and reason as the one in models/regimes.ts: a non-uuid compared
// against a uuid column is a Postgres error, which would be a 500 for what is
// only a bad id.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The casts trust the database over the type system. Every value in these
// columns was written by `create`, which only takes answers the controller has
// already checked against the lists in clinical.ts.
function fromDbRow(row: OnboardingRow): Onboarding {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at.toISOString(),
    answers: {
      goal: row.goal as Goal,
      region: row.region,
      onset: row.onset as Onset,
      painNow: row.pain_now,
      aggravators: row.aggravators as Aggravator[],
      redFlags: row.red_flags as RedFlag[],
      ageBand: row.age_band as AgeBand,
      conditions: row.conditions as Condition[],
      equipment: row.equipment as Equipment[],
      activityLevel: row.activity_level as ActivityLevel,
      sessionMinutes: row.session_minutes as SessionMinutes,
    },
    note: {
      freeText: row.free_text,
      // A check constraint holds this column to the same list.
      screening: row.screening as Screening,
      screeningCategories: row.screening_categories,
      screeningQuote: row.screening_quote,
      screeningModel: row.screening_model,
    },
  };
}

export async function create(userId: string, answers: Answers, note: Note): Promise<Onboarding> {
  const saved = await pool.query<OnboardingRow>(
    `insert into onboarding_responses
       (user_id, goal, region, onset, pain_now, aggravators, red_flags,
        age_band, conditions, equipment, activity_level, session_minutes,
        free_text, screening, screening_categories, screening_quote, screening_model)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     returning ${COLUMNS}`,
    [
      userId,
      answers.goal,
      answers.region,
      answers.onset,
      answers.painNow,
      answers.aggravators,
      answers.redFlags,
      answers.ageBand,
      answers.conditions,
      answers.equipment,
      answers.activityLevel,
      answers.sessionMinutes,
      note.freeText,
      note.screening,
      note.screeningCategories,
      note.screeningQuote,
      note.screeningModel,
    ]
  );

  return fromDbRow(saved.rows[0]);
}

/**
 * One set of answers belonging to `userId`, or null.
 *
 * Scoped to the owner, so another account's health answers read as a miss
 * rather than as a refusal. An unknown id and a malformed one answer the same
 * way for the same reason.
 */
export async function get(id: string, userId: string): Promise<Onboarding | null> {
  if (!UUID.test(id)) {
    return null;
  }

  const found = await pool.query<OnboardingRow>(
    `select ${COLUMNS}
       from onboarding_responses
      where id = $1 and user_id = $2`,
    [id, userId]
  );

  if (found.rows.length === 0) {
    return null;
  }

  return fromDbRow(found.rows[0]);
}
