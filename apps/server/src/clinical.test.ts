// No database, no Gemini key, no mocks - clinical.ts has no imports, so these
// run on their own.

import { describe, it, expect } from "vitest";
import {
  checkRationales,
  decide,
  getLimits,
  hasRedFlag,
  isCrisisText,
  validateRegime,
  widestLimits,
  type Answers,
  type DraftItem,
  type Unit,
} from "./clinical.js";

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
    expect(limits.hold).toEqual({ min: 15, max: 30 });
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

describe("hold limits", () => {
  it("shortens holds on high pain and on a fresh flare", () => {
    expect(getLimits(answers({ painNow: 8 })).hold).toEqual({ min: 15, max: 20 });
    expect(getLimits(answers({ onset: "acute" })).hold).toEqual({ min: 15, max: 20 });
  });

  it("does not shorten holds for age", () => {
    expect(getLimits(answers({ ageBand: "50_plus" })).hold.max).toBe(30);
  });
});

describe("widestLimits", () => {
  it("is what getLimits gives when nothing fires, with every level allowed", () => {
    const widest = widestLimits();
    const nothingFired = getLimits(answers({ activityLevel: "competitive" }));

    expect(widest).toEqual(nothingFired);
  });
});

describe("isCrisisText", () => {
  it.each([
    "honestly I want to kill myself",
    "I've been thinking about suicide",
    "I don't want to be alive",
    "I don\u2019t want to live like this",
    "some days I want to die",
    "I self-harm when it gets bad",
  ])("catches %j", (text) => {
    expect(isCrisisText(text)).toBe(true);
  });

  // An injury app hears these all the time; none of them is a crisis.
  it.each([
    "I hurt myself skiing last month",
    "this workout is killing me",
    "my knee is killing me on stairs",
    "I want to get back to running",
    "pain at the end of the day",
  ])("leaves %j alone", (text) => {
    expect(isCrisisText(text)).toBe(false);
  });
});

describe("decide", () => {
  it("is ready with nothing wrong", () => {
    expect(decide(answers(), "not_needed")).toBe("ready");
    expect(decide(answers(), "clear")).toBe("ready");
  });

  it("sends a ticked red flag or a flagged note to a doctor", () => {
    expect(decide(answers({ redFlags: ["night_pain"] }), "clear")).toBe("see_a_doctor");
    expect(decide(answers(), "flagged")).toBe("see_a_doctor");
  });

  // Never merged into the doctor exit, and it wins over a red flag.
  it("sends crisis to crisis, even with a red flag ticked", () => {
    expect(decide(answers(), "crisis")).toBe("crisis");
    expect(decide(answers({ redFlags: ["night_pain"] }), "crisis")).toBe("crisis");
  });

  // Decided in ADR 0021: an unscreened note goes through.
  it("lets an unscreened note through when the classifier was down", () => {
    expect(decide(answers(), "unavailable")).toBe("ready");
  });
});

