// The rules layer: what the questionnaire asks, what stops a plan being
// generated, and the numbers a generated plan has to stay inside.
//
// This file has no imports on purpose. Nothing here reads the database or
// calls Gemini, so its tests need no environment at all.
//
// None of these numbers has been reviewed by a physiotherapist. Keeping them
// in one file is what lets a clinician read and change them in one place.
//
// Where a number has a published source, the comment beside it names the
// source's id in eval/REFERENCES.md, which says how each one was read.
// "Judgment" means no source was found for it.

// The goal is the person's own words, not a choice from a list. No rule here
// reads it - only the generation prompt does - so a fixed list bought nothing
// and lost most of what they meant. These are the suggestions the
// questionnaire offers to tap instead of typing. They are our words, so a goal
// that is exactly one of them has nothing in it to screen.
export const GOAL_EXAMPLES = [
  "Get back to moving normally",
  "Reduce pain",
  "Stop it coming back",
  "Move more freely in general",
] as const;

// Long enough for "run a 5k again by spring without my knee flaring up",
// short enough to stay a goal rather than a second note. The database
// enforces the same number.
export const GOAL_MAX_LENGTH = 200;

// Under a week, one to six weeks, longer.
export const ONSETS = ["acute", "subacute", "chronic"] as const;

// Skewed young on purpose: the app is aimed at a younger audience, so the
// detail goes where most users are and everyone 50 and over shares one band.
export const AGE_BANDS = ["under_30", "30_49", "50_plus"] as const;

export const ACTIVITY_LEVELS = [
  "sedentary",
  "recreational",
  "trains_regularly",
  "competitive",
] as const;

// Each one leaves exercises out of the candidate list, via the hand-authored
// `aggravator_exclusions` table - not decided here, because which exercises
// "stairs" rules out is data about the catalogue, not a rule about the person.
export const AGGRAVATORS = ["stairs", "overhead", "sitting", "impact", "loaded_flexion"] as const;

export const CONDITIONS = ["autoimmune", "diabetes", "osteoporosis"] as const;

// What someone owns. Translated into the catalogue's own equipment names in
// models/regimes.ts, which is the only place that knows both vocabularies.
export const EQUIPMENT = ["none", "bands", "dumbbells", "full_gym"] as const;

export const SESSION_MINUTES = [5, 10, 20] as const;

// The catalogue's own `level` and `category` values, in the order a ceiling
// moves through them. Not answers - nobody is asked these - but what the
// rules below restrict.
export const DIFFICULTIES = ["beginner", "intermediate", "expert"] as const;
export const CATEGORIES = ["stretching", "strength"] as const;

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

export type Onset = (typeof ONSETS)[number];
export type AgeBand = (typeof AGE_BANDS)[number];
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];
export type Aggravator = (typeof AGGRAVATORS)[number];
export type Condition = (typeof CONDITIONS)[number];
export type Equipment = (typeof EQUIPMENT)[number];
export type SessionMinutes = (typeof SESSION_MINUTES)[number];
export type RedFlag = (typeof RED_FLAGS)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];
export type Category = (typeof CATEGORIES)[number];

