// The quality criteria without a database or Gemini: pure, like clinical.ts.

import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { getLimits, type Answers } from "./clinical.js";
import { asksFor, checkQuality, CRITERIA, type Tagged } from "./quality.js";

// Nothing wrong with this person, so both categories are allowed.
const WELL: Answers = {
  goal: "general_mobility",
  region: "knee",
  onset: "subacute",
  painNow: 1,
  aggravators: [],
  redFlags: [],
  ageBand: "under_30",
  conditions: [],
  equipment: ["full_gym"],
  activityLevel: "trains_regularly",
  sessionMinutes: 20,
};

const stretch = (id: string, ...primaryMuscles: string[]): Tagged => ({
  id,
  name: id,
  primaryMuscles,
  category: "stretching",
});

const strength = (id: string, ...primaryMuscles: string[]): Tagged => ({
  id,
  name: id,
  primaryMuscles,
  category: "strength",
});

const QUAD_STRETCH = stretch("Quad_Stretch", "quadriceps");
const CALF_STRETCH = stretch("Calf_Stretch", "calves");
const SQUAT = strength("Bodyweight_Squat", "quadriceps");
const BRIDGE = strength("Butt_Lift_Bridge", "glutes");

function check(plan: Tagged[], candidates: Tagged[], overrides: Partial<Answers> = {}) {
  const answers = { ...WELL, ...overrides };
  return checkQuality(plan, candidates, {
    region: answers.region,
    answers,
    limits: getLimits(answers),
  });
}

describe("checkQuality", () => {
  const knee = [QUAD_STRETCH, CALF_STRETCH, SQUAT, BRIDGE];

  it("meets the knee criteria with a quad stretch and a squat", () => {
    const result = check([QUAD_STRETCH, SQUAT], knee);

    expect(result.met).toEqual(["ALL-1", "KNEE-1"]);
    expect(result.missed).toEqual([]);
  });

  it("misses KNEE-1 when nothing works the quadriceps or hamstrings", () => {
    expect(check([CALF_STRETCH, BRIDGE], knee).missed).toEqual(["KNEE-1"]);
  });

  it("misses ALL-1 when the plan is all one category", () => {
    expect(check([SQUAT, BRIDGE], knee).missed).toEqual(["ALL-1"]);
  });

  // Pain of 7 or more allows stretching only, so asking for strength work
  // would be asking for something the limits forbid.
  it("does not ask for strength work when only stretching is allowed", () => {
    const result = check([QUAD_STRETCH, CALF_STRETCH], knee, { painNow: 8 });

    expect(result.notApplicable).toContain("ALL-1");
    expect(result.met).toEqual(["KNEE-1"]);
  });

  it("does not hold a plan to a criterion none of the candidates could meet", () => {
    // Only stretches, and none of them for the quadriceps or hamstrings.
    const pool = [CALF_STRETCH, stretch("Glute_Stretch", "glutes")];
    const result = check(pool, pool);

    expect(result.unsatisfiable).toEqual(["ALL-1", "KNEE-1"]);
    expect(result.missed).toEqual([]);
  });

  it("only applies a region's criteria to that region", () => {
    const result = check([QUAD_STRETCH, SQUAT], knee);

    expect(result.notApplicable).toEqual(
      expect.arrayContaining(["HIP-1", "HAM-3", "CALF-2", "LBACK-1", "LBACK-4", "SHLDR-1", "SHLDR-2", "SHLDR-3"])
    );
  });

  it("puts every criterion in exactly one list", () => {
    const result = check([CALF_STRETCH, BRIDGE], knee);
    const all = [...result.met, ...result.missed, ...result.notApplicable, ...result.unsatisfiable];

    expect(all.sort()).toEqual(CRITERIA.map((criterion) => criterion.id).sort());
  });
});

