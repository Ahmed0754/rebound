// No database, no Gemini key, no mocks - clinical.ts has no imports, so these
// run on their own.

import { describe, it, expect } from "vitest";
import {
  adjustPlan,
  checkRationales,
  decide,
  getLimits,
  hasRedFlag,
  isCrisisText,
  painTrend,
  sameDoses,
  stepDoses,
  validateRegime,
  widestLimits,
  type Answers,
  type DraftItem,
  type Unit,
} from "./clinical.js";

// Nothing wrong with this person. Each test overrides only what it is about.
const WELL: Answers = {
  goal: "Move more freely in general",
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

describe("painTrend", () => {
  // Oldest first, a day apart.
  const days = (...pains: number[]) => pains.map((pain, i) => ({ day: `2026-11-${String(i + 1).padStart(2, "0")}`, pain }));

  it("needs more check-ins than one window", () => {
    expect(painTrend(days(6, 4, 2)).trend).toBe("not_enough");
  });

  it("compares the latest three with the ones before them", () => {
    expect(painTrend(days(6, 6, 6, 3, 4, 3))).toEqual({ trend: "better", earlier: 6, recent: 10 / 3 });
    expect(painTrend(days(2, 2, 2, 5, 4, 4)).trend).toBe("worse");
  });

  it("calls a change under 2 points steady", () => {
    expect(painTrend(days(5, 5, 5, 4, 4, 4)).trend).toBe("steady");
  });

  it("averages everything before the latest three", () => {
    expect(painTrend(days(8, 6, 6, 4, 3, 3, 3))).toMatchObject({ earlier: 6, recent: 3 });
  });

  it("won't measure from one earlier check-in", () => {
    expect(painTrend(days(7, 4, 4, 4)).trend).toBe("not_enough");
    expect(painTrend(days(7, 7, 4, 4, 4)).trend).toBe("better");
  });
});

describe("stepDoses", () => {
  const limits = widestLimits();
  const reps: DraftItem = { id: "squat", unit: "reps", sets: 2, reps: 10, holdSeconds: null };
  const hold: DraftItem = { id: "stretch", unit: "hold", sets: 2, reps: null, holdSeconds: 20 };

  it("moves reps by 2 and holds by 5 seconds", () => {
    expect(stepDoses([reps, hold], "up", limits)).toEqual([
      { ...reps, reps: 12 },
      { ...hold, holdSeconds: 25 },
    ]);
    expect(stepDoses([reps, hold], "down", limits)).toEqual([
      { ...reps, reps: 8 },
      { ...hold, holdSeconds: 15 },
    ]);
  });

  it("stays inside the limits, moving a set once the amount can't move", () => {
    const atTop = { ...reps, reps: limits.reps.max };
    expect(stepDoses([atTop], "up", limits)).toEqual([{ ...atTop, sets: 3 }]);

    const atBottom = { ...reps, sets: 1, reps: limits.reps.min };
    expect(stepDoses([atBottom], "down", limits)).toEqual([atBottom]);
  });
});

describe("adjustPlan", () => {
  const limits = widestLimits();
  const plan: DraftItem[] = [{ id: "squat", unit: "reps", sets: 2, reps: 10, holdSeconds: null }];

  // Doses last changed before any of these check-ins were saved.
  const CHANGED = "2026-11-01T00:00:00.000Z";
  const SAVED = "2026-11-10T00:00:00.000Z";

  // Consecutive days ending on `today`, exercises done, saved after the doses changed.
  const today = "2026-11-10";
  const days = (...pains: number[]) =>
    pains.map((pain, i) => ({
      day: `2026-11-${String(10 - (pains.length - 1 - i)).padStart(2, "0")}`,
      pain,
      didExercises: true,
      updatedAt: SAVED,
    }));

  const adjust = (items: DraftItem[], points: ReturnType<typeof days>, lim = limits) =>
    adjustPlan(items, points, lim, { today, dosesChangedAt: CHANGED });

  it("suggests nothing until there is a trend", () => {
    expect(adjust(plan, days(5))).toMatchObject({ trend: "not_enough", proposed: null, stop: false });
  });

  it("suggests nothing when the pain is steady", () => {
    expect(adjust(plan, days(4, 4, 4, 4, 4))).toMatchObject({ trend: "steady", proposed: null });
  });

  it("suggests a harder plan when the pain is better", () => {
    expect(adjust(plan, days(6, 6, 3, 3, 3)).proposed).toEqual([{ ...plan[0], reps: 12 }]);
  });

  it("suggests an easier plan when the pain is worse", () => {
    expect(adjust(plan, days(2, 2, 5, 5, 5)).proposed).toEqual([{ ...plan[0], reps: 8 }]);
  });

  it("suggests nothing when the plan is already at its limit", () => {
    const top: DraftItem[] = [{ ...plan[0], sets: limits.sets.max, reps: limits.reps.max }];
    expect(adjust(top, days(6, 6, 3, 3, 3))).toMatchObject({ trend: "better", proposed: null });
  });

  describe("high pain", () => {
    const stops = (points: ReturnType<typeof days>) => {
      const result = adjust(plan, points);
      expect(result).toMatchObject({ proposed: null, stop: true });
      expect(result.advice).toMatch(/stop the exercises/i);
    };

    it("stops when worse and 7 or above", () => stops(days(3, 3, 7, 8, 7)));
    it("stops when it stays high, even though it is steady", () => stops(days(8, 8, 8, 8, 8, 8)));
    it("stops when it is falling but still high", () => stops(days(10, 10, 10, 7, 7, 7)));
    it("stops on a sudden spike", () => stops(days(4, 4, 4, 4, 4, 10)));
    it("stops on one check-in, before there is any trend", () => stops(days(9)));
    it("stops when the last three average 7, though the latest is lower", () => stops(days(4, 4, 8, 8, 5)));

    it("doesn't stop just under the line", () => {
      expect(adjust(plan, days(6, 6, 6, 6, 6)).stop).toBe(false);
    });

    it("still counts when the doses changed after it was saved", () => {
      const result = adjustPlan(plan, days(9), limits, { today, dosesChangedAt: "2026-11-20T00:00:00.000Z" });
      expect(result.stop).toBe(true);
    });

    it("no longer counts after a week", () => {
      const result = adjustPlan(plan, days(9), limits, { today: "2026-11-17", dosesChangedAt: CHANGED });
      expect(result.stop).toBe(false);
    });
  });

  describe("the last seven days", () => {
    it("ignores check-ins older than that", () => {
      // Six check-ins, but the first two are 7 and 8 days before today.
      const points = days(9, 9, 4, 4, 4, 4).map((p, i) => (i < 2 ? { ...p, day: `2026-11-0${2 + i}` } : p));
      expect(adjust(plan, points).trend).toBe("not_enough");
    });

    it("counts the day six days back", () => {
      const points = days(6, 6, 3, 3, 3).map((p, i) => (i === 0 ? { ...p, day: "2026-11-04" } : p));
      expect(adjust(plan, points).trend).toBe("better");
    });

    it("says nothing about a plan with only old check-ins", () => {
      const old = adjustPlan(plan, days(6, 6, 3, 3, 3), limits, { today: "2026-12-01", dosesChangedAt: CHANGED });
      expect(old).toMatchObject({ trend: "not_enough", proposed: null });
    });

    it("leaves out check-ins saved before the doses last changed", () => {
      const points = days(6, 6, 3, 3, 3).map((p, i) => (i === 0 ? { ...p, updatedAt: "2026-10-31T00:00:00.000Z" } : p));
      expect(adjust(plan, points).trend).toBe("not_enough");
    });
  });

  describe("whether the exercises were done", () => {
    const skipping = (skipped: number) =>
      days(6, 6, 6, 3, 3, 3).map((p, i) => (i < skipped ? { ...p, didExercises: false } : p));

    it("won't make a plan harder when they mostly weren't", () => {
      const result = adjust(plan, skipping(6));
      expect(result).toMatchObject({ trend: "better", proposed: null, retake: false });
      expect(result.advice).toMatch(/only 0 of your last 6/);
    });

    it("counts exactly half as not most", () => {
      expect(adjust(plan, skipping(3)).proposed).toBeNull();
    });

    it("makes it harder when they mostly were", () => {
      expect(adjust(plan, skipping(2)).proposed).toEqual([{ ...plan[0], reps: 12 }]);
    });

    it("still eases the plan when pain is worse, done or not", () => {
      const points = days(2, 2, 2, 5, 5, 5).map((p) => ({ ...p, didExercises: false }));
      expect(adjust(plan, points).proposed).toEqual([{ ...plan[0], reps: 8 }]);
    });
  });

  describe("suggesting the questionnaire again", () => {
    // Pain 8 at the start lowers the limits; this plan is at the top of them.
    const tight = getLimits({ ...WELL, painNow: 8 });
    const top: DraftItem[] = [{ ...plan[0], sets: tight.sets.max, reps: tight.reps.max }];

    it("does when pain is better, the plan is at its limits, and a rule lowered them", () => {
      expect(tight.reasons.length).toBeGreaterThan(0);
      const result = adjust(top, days(6, 6, 3, 3, 3), tight);
      expect(result).toMatchObject({ trend: "better", proposed: null, retake: true });
      expect(result.advice).toMatch(/questionnaire/);
    });

    it("doesn't while there is still room inside the limits", () => {
      const room: DraftItem[] = [{ ...plan[0], sets: 1, reps: tight.reps.min }];
      expect(adjust(room, days(6, 6, 3, 3, 3), tight).retake).toBe(false);
    });

    it("doesn't when no rule lowered the limits, since a retake would change nothing", () => {
      const top: DraftItem[] = [{ ...plan[0], sets: limits.sets.max, reps: limits.reps.max }];
      expect(adjust(top, days(6, 6, 3, 3, 3)).retake).toBe(false);
    });

    it("doesn't when the pain is worse", () => {
      const bottom: DraftItem[] = [{ ...plan[0], sets: 1, reps: tight.reps.min }];
      expect(adjust(bottom, days(2, 2, 5, 5, 5), tight).retake).toBe(false);
    });
  });
});

describe("sameDoses", () => {
  const dose = { id: "squat", sets: 2, reps: 10, holdSeconds: null };

  it("is true only for the same exercises at the same doses", () => {
    expect(sameDoses([dose], [{ ...dose }])).toBe(true);
    expect(sameDoses([dose], [{ ...dose, reps: 12 }])).toBe(false);
    expect(sameDoses([dose], [{ ...dose, id: "lunge" }])).toBe(false);
    expect(sameDoses([dose], [dose, dose])).toBe(false);
  });
});
