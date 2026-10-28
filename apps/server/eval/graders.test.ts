// The eval's code checks, on hand-built plans: no database and no Gemini.

import { describe, it, expect } from "vitest";
import { getLimits, type Answers } from "../src/clinical.js";
import type { Candidate } from "../src/models/exercises.js";
import { CRITERIA } from "../src/quality.js";
import type { RegimeItem } from "../src/types/index.js";
import { grade, PROVISIONAL } from "./graders.js";

const answers: Answers = {
  goal: "return_to_movement",
  region: "knee",
  onset: "subacute",
  painNow: 2,
  aggravators: [],
  redFlags: [],
  ageBand: "30_49",
  conditions: [],
  equipment: ["none"],
  activityLevel: "recreational",
  sessionMinutes: 20,
};
const limits = getLimits(answers);
const context = { region: "knee", answers, limits };

function candidate(id: string, tags: Partial<Candidate>): Candidate {
  return {
    id,
    name: id.replace(/_/g, " "),
    description: "",
    unit: "reps",
    primaryMuscles: [],
    category: "strength",
    level: "beginner",
    equipment: null,
    force: null,
    mechanic: null,
    ...tags,
  };
}

const CANDIDATES = [
  candidate("Squat", { primaryMuscles: ["quadriceps"], force: "push", mechanic: "compound" }),
  candidate("Split_Squat", { primaryMuscles: ["quadriceps"], force: "push", mechanic: "compound" }),
  candidate("Quad_Stretch", { primaryMuscles: ["quadriceps"], category: "stretching", unit: "hold", force: "static" }),
];

function item(id: string, dose: Partial<RegimeItem>): RegimeItem {
  return { id, name: id, description: "", unit: "reps", sets: 2, reps: 10, holdSeconds: null, rationale: null, ...dose };
}

describe("grade", () => {
  it("grades a failed generation as an empty plan, missing what it could have met", () => {
    const result = grade(null, CANDIDATES, context);

    expect(result.hard).toEqual(["no plan was generated"]);
    expect(result.quality.met).toEqual([]);
    expect(result.quality.missed).toEqual(["ALL-1", "KNEE-1"]);
  });

  it("passes a plan inside the limits that meets the knee criteria", () => {
    const result = grade(
      [item("Squat", {}), item("Quad_Stretch", { unit: "hold", reps: null, holdSeconds: 20 })],
      CANDIDATES,
      context
    );

    expect(result.hard).toEqual([]);
    expect(result.quality).toMatchObject({ met: ["ALL-1", "KNEE-1"], missed: [] });
    expect(result.pinned).toBe(false);
    expect(result.overlap).toEqual([]);
  });

  it("catches what the hard checks would have refused", () => {
    const result = grade([item("Squat", { sets: 9, rationale: "Push through the pain." })], CANDIDATES, context);

    expect(result.hard.length).toBeGreaterThanOrEqual(2);
  });

  it("notes doses outside the sources without failing them", () => {
    const result = grade(
      [item("Squat", { sets: 4, reps: 15 }), item("Quad_Stretch", { unit: "hold", reps: null, holdSeconds: 20 })],
      CANDIDATES,
      context
    );

    expect(result.hard).toEqual([]);
    expect(result.benchmarks.map((note) => note.id).sort()).toEqual(["BENCH-HOLD", "BENCH-REPS", "BENCH-SETS"]);
  });

  it("flags a plan with every dose at its ceiling", () => {
    const result = grade(
      [
        item("Squat", { sets: limits.sets.max, reps: limits.reps.max }),
        item("Quad_Stretch", { unit: "hold", sets: limits.sets.max, reps: null, holdSeconds: limits.hold.max }),
      ],
      CANDIDATES,
      context
    );

    expect(result.pinned).toBe(true);
  });

  it("flags two exercises that look like the same movement", () => {
    const result = grade([item("Squat", {}), item("Split_Squat", {})], CANDIDATES, context);

    expect(result.overlap).toEqual([["Squat", "Split_Squat"]]);
  });
});

describe("grade, provisional criteria", () => {
  const withGlutes = [...CANDIDATES, candidate("Glute_Bridge", { primaryMuscles: ["glutes"], force: "push" })];

  it("grades KNEE-2 apart from the live criteria", () => {
    const met = grade([item("Squat", {}), item("Glute_Bridge", {})], withGlutes, context);
    const missed = grade([item("Squat", {})], withGlutes, context);

    expect(met.provisional).toMatchObject({ met: ["KNEE-2"], missed: [] });
    expect(missed.provisional).toMatchObject({ met: [], missed: ["KNEE-2"] });
    // The live result is unchanged by it.
    expect(missed.quality.missed).toEqual(["ALL-1"]);
  });

  it("holds nothing against a plan when no candidate could meet it", () => {
    const result = grade([item("Squat", {})], CANDIDATES, context);

    expect(result.provisional).toMatchObject({ missed: [], unsatisfiable: ["KNEE-2"] });
  });

  it("grades a failed generation as missing what it could have met", () => {
    expect(grade(null, withGlutes, context).provisional.missed).toEqual(["KNEE-2"]);
  });

  it("leaves the criteria only the judge can grade out of the code grade", () => {
    const hip = getLimits({ ...answers, region: "hip" });
    const result = grade(null, withGlutes, { region: "hip", answers: { ...answers, region: "hip" }, limits: hip });
    const graded = Object.values(result.provisional).flat();

    expect(graded).not.toContain("HIP-2");
    expect(graded).not.toContain("HAM-1");
  });
});

describe("PROVISIONAL", () => {
  it("never repeats a live criterion", () => {
    const live = new Set(CRITERIA.map((criterion) => criterion.id));

    expect(PROVISIONAL.filter((criterion) => live.has(criterion.id))).toEqual([]);
  });
});
