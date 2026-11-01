// The chosen pool, from hand-built candidates: no database.

import { describe, it, expect } from "vitest";
import { getLimits, type Answers } from "../src/clinical.js";
import { checkQuality, type Tagged } from "../src/quality.js";
import { chooseCovering } from "./pools.js";

const answers: Answers = {
  goal: "return_to_movement",
  region: "knee",
  onset: "chronic",
  painNow: 2,
  aggravators: [],
  redFlags: [],
  ageBand: "30_49",
  conditions: [],
  equipment: ["none"],
  activityLevel: "recreational",
  sessionMinutes: 20,
};
const context = { region: "knee", answers, limits: getLimits(answers) };

const tagged = (id: string, category: string, muscles: string[]): Tagged => ({
  id,
  name: id,
  primaryMuscles: muscles,
  category,
});

// Thirty calf exercises, which meet nothing for a knee, and one each of what
// the knee criteria want.
const POOL = [
  ...Array.from({ length: 30 }, (_, i) => tagged(`Calf_${i}`, "strength", ["calves"])),
  tagged("Quad_Stretch", "stretching", ["quadriceps"]),
  tagged("Glute_Bridge", "strength", ["glutes"]),
];

describe("chooseCovering", () => {
  it("keeps one candidate for every criterion the whole pool could meet", () => {
    const chosen = chooseCovering(POOL, context, 20, "knee");

    expect(chosen).toHaveLength(20);
    expect(chosen.map((c) => c.id)).toEqual(expect.arrayContaining(["Quad_Stretch", "Glute_Bridge"]));
    expect(checkQuality(chosen, chosen, context).unsatisfiable).toEqual([]);
  });

  it("chooses the same way for the same seed, and never repeats a candidate", () => {
    const ids = (seed: string) => chooseCovering(POOL, context, 20, seed).map((c) => c.id);

    expect(ids("knee")).toEqual(ids("knee"));
    expect(new Set(ids("knee")).size).toBe(20);
  });

  it("takes the whole pool when it is smaller than asked", () => {
    expect(chooseCovering(POOL.slice(28), context, 20, "knee")).toHaveLength(4);
  });
});
