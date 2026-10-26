// The code checks the eval runs on every plan (piece A). Pure, like
// clinical.ts and quality.ts, which do most of the work.
//
// Four kinds, reported apart:
//  - hard: the checks a plan has to pass to be saved at all. A Gemini plan
//    passed them already; a baseline's plan (piece B) may not have.
//  - quality: the live criteria from quality.ts, the same as the live check.
//  - benchmarks: where a dose sits outside what REFERENCES.md §2 says the
//    sources prescribe. Notes, not failures: Rebound is often stricter on
//    purpose, and the report says so rather than marking it down.
//  - shape: doses all pinned at the ceiling, and exercises that repeat one
//    movement pattern.
//
// A failed generation is graded as an empty plan, so it misses every
// criterion it could have met instead of dropping out of the averages.

import { checkRationales, validateRegime, type Answers, type Limits } from "../src/clinical.js";
import type { Candidate } from "../src/models/exercises.js";
import { checkQuality, CRITERIA, type QualityResult } from "../src/quality.js";
import type { RegimeItem } from "../src/types/index.js";

// Bump when a check is added or changed, so reports graded differently are
// never compared as if they were the same.
export const RUBRIC_VERSION = "A.1";

type Benchmark = {
  id: string;
  // Source ids from eval/REFERENCES.md.
  sources: string[];
  // A note when the item is outside what the sources say, else null.
  check: (item: RegimeItem, tags: Candidate) => string | null;
};

// REFERENCES.md §2, the rows a single plan item can be compared with.
const BENCHMARKS: Benchmark[] = [
  {
    id: "BENCH-HOLD",
    sources: ["AAOS-KNEE", "AAOS-SHOULDER", "AAOS-HIP", "AAOS-FOOTANKLE"],
    check: (item, tags) =>
      tags.category === "stretching" && item.holdSeconds !== null && item.holdSeconds < 30
        ? `held ${item.holdSeconds}s; AAOS holds stretches for 30s or more`
        : null,
  },
  {
    id: "BENCH-REPS",
    sources: ["ACSM-RT-2009", "AAOS-KNEE", "AAOS-HIP"],
    check: (item, tags) =>
      tags.category === "strength" && item.reps !== null && (item.reps < 8 || item.reps > 12)
        ? `${item.reps} reps; ACSM's novice range and most AAOS work is 8-12`
        : null,
  },
  {
    id: "BENCH-SETS",
    sources: ["AAOS-KNEE", "AAOS-SHOULDER", "AAOS-HIP", "AAOS-SPINE", "AAOS-FOOTANKLE"],
    check: (item) =>
      item.sets < 2 || item.sets > 3 ? `${item.sets} sets; AAOS mostly prescribes 2-3` : null,
  },
];

export type Grade = {
  // What would have stopped it being saved. Empty when nothing would.
  hard: string[];
  quality: QualityResult;
  benchmarks: { id: string; exercise: string; note: string }[];
  // Every exercise at its sets ceiling and its reps or hold ceiling.
  pinned: boolean;
  // Groups of exercise ids that look like the same movement.
  overlap: string[][];
};

// An approximation: the catalogue has no movement-pattern field, so two
// exercises with the same category, force, mechanic and first primary muscle
// are taken to be the same movement. A seated and a standing calf raise are;
// a calf raise and a calf stretch are not.
function pattern(tags: Candidate): string {
  return [tags.category, tags.force ?? "-", tags.mechanic ?? "-", tags.primaryMuscles[0] ?? "-"].join("|");
}

function atCeiling(item: RegimeItem, limits: Limits): boolean {
  const amount = item.unit === "reps" ? item.reps : item.holdSeconds;
  const max = item.unit === "reps" ? limits.reps.max : limits.hold.max;
  return item.sets === limits.sets.max && amount === max;
}

/** Grades one plan made from `candidates`, or a failed generation when `plan` is null. */
export function grade(
  plan: RegimeItem[] | null,
  candidates: Candidate[],
  context: { region: string; answers: Answers; limits: Limits }
): Grade {
  const items = plan ?? [];
  const tags = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const quality = checkQuality(
    // An id that is not a candidate is caught by the hard checks; quality
    // only grades what it can see.
    items.flatMap((item) => tags.get(item.id) ?? []),
    candidates,
    context
  );

  if (plan === null) {
    return { hard: ["no plan was generated"], quality, benchmarks: [], pinned: false, overlap: [] };
  }

  const verdict = validateRegime(
    items.map(({ id, unit, sets, reps, holdSeconds }) => ({ id, unit, sets, reps, holdSeconds })),
    context.limits,
    new Map(candidates.map((candidate) => [candidate.id, candidate.unit]))
  );
  const hard = [
    ...(verdict.ok ? [] : verdict.problems),
    ...checkRationales(new Map(items.map((item) => [item.id, item.rationale ?? ""]))),
  ];

  const benchmarks = items.flatMap((item) => {
    const itemTags = tags.get(item.id);

    if (itemTags === undefined) {
      return [];
    }

    return BENCHMARKS.flatMap((benchmark) => {
      const note = benchmark.check(item, itemTags);
      return note === null ? [] : [{ id: benchmark.id, exercise: item.name, note }];
    });
  });

  const byPattern = new Map<string, string[]>();

  for (const item of items) {
    const itemTags = tags.get(item.id);

    if (itemTags !== undefined) {
      const key = pattern(itemTags);
      byPattern.set(key, [...(byPattern.get(key) ?? []), item.id]);
    }
  }

  return {
    hard,
    quality,
    benchmarks,
    pinned: items.length > 0 && items.every((item) => atCeiling(item, context.limits)),
    overlap: [...byPattern.values()].filter((ids) => ids.length > 1),
  };
}

/** What a report needs to say which rubric graded it. */
export function rubric() {
  return {
    version: RUBRIC_VERSION,
    criteria: CRITERIA.map((criterion) => ({ id: criterion.id, sources: criterion.sources })),
    benchmarks: BENCHMARKS.map(({ id, sources }) => ({ id, sources })),
  };
}