export type Answers = {
  // In their own words, screened with the note. Nothing in this file reads it.
  goal: string;
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

// How an exercise is dosed: a count of repetitions, or a held position timed
// in seconds. Decided by the catalogue (a `static` exercise is a hold), never
// by the model.
export const UNITS = ["reps", "hold"] as const;
export type Unit = (typeof UNITS)[number];

export type Limits = {
  sets: { min: number; max: number };
  reps: { min: number; max: number };
  // Seconds per hold, for exercises dosed as a hold rather than reps.
  hold: { min: number; max: number };
  count: { min: number; max: number };
  // The hardest catalogue level allowed, and the kinds of exercise allowed.
  // These decide which exercises are offered at all, where the three above
  // only decide how much of each.
  difficultyCap: Difficulty;
  categories: Category[];
  // The rules that fired, in the words shown to the user.
  reasons: string[];
};

// The widest plan anyone can get. Rules only lower a ceiling; nothing raises
// one and nothing moves a floor.
const ABSOLUTE = {
  // Source: AAOS-* (2-3 sets for most exercises, 3-4 for shoulder rotation).
  sets: { min: 1, max: 4 },
  // Source: ACSM-RT-2009 (8-12 for novices) and AAOS-* (mostly 8-12). Stricter
  // than AAOS's 20-rep hip and shoulder endurance work. The floor of 5 is
  // judgment.
  reps: { min: 5, max: 15 },
  // General fitness guidance usually quotes 10-30s per static stretch. The
  // floor is 15 because a shorter hold is barely a stretch.
  //
  // Source: ACSM-FLEX-2021 (10-30s for most adults). Stricter than AAOS-KNEE
  // and AAOS-HIP, which hold knee and hamstring stretches 30-60s. This range
  // also doses isometric holds like a plank, which AAOS-SPINE holds 15-30s.
  hold: { min: 15, max: 30 },
  // Judgment. The AAOS programs list 9-18 exercises across 4-6 weeks, not a
  // per-session count, so they don't compare.
  count: { min: 2, max: 5 },
} as const;

// Where the difficulty ceiling starts, before any rule lowers it. Not a rule
// itself, so it adds nothing to `reasons`: being a recreational exerciser is
// not something a plan was restricted *because of*, it is just the starting
// point. A rule can only take this lower, never higher.
//
// Source: ACSM-RT-2009 sorts people into novice, intermediate and advanced by
// training experience - untrained or not training for years, about six months
// of consistent training, years of it - which is roughly the same ladder.
const ACTIVITY_DIFFICULTY: Record<ActivityLevel, Difficulty> = {
  sedentary: "beginner",
  recreational: "beginner",
  trains_regularly: "intermediate",
  competitive: "expert",
};

type Rule = {
  id: string;
  reason: string;
  when: (answers: Answers) => boolean;
  cap: {
    sets?: number;
    reps?: number;
    hold?: number;
    count?: number;
    difficulty?: Difficulty;
    // The only categories this rule allows. Rules intersect, the same way the
    // numeric caps take the minimum.
    categories?: Category[];
  };
};

// Not risk tiers: tiers collapse everyone who trips any threshold into one
// bucket, so someone who is 70 with pain of 2 comes out the same as someone
// who is 30 with pain of 8. Here the caps stack.
//
// Every number in these rules is judgment. No source we read says what to cut
// at a given pain level, age or session length. Where a source agrees or
// disagrees with a rule, the rule says so.
const RULES: Rule[] = [
  {
    id: "high_pain",
    reason: "your pain is 7 or above",
    when: (a) => a.painNow >= 7,
    // Loaded strength work is what a conservative default refuses at this
    // level of pain.
    // Shorter holds too: gentle is the point, and a long hold at this level of
    // pain is not gentle.
    cap: { sets: 2, reps: 8, hold: 20, count: 3, categories: ["stretching"] },
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
    // Under a week old. Same reasoning as high pain: no loaded work on a
    // fresh flare.
    //
    // Stricter than APTA-LBP-2021 for the lower back, which allows trunk
    // muscle activation in acute low back pain (grade C, "can use").
    cap: { sets: 2, hold: 20, count: 3, categories: ["stretching"] },
  },
  {
    id: "chronic",
    reason: "this has been going on a while",
    when: (a) => a.onset === "chronic",
    // Consistent with APTA-LBP-2021, which says to use trunk strengthening and
    // endurance for chronic low back pain (grade A). This still allows it.
    cap: { sets: 3, reps: 12 },
  },
  {
    id: "older_adult",
    // Was 65+ until the bands moved younger. Keeping the same caps at 50 is
    // the cautious reading of a band that now starts 15 years earlier.
    //
    // Consistent with APTA-LBP-2021 (general exercise for older adults with
    // chronic low back pain, grade A). Runs against ACSM-FLEX-2021, which
    // suggests 30-60s holds for older people - nothing here lengthens a hold.
    reason: "you are 50 or over",
    when: (a) => a.ageBand === "50_plus",
    cap: { sets: 2, reps: 10, difficulty: "beginner" },
  },
  {
    id: "condition",
    reason: "you told us about a long-term condition",
    when: (a) => a.conditions.length > 0,
    cap: { sets: 2, reps: 10, difficulty: "beginner" },
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

/** Every rule's id, so the eval can check its fixtures fire each one. */
export const RULE_IDS = RULES.map((rule) => rule.id);

/** The ids of the rules these answers fire - what `getLimits` applies. */
export function firedRules(answers: Answers): string[] {
  return RULES.filter((rule) => rule.when(answers)).map((rule) => rule.id);
}

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
  let hold: number = ABSOLUTE.hold.max;
  let count: number = ABSOLUTE.count.max;
  // Held as a position on the ladder so "lower" is just a smaller number.
  let difficulty = DIFFICULTIES.indexOf(ACTIVITY_DIFFICULTY[answers.activityLevel]);
  let categories: Category[] = [...CATEGORIES];

  for (const rule of fired) {
    sets = Math.min(sets, rule.cap.sets ?? sets);
    reps = Math.min(reps, rule.cap.reps ?? reps);
    hold = Math.min(hold, rule.cap.hold ?? hold);
    count = Math.min(count, rule.cap.count ?? count);

    if (rule.cap.difficulty !== undefined) {
      difficulty = Math.min(difficulty, DIFFICULTIES.indexOf(rule.cap.difficulty));
    }

    if (rule.cap.categories !== undefined) {
      const allowed = rule.cap.categories;
      categories = categories.filter((category) => allowed.includes(category));
    }
  }

  // Two rules allowing different categories would intersect to none, and a
  // plan with no allowed exercises is not a plan. Stretching is the most
  // conservative thing there is, so it is what is left - the same "the
  // cautious end wins" call as the floors below.
  if (categories.length === 0) {
    categories = ["stretching"];
  }

  // Enough rules at once can pull a ceiling under its own floor, and nothing
  // can satisfy a range like 2-1. The floor wins.
  return {
    sets: { min: ABSOLUTE.sets.min, max: Math.max(ABSOLUTE.sets.min, sets) },
    reps: { min: ABSOLUTE.reps.min, max: Math.max(ABSOLUTE.reps.min, reps) },
    hold: { min: ABSOLUTE.hold.min, max: Math.max(ABSOLUTE.hold.min, hold) },
    count: { min: ABSOLUTE.count.min, max: Math.max(ABSOLUTE.count.min, count) },
    difficultyCap: DIFFICULTIES[difficulty],
    categories,
    reasons: fired.map((rule) => rule.reason),
  };
}

/**
 * The widest limits there are, for the type-a-body-part path that has no
 * questionnaire behind it. No rule has fired, so nothing is lowered - but a
 * plan is still validated against the absolute bounds, which is more than
 * that path had before.
 */
export function widestLimits(): Limits {
  return {
    sets: { ...ABSOLUTE.sets },
    reps: { ...ABSOLUTE.reps },
    hold: { ...ABSOLUTE.hold },
    count: { ...ABSOLUTE.count },
    difficultyCap: "expert",
    categories: [...CATEGORIES],
    reasons: [],
  };
}

// Long enough to say what the tick-boxes missed, short enough to keep the
// prompt small and the injection surface smaller. The database enforces the
// same number.
export const FREE_TEXT_MAX_LENGTH = 500;

// The verdicts a note can get. Stored per row - see the free-text migration
// for what each one means.
export const SCREENINGS = ["not_needed", "clear", "flagged", "crisis", "unavailable"] as const;
export type Screening = (typeof SCREENINGS)[number];

// Self-harm language, matched without a model so it is caught even when the
// classifier is down - the one case where an outage must not let anything
// through. The classifier is the wider net; these are the backstop.
//
// Deliberately narrow. This is an injury app, so "I hurt myself skiing" and
// "this workout is killing me" are ordinary sentences here, and sending
// someone with a sprained ankle to a crisis screen is its own kind of failure.
const CRISIS_PATTERNS = [
  /\bkill(ing)? myself\b/,
  /\bsuicid/,
  /\bself[- ]?harm/,
  /\bharm(ing)? myself\b/,
  /\bend(ing)? (it all|my life)\b/,
  /\btake my (own )?life\b/,
  /\bwant(ed)? to die\b/,
  /\bbetter off dead\b/,
  /\bno reason to (live|go on)\b/,
  /\bdon'?t want to (live|be alive|be here anymore)\b/,
];

/** Whether a note contains self-harm language the fixed patterns recognise. */
export function isCrisisText(text: string): boolean {
  // Curly apostrophes, as phones type them, become straight ones first.
  const normalised = text.toLowerCase().replace(/[\u2018\u2019]/g, "'");
  return CRISIS_PATTERNS.some((pattern) => pattern.test(normalised));
}

/**
 * What these answers lead to: a plan, a doctor, or crisis resources.
 *
 * Crisis comes first, ahead of a ticked red flag: someone who is both in pain
 * and at risk needs the crisis screen, not a referral. An `unavailable` note
 * reads as ready - unscreened text goes through when the classifier cannot be
 * reached, by decision (ADR 0021). The crisis patterns have already run on it.
 *
 * Asked twice, like the red flag always was - when the answers are saved, and
 * again when a plan is generated - so the first answer cannot be skipped.
 */
export function decide(
  answers: Answers,
  screening: Screening
): "ready" | "see_a_doctor" | "crisis" {
  if (screening === "crisis") {
    return "crisis";
  }

  if (hasRedFlag(answers) || screening === "flagged") {
    return "see_a_doctor";
  }

  return "ready";
}

// ---------------------------------------------------------------------------
// Validating a generated plan
// ---------------------------------------------------------------------------

/** One exercise of a plan the model proposed, before anything is saved. */
export type DraftItem = {
  id: string;
  unit: Unit;
  sets: number;
  // Exactly one of these is a number, the one `unit` names.
  reps: number | null;
  holdSeconds: number | null;
};

function outside(value: number | null, range: { min: number; max: number }): boolean {
  return value === null || !Number.isInteger(value) || value < range.min || value > range.max;
}

/**
 * Whether a proposed plan stays inside `limits`, using only exercises from
 * `allowed` (exercise id -> the unit the catalogue doses it in).
 *
 * Rejects rather than repairs - the clamp this replaced always produced a
 * safe dose, but hid that the model had ignored its bounds. Every problem is
 * listed, not just the first, because the list is fed back to the model as
 * the reason for one retry, and a retry told about one problem fixes one.
 *
 * Reads nothing the user wrote. A note can change what the model proposes;
 * it cannot change what this accepts.
 */
export function validateRegime(
  draft: DraftItem[],
  limits: Limits,
  allowed: Map<string, Unit>
): { ok: true } | { ok: false; problems: string[] } {
  const problems: string[] = [];

  if (draft.length < limits.count.min || draft.length > limits.count.max) {
    problems.push(
      `the plan has ${draft.length} exercises; it must have between ${limits.count.min} and ${limits.count.max}`
    );
  }

  const seen = new Set<string>();

  for (const item of draft) {
    if (seen.has(item.id)) {
      problems.push(`"${item.id}" appears more than once`);
      continue;
    }

    seen.add(item.id);

    const unit = allowed.get(item.id);

    if (unit === undefined) {
      problems.push(`"${item.id}" is not one of the exercises offered`);
      continue;
    }

    if (outside(item.sets, limits.sets)) {
      problems.push(
        `"${item.id}" has ${item.sets} sets; sets must be between ${limits.sets.min} and ${limits.sets.max}`
      );
    }

    if (item.unit !== unit) {
      problems.push(`"${item.id}" is dosed in ${unit}, not ${item.unit}`);
    } else if (unit === "reps" && (outside(item.reps, limits.reps) || item.holdSeconds !== null)) {
      problems.push(
        `"${item.id}" has ${item.reps} reps; reps must be between ${limits.reps.min} and ${limits.reps.max}`
      );
    } else if (unit === "hold" && (outside(item.holdSeconds, limits.hold) || item.reps !== null)) {
      problems.push(
        `"${item.id}" is held for ${item.holdSeconds}s; holds must be between ${limits.hold.min} and ${limits.hold.max} seconds`
      );
    }
  }

  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}

// ---------------------------------------------------------------------------
// Checking what a plan says
// ---------------------------------------------------------------------------

// Telling someone to carry on through pain. Every AAOS program says "You
// should not feel pain during an exercise" (SAFE-1, AAOS-* in
// eval/REFERENCES.md), so a rationale that says otherwise contradicts the one
// thing every source agrees on.
//
// "Push through" alone is not enough to match: "push through your heels" is
// an ordinary cue for a bridge. It has to be pain being pushed through.
const THROUGH_PAIN = [
  /\b(push|work|power|fight|grit)(ing)? through (the |any |your )?(pain|discomfort|hurt)/,
  /\bno pain,? no gain\b/,
  /\bignor(e|ing) (the |any |your )?(pain|discomfort)\b/,
  /\beven (if|when|though) it hurts\b/,
];

// Saying an exercise treats a condition. The sources present their programs
// as general conditioning done under a doctor's supervision, and ADR 0016
// draws the same line: "this exercise treats your shoulder" is a clinical
// claim the app cannot make (SAFE-2).
//
// Whole words with their own endings, so "healthy" is not "heal".
const TREATMENT_CLAIM = /\b(treat(s|ing|ment)?|heal(s|ing|ed)?|cure(s|d)?|repair(s|ing|ed)?)\b/;

/**
 * What is wrong with the rationales a plan came with, in words the model is
 * told on a retry. Empty when nothing is.
 *
 * A hard check, like `validateRegime`: a plan that fails it is never saved,
 * however well it does otherwise (ADR 0024).
 */
export function checkRationales(rationales: Map<string, string>): string[] {
  const problems: string[] = [];

  for (const [id, rationale] of rationales) {
    // Curly apostrophes, as models sometimes write them, become straight ones.
    const text = rationale.toLowerCase().replace(/[‘’]/g, "'");

    if (THROUGH_PAIN.some((pattern) => pattern.test(text))) {
      problems.push(
        `the rationale for "${id}" tells the user to carry on through pain; no exercise should hurt, so say to stop if it does`
      );
    }

    const claim = TREATMENT_CLAIM.exec(text);

    if (claim !== null) {
      problems.push(
        `the rationale for "${id}" claims the exercise treats a condition ("${claim[0]}"); say what the exercise works, not what it cures`
      );
    }
  }

  return problems;
}

// ---------------------------------------------------------------------------
// Adjusting a plan to how the pain is going
// ---------------------------------------------------------------------------

// The pain tracker's check-ins, as far as a trend needs them.
export type PainPoint = { day: string; pain: number };

// A check-in as the adjustment reads it.
export type CheckInPoint = PainPoint & { didExercises: boolean; updatedAt: string };

export type Trend = "not_enough" | "better" | "steady" | "worse";

// The latest this many check-ins are compared with the ones before them, so
// a single good or bad day can't move the plan.
export const TREND_WINDOW = 3;

// How many check-ins there must be to compare the latest ones with. Two, so
// that one unusual day on its own can't be what the trend is measured from.
const MIN_EARLIER = 2;

export const MIN_CHECK_INS = TREND_WINDOW + MIN_EARLIER;

// Only this many days count, today included: a trend is about how someone is
// doing now, and a check-in from months ago says nothing about that.
export const WINDOW_DAYS = 7;

// A move of 2 points on the 0-10 scale is about the smallest change in pain
// people notice as real (Farrar et al. 2001). Judgment that it is what should
// change a plan.
const MEANINGFUL_CHANGE = 2;

// Pain this bad stops the exercises, whichever way it is heading - the same
// line the questionnaire's pain rule draws, and PRODUCT.md's default for a
// single check-in. Pending clinical sign-off, like the other thresholds.
const STOP_AT = 7;

// One step of a dose. Judgment: small enough that a step either way is gentle.
const REPS_STEP = 2;
const HOLD_STEP = 5;

const average = (points: PainPoint[]) => points.reduce((sum, p) => sum + p.pain, 0) / points.length;

/**
 * Better, worse or steady: the average of the latest `TREND_WINDOW` check-ins
 * against all the ones before them. Needs `MIN_CHECK_INS` to say anything.
 * `points` are oldest first, and already only the ones that should count.
 */
export function painTrend(points: PainPoint[]): { trend: Trend; earlier: number | null; recent: number | null } {
  if (points.length < MIN_CHECK_INS) {
    return { trend: "not_enough", earlier: null, recent: null };
  }

  const recent = average(points.slice(-TREND_WINDOW));
  const earlier = average(points.slice(0, -TREND_WINDOW));
  const change = recent - earlier;

  const trend = change <= -MEANINGFUL_CHANGE ? "better" : change >= MEANINGFUL_CHANGE ? "worse" : "steady";

  return { trend, earlier, recent };
}

const clamp = (value: number, range: { min: number; max: number }) =>
  Math.min(range.max, Math.max(range.min, value));

/**
 * The plan one step harder (`up`) or easier, inside `limits`. Each exercise's
 * reps or hold moves first; once that is at its limit, a set is added or
 * taken away instead. Exercises already at the limit stay as they are.
 */
export function stepDoses(items: DraftItem[], direction: "up" | "down", limits: Limits): DraftItem[] {
  const sign = direction === "up" ? 1 : -1;

  return items.map((item) => {
    const range = item.unit === "hold" ? limits.hold : limits.reps;
    const amount = (item.unit === "hold" ? item.holdSeconds : item.reps) ?? range.min;
    const moved = clamp(amount + sign * (item.unit === "hold" ? HOLD_STEP : REPS_STEP), range);
    const sets = moved === amount ? clamp(item.sets + sign, limits.sets) : item.sets;

    return {
      ...item,
      sets,
      reps: item.unit === "reps" ? moved : null,
      holdSeconds: item.unit === "hold" ? moved : null,
    };
  });
}

export type Adjustment = {
  trend: Trend;
  earlier: number | null;
  recent: number | null;
  // What to do about it, worded for the person.
  advice: string;
  // The doses to switch to, or null when nothing should change.
  proposed: DraftItem[] | null;
  // True when the plan has outgrown its limits: pain is better, every dose is
  // already at the top, and the limits were lowered by the questionnaire's
  // rules. Those were set by answers that may no longer be true, so a new
  // questionnaire is the way to looser ones - nothing here raises a limit.
  retake: boolean;
  // Pain is high enough that the advice is to stop the exercises.
  stop: boolean;
};

type Dose = Pick<DraftItem, "id" | "sets" | "reps" | "holdSeconds">;

/** Whether two lists are the same exercises at the same doses, in the same order. */
export function sameDoses(a: Dose[], b: Dose[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (dose, i) =>
        dose.id === b[i].id && dose.sets === b[i].sets && dose.reps === b[i].reps && dose.holdSeconds === b[i].holdSeconds
    )
  );
}

// "2026-11-02", `offset` days from another such date.
function addDays(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/**
 * What the last week of check-ins says to do with a plan. Only ever a
 * suggestion, which the person applies or doesn't. Never adds or swaps
 * exercises, and never goes outside `limits`.
 *
 * `checkIns` are oldest first. `today` is the person's own date. The trend
 * only counts check-ins saved since `dosesChangedAt`, so the trend that led to
 * one change can't lead straight to another. High pain counts whenever it was
 * saved: changing a dose doesn't make it go away.
 */
export function adjustPlan(
  items: DraftItem[],
  checkIns: CheckInPoint[],
  limits: Limits,
  { today, dosesChangedAt }: { today: string; dosesChangedAt: string }
): Adjustment {
  const firstDay = addDays(today, 1 - WINDOW_DAYS);
  const week = checkIns.filter((checkIn) => checkIn.day >= firstDay);
  const counted = week.filter((checkIn) => checkIn.updatedAt >= dosesChangedAt);

  const { trend, earlier, recent } = painTrend(counted);
  const noChange = (advice: string, extra: { retake?: boolean; stop?: boolean } = {}): Adjustment => ({
    trend,
    earlier,
    recent,
    advice,
    proposed: null,
    retake: false,
    stop: false,
    ...extra,
  });

  // First, and needing no trend: one check-in at this level is enough, and a
  // steady or falling pain that is still this high is no reason to carry on.
  const latest = week.slice(-TREND_WINDOW);

  if (latest.length > 0 && (latest[latest.length - 1].pain >= STOP_AT || average(latest) >= STOP_AT)) {
    return noChange("Your pain is high. Stop the exercises and talk to a doctor or physiotherapist.", { stop: true });
  }

  if (trend === "not_enough") {
    return noChange(`Check in on at least ${MIN_CHECK_INS} days in a week and we'll see whether your plan should change.`);
  }

  if (trend === "steady") {
    return noChange("Your pain is holding steady, so keep the plan as it is.");
  }

  // Pain falling without the exercises says nothing about whether they are
  // too easy. Only this direction: a lighter plan is still the safe answer to
  // pain getting worse, done or not. "Most" is judgment.
  const done = counted.filter((checkIn) => checkIn.didExercises).length;

  if (trend === "better" && done * 2 <= counted.length) {
    return noChange(
      `Your pain is improving, but you did the exercises on only ${done} of your last ${counted.length} check-ins. Keep the plan as it is until you're doing them most days.`
    );
  }

  const proposed = stepDoses(items, trend === "better" ? "up" : "down", limits);

  if (sameDoses(proposed, items)) {
    if (trend === "worse") {
      return noChange("Your pain is getting worse, and your plan is already as light as it goes. Talk to a doctor or physiotherapist.");
    }

    const retake = limits.reasons.length > 0;

    return noChange(
      retake
        ? "Your pain is improving, and your plan is already at the most its limits allow. Those limits came from how you were doing when you filled in the questionnaire - fill it in again for a plan that fits how you are now."
        : "Your pain is improving, and your plan is already at the most it can be.",
      { retake }
    );
  }

  return {
    ...noChange(
      trend === "better"
        ? "Your pain is improving. You could make the exercises a little harder."
        : "Your pain is getting worse. Make the exercises a little easier."
    ),
    proposed,
  };
}
