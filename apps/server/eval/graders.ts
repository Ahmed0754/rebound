// The code checks the eval runs on every plan (piece A). Pure, like
// clinical.ts and quality.ts, which do most of the work.
//
// Five kinds, reported apart:
//  - hard: the checks a plan has to pass to be saved at all. A Gemini plan
//    passed them already; a baseline's plan (piece B) may not have.
//  - quality: the live criteria from quality.ts, the same as the live check.
//  - provisional: the criteria the live check never enforces, so nothing
//    retried for them (see PROVISIONAL).
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
import {
  allows,
  any,
  checkCriteria,
  checkQuality,
  CRITERIA,
  isStretch,
  isStrength,
  targets,
  type Criterion,
  type QualityResult,
} from "../src/quality.js";
import type { RegimeItem } from "../src/types/index.js";

// Bump when a check is added or changed, so reports graded differently are
// never compared as if they were the same.
export const RUBRIC_VERSION = "A.2";

type Provisional = Pick<Criterion, "id" | "sources" | "appliesTo"> & {
  // The criterion as REFERENCES.md §3 words it, for the judge (piece D).
  says: string;
  // The code check, where the tags can answer it. Absent where only the
  // judge can.
  meets?: Criterion["meets"];
};

// The provisional criteria from REFERENCES.md §3. Each extrapolates from a
// guideline about one condition to everyone with pain in that region, which
// is why quality.ts never enforces them. That is also what makes them worth
// grading: no maker was retried until it met them, so a difference between
// makers here is not there by construction, as the live criteria's is.
//
// The checks read the tags the way quality.ts does, with its helpers.
export const PROVISIONAL: Provisional[] = [
  {
    id: "KNEE-2",
    sources: ["APTA-PFP-2019", "AAOS-KNEE"],
    says: "When strength is allowed, also includes at least one hip-targeted exercise (glutes or abductors).",
    appliesTo: ({ region, limits }) => region === "knee" && allows(limits, "strength"),
    meets: any((e) => isStrength(e) && targets(e, ["glutes", "abductors"])),
  },
  {
    // In tags this would be "a stretch and a strength exercise" - ALL-1, which
    // the live check already enforces - so a code grade would count the
    // circular criterion twice. Only the judge grades it, and it can tell
    // mobility work from an exercise that only happens to be tagged a stretch.
    id: "HIP-2",
    sources: ["APTA-HIPOA-2025", "AAOS-HIP"],
    says: "Combines strengthening with mobility or stretching.",
    appliesTo: ({ region, limits }) =>
      region === "hip" && allows(limits, "strength") && allows(limits, "stretching"),
  },
  {
    // "Eccentric" is not a catalogue field, so only the judge grades it.
    id: "HAM-1",
    sources: ["APTA-HAMSTRING-2022"],
    says: "When strength is allowed, includes eccentric hamstring or hip-extensor strengthening.",
    appliesTo: ({ region, limits }) => region === "hamstring" && allows(limits, "strength"),
  },
  {
    // Stabilisation is strength work, so where the limits allow none this
    // asks nothing. `region_muscles` maps hamstring to hamstrings and glutes
    // only, so no candidate can meet it yet: it shows up as unsatisfiable,
    // which is the finding.
    id: "HAM-2",
    sources: ["APTA-HAMSTRING-2022"],
    says: "Includes trunk or pelvic stabilisation work.",
    appliesTo: ({ region, limits }) => region === "hamstring" && allows(limits, "strength"),
    meets: any((e) => isStrength(e) && targets(e, ["abdominals", "lower back"])),
  },
  {
    // Calf loading rather than "a calf raise" by name: nearly every calf
    // strength exercise in the catalogue is a raise.
    id: "CALF-1",
    sources: ["APTA-ACHILLES-2024", "AAOS-FOOTANKLE"],
    says: "When strength is allowed, includes calf loading (a calf raise).",
    appliesTo: ({ region, limits }) => region === "calf" && allows(limits, "strength"),
    meets: any((e) => isStrength(e) && targets(e, ["calves"])),
  },
  {
    // By name, since there is no balance tag. "When the equipment allows" is
    // the candidate check: a balance exercise among the candidates is one the
    // person's equipment allows, and none among them makes it unsatisfiable.
    id: "ANKLE-2",
    sources: ["APTA-ANKLE-2021", "AAOS-FOOTANKLE"],
    says: "Includes balance or proprioception work when the equipment allows.",
    appliesTo: ({ region }) => region === "ankle",
    meets: any((e) => /balance/i.test(e.name)),
  },
  {
    id: "NECK-1",
    sources: ["APTA-NECK-2017", "NHS-NECK", "AAOS-SPINE"],
    says: "Includes neck mobility (range of motion or a gentle stretch).",
    appliesTo: ({ region, limits }) => region === "neck" && allows(limits, "stretching"),
    meets: any((e) => isStretch(e) && targets(e, ["neck"])),
  },
  {
    id: "NECK-2",
    sources: ["APTA-NECK-2017"],
    says: "When strength is allowed, includes scapulothoracic or shoulder-girdle strengthening or endurance work.",
    appliesTo: ({ region, limits }) => region === "neck" && allows(limits, "strength"),
    meets: any((e) => isStrength(e) && targets(e, ["traps", "shoulders", "middle back"])),
  },
];

// The ones the tags can answer.
const CODED = PROVISIONAL.flatMap(({ meets, ...criterion }) =>
  meets === undefined ? [] : [{ ...criterion, meets }]
);

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
  // The provisional criteria with a code check. The judge grades the rest.
  provisional: QualityResult;
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
  // An id that is not a candidate is caught by the hard checks; quality only
  // grades what it can see.
  const picked = items.flatMap((item) => tags.get(item.id) ?? []);
  const quality = checkQuality(picked, candidates, context);
  const provisional = checkCriteria(CODED, picked, candidates, context);

  if (plan === null) {
    return { hard: ["no plan was generated"], quality, provisional, benchmarks: [], pinned: false, overlap: [] };
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
    provisional,
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
    provisional: PROVISIONAL.map(({ id, sources, meets }) => ({ id, sources, inCode: meets !== undefined })),
    benchmarks: BENCHMARKS.map(({ id, sources }) => ({ id, sources })),
  };
}