describe("validateRegime", () => {
  const limits = getLimits(answers({ painNow: 8 })); // sets 1-2, reps 5-8, hold 15-20, count 2-3
  const allowed = new Map<string, Unit>([
    ["squat", "reps"],
    ["lunge", "reps"],
    ["calf_stretch", "hold"],
  ]);

  const reps = (id: string, sets: number, count: number): DraftItem => ({
    id,
    unit: "reps",
    sets,
    reps: count,
    holdSeconds: null,
  });

  const hold = (id: string, sets: number, seconds: number): DraftItem => ({
    id,
    unit: "hold",
    sets,
    reps: null,
    holdSeconds: seconds,
  });

  function problems(draft: DraftItem[]): string[] {
    const verdict = validateRegime(draft, limits, allowed);
    return verdict.ok ? [] : verdict.problems;
  }

  it("accepts a plan inside every limit", () => {
    expect(validateRegime([reps("squat", 2, 8), hold("calf_stretch", 1, 20)], limits, allowed)).toEqual({
      ok: true,
    });
  });

  it("rejects too few and too many exercises", () => {
    expect(problems([reps("squat", 2, 8)])).toEqual([
      "the plan has 1 exercises; it must have between 2 and 3",
    ]);
    expect(
      problems([reps("squat", 2, 8), reps("lunge", 2, 8), hold("calf_stretch", 1, 20), reps("squat", 1, 5)])
    ).toContain("the plan has 4 exercises; it must have between 2 and 3");
  });

  it("rejects a dose outside the limits instead of clamping it", () => {
    expect(problems([reps("squat", 4, 8), reps("lunge", 2, 15)])).toEqual([
      '"squat" has 4 sets; sets must be between 1 and 2',
      '"lunge" has 15 reps; reps must be between 5 and 8',
    ]);
  });

  it("rejects a hold outside the limits", () => {
    expect(problems([reps("squat", 2, 8), hold("calf_stretch", 2, 45)])).toEqual([
      '"calf_stretch" is held for 45s; holds must be between 15 and 20 seconds',
    ]);
  });

  it("rejects an exercise that was never offered", () => {
    expect(problems([reps("squat", 2, 8), reps("deadlift", 2, 8)])).toEqual([
      '"deadlift" is not one of the exercises offered',
    ]);
  });

  it("rejects the same exercise twice", () => {
    expect(problems([reps("squat", 2, 8), reps("squat", 1, 6)])).toEqual([
      '"squat" appears more than once',
    ]);
  });

  it("rejects the wrong unit for an exercise", () => {
    expect(problems([reps("squat", 2, 8), reps("calf_stretch", 2, 8)])).toEqual([
      '"calf_stretch" is dosed in hold, not reps',
    ]);
  });

  it("rejects a fractional dose", () => {
    expect(problems([reps("squat", 1.5, 8), reps("lunge", 2, 8)])).toEqual([
      '"squat" has 1.5 sets; sets must be between 1 and 2',
    ]);
  });
});

describe("checkRationales", () => {
  const problems = (rationale: string) => checkRationales(new Map([["squat", rationale]]));

  it("accepts a rationale that says what the exercise works", () => {
    expect(problems("Builds strength in the front of your thigh without loading the joint.")).toEqual([]);
  });

  it("rejects telling someone to carry on through pain", () => {
    for (const rationale of [
      "Push through the pain for the last few reps.",
      "Work through any discomfort you feel.",
      "No pain, no gain.",
      "Ignore the pain and keep going.",
      "Keep going even if it hurts a little.",
    ]) {
      expect(problems(rationale), rationale).toEqual([
        'the rationale for "squat" tells the user to carry on through pain; no exercise should hurt, so say to stop if it does',
      ]);
    }
  });

  // An ordinary cue for a bridge, not advice about pain.
  it("does not flag pushing through your heels", () => {
    expect(problems("Push through your heels to lift your hips.")).toEqual([]);
  });

  it("rejects a claim that the exercise treats a condition", () => {
    expect(problems("This stretch heals your knee.")).toEqual([
      'the rationale for "squat" claims the exercise treats a condition ("heals"); say what the exercise works, not what it cures',
    ]);
    expect(problems("A good treatment for tendonitis.")).toHaveLength(1);
    expect(problems("It cures stiffness.")).toHaveLength(1);
    expect(problems("Helps repair the tendon.")).toHaveLength(1);
  });

  it("does not mistake 'healthy' for 'heal'", () => {
    expect(problems("Keeps the joint healthy and moving.")).toEqual([]);
  });

  it("names every rationale with a problem, not just the first", () => {
    const found = checkRationales(
      new Map([
        ["squat", "Push through the pain."],
        ["lunge", "Fine."],
        ["calf_stretch", "Heals the calf."],
      ])
    );

    expect(found).toHaveLength(2);
    expect(found[0]).toContain('"squat"');
    expect(found[1]).toContain('"calf_stretch"');
  });
});
