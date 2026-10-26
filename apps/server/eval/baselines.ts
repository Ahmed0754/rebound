// The two plan makers that use no model at all (piece B). They are what
// "why use AI at all?" is answered against: if Gemini only ties them, the
// report says so.
//
// Both choose from the fixture's frozen candidates and dose every exercise at
// the midpoint of each limit, so they always pass the hard checks and differ
// from Gemini only in which exercises they pick. Neither looks at the
// criteria in quality.ts - a baseline that aimed at the grader would win by
// construction, which would answer nothing.

import { checkQuality } from "../src/quality.js";
import type { Answers, Limits } from "../src/clinical.js";
import type { Candidate } from "../src/models/exercises.js";
import type { Quality } from "../src/models/regimes.js";
import type { RegimeItem } from "../src/types/index.js";

type Input = { id: string; answers: Answers; candidates: Candidate[] };

const midpoint = (range: { min: number; max: number }) => Math.round((range.min + range.max) / 2);

function dose(candidate: Candidate, limits: Limits): RegimeItem {
  const amount = midpoint(candidate.unit === "reps" ? limits.reps : limits.hold);

  return {
    id: candidate.id,
    name: candidate.name,
    description: candidate.description,
    unit: candidate.unit,
    sets: midpoint(limits.sets),
    reps: candidate.unit === "reps" ? amount : null,
    holdSeconds: candidate.unit === "hold" ? amount : null,
    // Nothing writes one. A rationale is something only the model offers.
    rationale: null,
  };
}

// A plan made in one go: its first plan is its only one.
function plan(picked: Candidate[], input: Input, limits: Limits) {
  const result = checkQuality(picked, input.candidates, {
    region: input.answers.region,
    answers: input.answers,
    limits,
  });
  const quality: Quality = { ...result, attempts: 1, firstMissed: result.missed };

  return { items: picked.map((candidate) => dose(candidate, limits)), quality };
}

// The same count for both, so neither wins by picking more.
const howMany = (input: Input, limits: Limits) => Math.min(midpoint(limits.count), input.candidates.length);

// Mulberry32, seeded from the fixture id: the same fixture gets the same
// random plan every run, so two reports differ only where the code did.
function seeded(id: string) {
  let state = [...id].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 2654435761), 2166136261);

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Any `count` of the candidates, chosen at random: better than chance? */
export async function randomPlan(input: Input, limits: Limits) {
  const random = seeded(input.id);
  const pool = [...input.candidates];

  // Fisher-Yates, then the first few.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return plan(pool.slice(0, howMany(input, limits)), input, limits);
}

/**
 * A few `if` statements: take turns between the categories the limits allow,
 * and within each turn prefer an exercise for a muscle the plan does not
 * work yet. Ties go to catalogue order, so it is deterministic.
 */
export async function heuristicPlan(input: Input, limits: Limits) {
  const count = howMany(input, limits);
  const left = [...input.candidates].sort((a, b) => a.id.localeCompare(b.id));
  const picked: Candidate[] = [];
  const worked = new Set<string>();

  for (let turn = 0; picked.length < count && left.length > 0; turn++) {
    const category = limits.categories[turn % limits.categories.length];
    const fresh = (candidate: Candidate) => !candidate.primaryMuscles.some((muscle) => worked.has(muscle));
    const index = [
      (c: Candidate) => c.category === category && fresh(c),
      (c: Candidate) => c.category === category,
      fresh,
      () => true,
    ].reduce((found, test) => (found === -1 ? left.findIndex(test) : found), -1);

    const [chosen] = left.splice(index, 1);
    picked.push(chosen);
    chosen.primaryMuscles.forEach((muscle) => worked.add(muscle));
  }

  return plan(picked, input, limits);
}
