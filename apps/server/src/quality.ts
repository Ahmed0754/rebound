// The quality criteria a generated plan is checked against before it is saved
// (ADR 0024). Each one is a criterion from eval/REFERENCES.md - the ids match
// - and names the sources it comes from, so a miss can always be traced back
// to who said it.
//
// Only the criteria safe to enforce on every plan live here: the `core` ones
// from the AAOS programs, and those from a source read in full. The
// provisional ones extrapolate from guidelines about one condition to
// everyone with pain in that region, so the eval harness grades them offline
// and they never decide what gets saved.
//
// A check reads the catalogue's own tags (primary muscles, category, name).
// It knows nothing about anatomy beyond them, and nobody has reviewed the tags.
//
// Pure, like clinical.ts: no database and no Gemini, so the tests need neither.

import type { Answers, Category, Limits } from "./clinical.js";

/** What a check can see of an exercise: the catalogue's tags for it. */
export type Tagged = {
  id: string;
  name: string;
  primaryMuscles: string[];
  category: string;
};

/** What a criterion needs to know about the person and the plan's bounds. */
export type QualityContext = {
  // The region as `region_muscles` names it, already matched.
  region: string;
  answers: Answers;
  limits: Limits;
};

export type Criterion = {
  id: string;
  // Source ids from eval/REFERENCES.md. Never empty: a criterion nobody can
  // credit is not one the app should enforce.
  sources: [string, ...string[]];
  // Whether the criterion asks anything of this plan at all.
  appliesTo: (context: QualityContext) => boolean;
  // Whether a list of exercises meets it. Run on the plan, and first on the
  // candidates: a criterion none of them could meet is not held against the
  // plan.
  meets: (exercises: Tagged[]) => boolean;
  // What the model is told on a retry, when a plan misses it.
  ask: string;
};

// Exported for the eval's provisional criteria (eval/graders.ts), so both
// read the tags the same way.
export const allows = (limits: Limits, category: Category) => limits.categories.includes(category);

export const targets = (exercise: Tagged, muscles: string[]) =>
  exercise.primaryMuscles.some((muscle) => muscles.includes(muscle));

// Met by any one exercise that passes `test`.
export const any = (test: (exercise: Tagged) => boolean) => (exercises: Tagged[]) => exercises.some(test);

export const isStretch = (exercise: Tagged) => exercise.category === "stretching";
export const isStrength = (exercise: Tagged) => exercise.category === "strength";

const AAOS_ALL: [string, ...string[]] = [
  "AAOS-KNEE",
  "AAOS-SHOULDER",
  "AAOS-HIP",
  "AAOS-SPINE",
  "AAOS-FOOTANKLE",
];

