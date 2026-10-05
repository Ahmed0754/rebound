// No database, no Gemini key, no mocks - clinical.ts has no imports, so these
// run on their own.

import { describe, it, expect } from "vitest";
import { clampDose, getLimits, hasRedFlag, type Answers } from "./clinical.js";

// Nothing wrong with this person. Each test overrides only what it is about.
const WELL: Answers = {
  goal: "general_mobility",
  region: "knee",
  onset: "subacute",
  painNow: 1,
  aggravators: [],
  redFlags: [],
  ageBand: "under_40",
  conditions: [],
  equipment: ["full_gym"],
  activityLevel: "trains_regularly",
  sessionMinutes: 20,
};

const answers = (overrides: Partial<Answers> = {}): Answers => ({ ...WELL, ...overrides });

describe("hasRedFlag", () => {
  it("is false when nothing was ticked", () => {
    expect(hasRedFlag(answers())).toBe(false);
  });

  it("is true for a single flag", () => {
    expect(hasRedFlag(answers({ redFlags: ["recent_trauma"] }))).toBe(true);
  });
});

describe("getLimits", () => {
  it("gives the widest plan to someone with nothing wrong", () => {
    const limits = getLimits(answers());

    expect(limits.sets).toEqual({ min: 1, max: 4 });
    expect(limits.reps).toEqual({ min: 5, max: 15 });
    expect(limits.count).toEqual({ min: 2, max: 5 });
    expect(limits.reasons).toEqual([]);
  });

  it("tightens sets, reps and count on high pain", () => {
    const limits = getLimits(answers({ painNow: 8 }));

    expect(limits.sets.max).toBe(2);
    expect(limits.reps.max).toBe(8);
    expect(limits.count.max).toBe(3);
  });

  it("treats moderate pain more gently than high pain", () => {
    const limits = getLimits(answers({ painNow: 5 }));

    expect(limits.sets.max).toBe(3);
    expect(limits.reps.max).toBe(12);
  });

  // The behaviour tiers could not produce.
  it("stacks caps from separate rules and takes the tightest of each", () => {
    const limits = getLimits(answers({ ageBand: "65_plus", onset: "acute" }));

    expect(limits.sets.max).toBe(2);
    expect(limits.reps.max).toBe(10);
    expect(limits.count.max).toBe(3);
    expect(limits.reasons).toEqual(["this flared up recently", "you are 65 or over"]);
  });

  it("lets the shorter of two overlapping session rules win", () => {
    expect(getLimits(answers({ sessionMinutes: 5 })).count.max).toBe(2);
    expect(getLimits(answers({ sessionMinutes: 10 })).count.max).toBe(3);
    expect(getLimits(answers({ sessionMinutes: 20 })).count.max).toBe(5);
  });

  it("never lets a ceiling fall below its own floor", () => {
    const limits = getLimits(
      answers({
        painNow: 10,
        onset: "acute",
        ageBand: "65_plus",
        conditions: ["autoimmune", "osteoporosis"],
        activityLevel: "sedentary",
        sessionMinutes: 5,
      })
    );

    expect(limits.sets.max).toBeGreaterThanOrEqual(limits.sets.min);
    expect(limits.reps.max).toBeGreaterThanOrEqual(limits.reps.min);
    expect(limits.count.max).toBeGreaterThanOrEqual(limits.count.min);
  });

  // The invariant the layer rests on, asserted rather than only commented.
  it("never widens a ceiling past the absolute maximum", () => {
    const cases: Partial<Answers>[] = [
      {},
      { painNow: 0, activityLevel: "competitive" },
      { ageBand: "under_40", onset: "subacute", sessionMinutes: 20 },
    ];

    for (const override of cases) {
      const limits = getLimits(answers(override));

      expect(limits.sets.max).toBeLessThanOrEqual(4);
      expect(limits.reps.max).toBeLessThanOrEqual(15);
      expect(limits.count.max).toBeLessThanOrEqual(5);
    }
  });

  it("explains itself in the user's words", () => {
    expect(getLimits(answers({ conditions: ["diabetes"] })).reasons).toEqual([
      "you told us about a long-term condition",
    ]);
  });
});

describe("clampDose", () => {
  const limits = getLimits(answers({ painNow: 8 })); // sets 1-2, reps 5-8

  it("pulls a dose above the ceiling back down", () => {
    expect(clampDose(4, 15, limits)).toEqual({ sets: 2, reps: 8 });
  });

  it("pushes a dose below the floor back up", () => {
    expect(clampDose(0, 1, limits)).toEqual({ sets: 1, reps: 5 });
  });

  it("leaves a dose already inside the range alone", () => {
    expect(clampDose(2, 6, limits)).toEqual({ sets: 2, reps: 6 });
  });
});
