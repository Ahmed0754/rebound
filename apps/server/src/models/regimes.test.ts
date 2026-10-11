// The translation from questionnaire to candidate query. No database and no
// Gemini: both are mocked away, because `toCandidateQuery` touches neither -
// they are only here because models/regimes.ts imports them.

import { describe, it, expect, vi } from "vitest";
import { getLimits, type Answers } from "../clinical.js";
import { toCandidateQuery } from "./regimes.js";

// Hoisted above the imports by vitest, so regimes.ts sees these.
vi.mock("./db.js", () => ({ pool: {} }));
vi.mock("./gemini.js", () => ({ pickExercises: vi.fn() }));

const WELL: Answers = {
  goal: "general_mobility",
  region: "knee",
  onset: "subacute",
  painNow: 1,
  aggravators: [],
  redFlags: [],
  ageBand: "under_30",
  conditions: [],
  equipment: ["none"],
  activityLevel: "trains_regularly",
  sessionMinutes: 20,
};

function query(overrides: Partial<Answers> = {}) {
  const answers = { ...WELL, ...overrides };
  return toCandidateQuery(answers, getLimits(answers));
}

describe("toCandidateQuery", () => {
  // v1 loaded the equipment answer and then dropped it on two of three call
  // sites. Every answer has to come out as a filter, not just the common one.
  it("filters on equipment for every equipment answer", () => {
    expect(query({ equipment: ["none"] }).equipment).toEqual(["body only"]);
    expect(query({ equipment: ["bands"] }).equipment).toEqual(["body only", "bands"]);
    expect(query({ equipment: ["dumbbells"] }).equipment).toEqual(["body only", "dumbbell"]);
    expect(query({ equipment: ["full_gym"] }).equipment).toContain("barbell");
  });

  it("always allows bodyweight, whatever else someone owns", () => {
    expect(query({ equipment: ["dumbbells"] }).equipment).toContain("body only");
    expect(query({ equipment: ["full_gym"] }).equipment).toContain("body only");
  });

  it("combines several equipment answers without repeats", () => {
    const { equipment } = query({ equipment: ["bands", "dumbbells", "full_gym"] });

    expect(new Set(equipment).size).toBe(equipment.length);
    expect(equipment).toEqual(expect.arrayContaining(["bands", "dumbbell", "machine"]));
  });

  it("does not count kettlebells as dumbbells", () => {
    expect(query({ equipment: ["dumbbells"] }).equipment).not.toContain("kettlebells");
  });

  it("allows every level up to and including the cap", () => {
    expect(query({ activityLevel: "sedentary" }).levels).toEqual(["beginner"]);
    expect(query({ activityLevel: "trains_regularly" }).levels).toEqual([
      "beginner",
      "intermediate",
    ]);
    expect(query({ activityLevel: "competitive" }).levels).toEqual([
      "beginner",
      "intermediate",
      "expert",
    ]);
  });

  it("passes the categories the rules allow", () => {
    expect(query({ onset: "acute" }).categories).toEqual(["stretching"]);
    expect(query().categories).toEqual(["stretching", "strength"]);
  });

  it("passes the aggravators through to be excluded", () => {
    expect(query({ aggravators: ["stairs", "impact"] }).aggravators).toEqual(["stairs", "impact"]);
  });

  it("asks for the region that was answered", () => {
    expect(query({ region: "lower back" }).region).toBe("lower back");
  });
});