export const CRITERIA: Criterion[] = [
  {
    // Every AAOS program stretches and strengthens in the same session.
    id: "ALL-1",
    sources: AAOS_ALL,
    appliesTo: ({ limits }) => allows(limits, "stretching") && allows(limits, "strength"),
    meets: (exercises) => exercises.some(isStretch) && exercises.some(isStrength),
    ask: "Include at least one stretching exercise and at least one strength exercise.",
  },
  {
    id: "KNEE-1",
    sources: ["AAOS-KNEE"],
    appliesTo: ({ region }) => region === "knee",
    meets: any((e) => targets(e, ["quadriceps", "hamstrings"])),
    ask: "Include at least one exercise for the quadriceps or hamstrings.",
  },
  {
    id: "HIP-1",
    sources: ["AAOS-HIP"],
    appliesTo: ({ region, limits }) => region === "hip" && allows(limits, "strength"),
    meets: any((e) => isStrength(e) && targets(e, ["abductors", "glutes"])),
    ask: "Include at least one strength exercise for the glutes or hip abductors.",
  },
  {
    id: "HAM-3",
    sources: ["AAOS-KNEE", "AAOS-HIP"],
    appliesTo: ({ region, limits }) => region === "hamstring" && allows(limits, "stretching"),
    meets: any((e) => isStretch(e) && targets(e, ["hamstrings"])),
    ask: "Include at least one hamstring stretch.",
  },
  {
    id: "CALF-2",
    sources: ["AAOS-FOOTANKLE", "AAOS-KNEE"],
    appliesTo: ({ region, limits }) => region === "calf" && allows(limits, "stretching"),
    meets: any((e) => isStretch(e) && targets(e, ["calves"])),
    ask: "Include at least one calf stretch.",
  },
  {
    // Grade A ("should use") for chronic low back pain, from a guideline read
    // in full - which is why this one is enforced though it is about one
    // condition. The guideline's condition is the region itself.
    id: "LBACK-1",
    sources: ["APTA-LBP-2021", "AAOS-SPINE"],
    appliesTo: ({ region, answers, limits }) =>
      region === "lower back" && answers.onset === "chronic" && allows(limits, "strength"),
    meets: any((e) => isStrength(e) && targets(e, ["abdominals", "lower back"])),
    ask: "Include at least one trunk strengthening exercise for the abdominals or lower back.",
  },
  {
    id: "LBACK-4",
    sources: ["AAOS-SPINE"],
    appliesTo: ({ region, limits }) => region === "lower back" && allows(limits, "stretching"),
    meets: any((e) => isStretch(e) && targets(e, ["lower back", "glutes", "hamstrings"])),
    ask: "Include at least one stretch for the lower back, glutes or hamstrings.",
  },
  {
    // The catalogue has no rotator-cuff tag, so this goes by name - the
    // least reliable check here.
    id: "SHLDR-1",
    sources: ["AAOS-SHOULDER"],
    appliesTo: ({ region, limits }) => region === "shoulder" && allows(limits, "strength"),
    meets: any((e) => isStrength(e) && /rotation/i.test(e.name)),
    ask: "Include at least one internal or external rotation exercise for the rotator cuff.",
  },
  {
    id: "SHLDR-2",
    sources: ["AAOS-SHOULDER"],
    appliesTo: ({ region, limits }) => region === "shoulder" && allows(limits, "strength"),
    meets: any((e) => isStrength(e) && targets(e, ["traps", "middle back"])),
    ask: "Include at least one strength exercise for the trapezius or upper back.",
  },
  {
    id: "SHLDR-3",
    sources: ["AAOS-SHOULDER"],
    appliesTo: ({ region, limits }) => region === "shoulder" && allows(limits, "stretching"),
    meets: any((e) => isStretch(e) && targets(e, ["shoulders"])),
    ask: "Include at least one shoulder stretch.",
  },
];

/** Where each criterion ended up for one plan, by id. */
export type QualityResult = {
  met: string[];
  missed: string[];
  // The plan's region or limits mean it asks nothing here.
  notApplicable: string[];
  // It applies, but none of the candidates could meet it, so it is not held
  // against the plan.
  unsatisfiable: string[];
};

/** Checks a plan against every live criterion. `plan` is what was picked from `candidates`. */
export function checkQuality(
  plan: Tagged[],
  candidates: Tagged[],
  context: QualityContext
): QualityResult {
  return checkCriteria(CRITERIA, plan, candidates, context);
}

/** The same check against any list of criteria; the eval runs it on ones the app never enforces. */
export function checkCriteria(
  criteria: Pick<Criterion, "id" | "appliesTo" | "meets">[],
  plan: Tagged[],
  candidates: Tagged[],
  context: QualityContext
): QualityResult {
  const result: QualityResult = { met: [], missed: [], notApplicable: [], unsatisfiable: [] };

  for (const criterion of criteria) {
    if (!criterion.appliesTo(context)) {
      result.notApplicable.push(criterion.id);
    } else if (!criterion.meets(candidates)) {
      result.unsatisfiable.push(criterion.id);
    } else if (criterion.meets(plan)) {
      result.met.push(criterion.id);
    } else {
      result.missed.push(criterion.id);
    }
  }

  return result;
}

/** What to tell the model about each missed criterion, for the retry. */
export function asksFor(missed: string[]): string[] {
  return CRITERIA.filter((criterion) => missed.includes(criterion.id)).map(
    (criterion) => `${criterion.ask} (${criterion.id})`
  );
}