describe("the region criteria", () => {
  function missed(region: string, plan: Tagged[], candidates: Tagged[], overrides: Partial<Answers> = {}) {
    return check(plan, candidates, { region, ...overrides }).missed;
  }

  it("HIP-1 wants glute or abductor strength work", () => {
    const pool = [stretch("IT_Band", "abductors"), strength("Thigh_Abductor", "abductors")];

    expect(missed("hip", [pool[0]], pool)).toContain("HIP-1");
    expect(missed("hip", pool, pool)).not.toContain("HIP-1");
  });

  it("HAM-3 wants a hamstring stretch, not hamstring strength work", () => {
    const pool = [strength("Leg_Curl", "hamstrings"), stretch("Hamstring_Stretch", "hamstrings")];

    expect(missed("hamstring", [pool[0]], pool)).toContain("HAM-3");
    expect(missed("hamstring", [pool[1]], pool)).not.toContain("HAM-3");
  });

  it("CALF-2 wants a calf stretch", () => {
    const pool = [strength("Calf_Raise", "calves"), CALF_STRETCH];

    expect(missed("calf", [pool[0]], pool)).toContain("CALF-2");
    expect(missed("calf", [CALF_STRETCH], pool)).not.toContain("CALF-2");
  });

  // Grade A in APTA-LBP-2021 for chronic low back pain only.
  it("LBACK-1 wants trunk strength work, and only for chronic onset", () => {
    const pool = [stretch("Cat_Stretch", "lower back"), strength("Plank", "abdominals")];

    expect(missed("lower back", [pool[0]], pool, { onset: "chronic" })).toContain("LBACK-1");
    expect(missed("lower back", pool, pool, { onset: "chronic" })).not.toContain("LBACK-1");
    expect(check([pool[0]], pool, { region: "lower back", onset: "subacute" }).notApplicable).toContain(
      "LBACK-1"
    );
  });

  it("LBACK-4 wants a stretch for the lower back, glutes or hamstrings", () => {
    const pool = [strength("Plank", "abdominals"), stretch("Knee_To_Chest", "glutes")];

    expect(missed("lower back", [pool[0]], pool)).toContain("LBACK-4");
    expect(missed("lower back", [pool[1]], pool)).not.toContain("LBACK-4");
  });

  it("the shoulder criteria want rotation, trapezius work and a stretch", () => {
    const rotation = strength("External_Rotation_with_Band", "shoulders");
    const shrug = strength("Dumbbell_Shrug", "traps");
    const shoulderStretch = stretch("Shoulder_Stretch", "shoulders");
    const pool = [rotation, shrug, shoulderStretch, strength("Arnold_Press", "shoulders")];

    expect(missed("shoulder", [pool[3]], pool)).toEqual(["ALL-1", "SHLDR-1", "SHLDR-2", "SHLDR-3"]);
    expect(missed("shoulder", [rotation, shrug, shoulderStretch], pool)).toEqual([]);
  });

  it("asks nothing of a region with no criteria but ALL-1", () => {
    const pool = [stretch("Side_Neck_Stretch", "neck"), strength("Neck_Isometric", "neck")];

    expect(check(pool, pool, { region: "neck" }).met).toEqual(["ALL-1"]);
  });
});

describe("asksFor", () => {
  it("tells the model what each miss needs, with its id", () => {
    expect(asksFor(["KNEE-1"])).toEqual([
      "Include at least one exercise for the quadriceps or hamstrings. (KNEE-1)",
    ]);
  });
});

// Every criterion has to be one REFERENCES.md describes, credited to sources
// REFERENCES.md lists. A criterion added here without its write-up there, or
// citing a source nobody recorded, fails this.
describe("credit", () => {
  const references = readFileSync(new URL("../eval/REFERENCES.md", import.meta.url), "utf8");

  it.each(CRITERIA.map((criterion) => [criterion.id, criterion]))(
    "%s is written up in eval/REFERENCES.md, with every source it cites",
    (id, criterion) => {
      expect(references).toContain(`\`${id}\``);

      for (const source of criterion.sources) {
        expect(references, source).toContain(`\`${source}\``);
      }
    }
  );
});
