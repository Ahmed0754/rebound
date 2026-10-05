// The rules layer: what the questionnaire asks, what stops a plan being
// generated, and the numbers a generated plan has to stay inside.
//
// This file has no imports on purpose. Nothing here reads the database or
// calls Gemini, so its tests need no environment at all.
//
// None of these numbers has been reviewed by a physiotherapist. Keeping them
// in one file is what lets a clinician read and change them in one place.

export const GOALS = [
  "return_to_movement",
  "reduce_pain",
  "prevent_recurrence",
  "general_mobility",
] as const;

// Under a week, one to six weeks, longer.
export const ONSETS = ["acute", "subacute", "chronic"] as const;

export const AGE_BANDS = ["under_40", "40_64", "65_plus"] as const;

export const ACTIVITY_LEVELS = [
  "sedentary",
  "recreational",
  "trains_regularly",
  "competitive",
] as const;

// Stored but not yet read - the exercise exclusions these drive are Part 2.
export const AGGRAVATORS = ["stairs", "overhead", "sitting", "impact", "loaded_flexion"] as const;

export const CONDITIONS = ["autoimmune", "diabetes", "osteoporosis"] as const;

// Also stored and not yet read: filtering on it needs an `equipment` column
// that the seed script currently drops.
export const EQUIPMENT = ["none", "bands", "dumbbells", "full_gym"] as const;

export const SESSION_MINUTES = [5, 10, 20] as const;

// Each of these is a "see a doctor", not a "be careful": no dose is safe for
// someone who ticked one. Only catches what the structured questions ask -
// screening free text for the same disclosures is Part 3.
export const RED_FLAGS = [
  "numbness_or_weakness",
  "night_pain",
  "recent_trauma",
  "surgery_within_6_months",
  "pregnancy_related",
  "chest_pain_on_exertion",
  "fever_or_weight_loss",
] as const;

export type Goal = (typeof GOALS)[number];
export type Onset = (typeof ONSETS)[number];
export type AgeBand = (typeof AGE_BANDS)[number];
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];
export type Aggravator = (typeof AGGRAVATORS)[number];
export type Condition = (typeof CONDITIONS)[number];
export type Equipment = (typeof EQUIPMENT)[number];
export type SessionMinutes = (typeof SESSION_MINUTES)[number];
export type RedFlag = (typeof RED_FLAGS)[number];

export type Answers = {
  goal: Goal;
  // What hurts, as typed. Resolved to a body region at generation time by
  // `matchRegion`, not here.
  region: string;
  onset: Onset;
  painNow: number;
  aggravators: Aggravator[];
  redFlags: RedFlag[];
  ageBand: AgeBand;
  conditions: Condition[];
  equipment: Equipment[];
  activityLevel: ActivityLevel;
  sessionMinutes: SessionMinutes;
};

export type Limits = {
  sets: { min: number; max: number };
  reps: { min: number; max: number };
  count: { min: number; max: number };
  // The rules that fired, in the words shown to the user.
  reasons: string[];
};

// The widest plan anyone can get. Rules only lower a ceiling; nothing raises
// one and nothing moves a floor.
const ABSOLUTE = {
  sets: { min: 1, max: 4 },
  reps: { min: 5, max: 15 },
  count: { min: 2, max: 5 },
} as const;

type Rule = {
  id: string;
  reason: string;
  when: (answers: Answers) => boolean;
  cap: { sets?: number; reps?: number; count?: number };
};

// Not risk tiers: tiers collapse everyone who trips any threshold into one
// bucket, so someone who is 70 with pain of 2 comes out the same as someone
// who is 30 with pain of 8. Here the caps stack.
const RULES: Rule[] = [
  {
    id: "high_pain",
    reason: "your pain is 7 or above",
    when: (a) => a.painNow >= 7,
    cap: { sets: 2, reps: 8, count: 3 },
  },
  {
    id: "moderate_pain",
    reason: "your pain is in the 4 to 6 range",
    when: (a) => a.painNow >= 4 && a.painNow < 7,
    cap: { sets: 3, reps: 12 },
  },
  {
    id: "acute",
    reason: "this flared up recently",
    when: (a) => a.onset === "acute",
    cap: { sets: 2, count: 3 },
  },
  {
    id: "chronic",
    reason: "this has been going on a while",
    when: (a) => a.onset === "chronic",
    cap: { sets: 3, reps: 12 },
  },
  {
    id: "older_adult",
    reason: "you are 65 or over",
    when: (a) => a.ageBand === "65_plus",
    cap: { sets: 2, reps: 10 },
  },
  {
    id: "condition",
    reason: "you told us about a long-term condition",
    when: (a) => a.conditions.length > 0,
    cap: { sets: 2, reps: 10 },
  },
  {
    id: "sedentary",
    reason: "you are not training at the moment",
    when: (a) => a.activityLevel === "sedentary",
    cap: { sets: 2 },
  },
  {
    id: "short_session",
    reason: "your sessions are 5 minutes",
    when: (a) => a.sessionMinutes <= 5,
    cap: { count: 2 },
  },
  {
    id: "medium_session",
    reason: "your sessions are 10 minutes or less",
    when: (a) => a.sessionMinutes <= 10,
    cap: { count: 3 },
  },
];

/**
 * Whether these answers rule out generating a plan.
 *
 * Asked twice - when the answers are saved, and again when a plan is generated
 * from them - because a check that only ran at capture could be skipped by
 * posting an onboarding id straight to the generate route.
 */
export function hasRedFlag(answers: Answers): boolean {
  return answers.redFlags.length > 0;
}

/** The numbers a plan built from these answers has to stay inside. */
export function getLimits(answers: Answers): Limits {
  const fired = RULES.filter((rule) => rule.when(answers));

  // Annotated because `as const` on ABSOLUTE would otherwise make these
  // literal types, and the minimum could not be assigned back.
  let sets: number = ABSOLUTE.sets.max;
  let reps: number = ABSOLUTE.reps.max;
  let count: number = ABSOLUTE.count.max;

  for (const rule of fired) {
    sets = Math.min(sets, rule.cap.sets ?? sets);
    reps = Math.min(reps, rule.cap.reps ?? reps);
    count = Math.min(count, rule.cap.count ?? count);
  }

  // Enough rules at once can pull a ceiling under its own floor, and nothing
  // can satisfy a range like 2-1. The floor wins.
  return {
    sets: { min: ABSOLUTE.sets.min, max: Math.max(ABSOLUTE.sets.min, sets) },
    reps: { min: ABSOLUTE.reps.min, max: Math.max(ABSOLUTE.reps.min, reps) },
    count: { min: ABSOLUTE.count.min, max: Math.max(ABSOLUTE.count.min, count) },
    reasons: fired.map((rule) => rule.reason),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Pins a dose the model chose into what `limits` allows.
 *
 * A placeholder: clamping is safe but hides that the model ignored its bounds,
 * and can leave an odd pair - 4 sets clamped to 2 while 15 reps stays 15.
 * Part 3 puts the limits in the prompt and rejects instead.
 */
export function clampDose(
  sets: number,
  reps: number,
  limits: Limits
): { sets: number; reps: number } {
  return {
    sets: clamp(sets, limits.sets.min, limits.sets.max),
    reps: clamp(reps, limits.reps.min, limits.reps.max),
  };
}
