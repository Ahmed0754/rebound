// What the eval's profiles cover. A rule no profile fires, or a criterion that
// applies to none of them, is something the report can say nothing about.

import { describe, it, expect } from "vitest";
import { firedRules, getLimits, hasRedFlag, RULE_IDS } from "../src/clinical.js";
import { CRITERIA } from "../src/quality.js";
import { PROFILES } from "./profiles.js";

// The regions `region_muscles` holds (migration 1790783482000).
const REGIONS = ["knee", "hip", "hamstring", "calf", "ankle", "lower back", "shoulder", "neck", "elbow", "wrist"];

describe("eval profiles", () => {
  it("fire every rule at least once", () => {
    const fired = new Set(PROFILES.flatMap((p) => firedRules(p.answers)));

    expect(RULE_IDS.filter((id) => !fired.has(id))).toEqual([]);
  });

  it("make every live criterion apply at least once", () => {
    const applied = CRITERIA.filter((criterion) =>
      PROFILES.some((p) =>
        criterion.appliesTo({ region: p.answers.region, answers: p.answers, limits: getLimits(p.answers) })
      )
    );

    expect(CRITERIA.filter((criterion) => !applied.includes(criterion)).map((c) => c.id)).toEqual([]);
  });

  it("cover every region", () => {
    const covered = new Set(PROFILES.map((p) => p.answers.region));

    expect(REGIONS.filter((region) => !covered.has(region))).toEqual([]);
    expect([...covered].filter((region) => !REGIONS.includes(region))).toEqual([]);
  });

  it("have unique ids and no red flags", () => {
    expect(new Set(PROFILES.map((p) => p.id)).size).toBe(PROFILES.length);
    expect(PROFILES.filter((p) => hasRedFlag(p.answers)).map((p) => p.id)).toEqual([]);
  });
});
