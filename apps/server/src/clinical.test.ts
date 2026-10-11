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
  ageBand: "under_30",
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
    expect(limits.categories).toEqual(["stretching", "strength"]);
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
    const limits = getLimits(answers({ ageBand: "50_plus", onset: "acute" }));

    expect(limits.sets.max).toBe(2);
    expect(limits.reps.max).toBe(10);
    expect(limits.count.max).toBe(3);
    expect(limits.reasons).toEqual(["this flared up recently", "you are 50 or over"]);
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
        ageBand: "50_plus",
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
      { ageBand: "under_30", onset: "subacute", sessionMinutes: 20 },
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

describe("which exercises are allowed", () => {
  it("starts the difficulty ceiling from activity level", () => {
    expect(getLimits(answers({ activityLevel: "sedentary" })).difficultyCap).toBe("beginner");
    expect(getLimits(answers({ activityLevel: "recreational" })).difficultyCap).toBe("beginner");
    expect(getLimits(answers({ activityLevel: "trains_regularly" })).difficultyCap).toBe(
      "intermediate"
    );
    expect(getLimits(answers({ activityLevel: "competitive" })).difficultyCap).toBe("expert");
  });

  // The starting point is not a restriction, so it is not given as a reason.
  it("does not explain the activity ceiling as a rule", () => {
    expect(getLimits(answers({ activityLevel: "recreational" })).reasons).toEqual([]);
  });

  it("lets a rule pull the ceiling below what activity level allows", () => {
    const limits = getLimits(answers({ activityLevel: "competitive", ageBand: "50_plus" }));

    expect(limits.difficultyCap).toBe("beginner");
  });

  it("never lets a rule raise the ceiling above what activity level allows", () => {
    // Nothing caps a sedentary person at anything harder than beginner, and
    // a rule that caps at beginner must not be read as "beginner or above".
    const limits = getLimits(answers({ activityLevel: "sedentary", conditions: ["diabetes"] }));

    expect(limits.difficultyCap).toBe("beginner");
  });

  it("allows only stretching on a fresh flare", () => {
    expect(getLimits(answers({ onset: "acute" })).categories).toEqual(["stretching"]);
  });

  it("allows only stretching at high pain", () => {
    expect(getLimits(answers({ painNow: 7 })).categories).toEqual(["stretching"]);
    expect(getLimits(answers({ painNow: 6 })).categories).toEqual(["stretching", "strength"]);
  });

  it("never leaves no category allowed", () => {
    const limits = getLimits(answers({ painNow: 10, onset: "acute" }));

    expect(limits.categories.length).toBeGreaterThan(0);
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
