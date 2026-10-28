// The judge's report, from canned judgements: no Gemini.

import { describe, it, expect } from "vitest";
import type { QualityResult } from "../src/quality.js";
import type { Grade } from "./graders.js";
import { toJudgedMarkdown, type Graded, type Judged, type JudgeStamp } from "./report.js";

const empty: QualityResult = { met: [], missed: [], notApplicable: [], unsatisfiable: [] };

function graded(maker: string, provisional: Partial<QualityResult>): Graded {
  const grade: Grade = {
    hard: [],
    quality: empty,
    provisional: { ...empty, ...provisional },
    benchmarks: [],
    pinned: false,
    overlap: [],
  };

  return {
    fixture: "neck-desk",
    maker,
    ms: 0,
    error: null,
    items: [{ id: "Upright_Row", name: "Upright Row", description: "", unit: "reps", sets: 2, reps: 10, holdSeconds: null, rationale: null }],
    quality: null,
    grade,
  };
}

const stamp: JudgeStamp = {
  judgedAt: "2026-10-28T00:00:00.000Z",
  report: "r.json",
  commit: "abc",
  model: "gemini-x",
  judgeModel: "gemini-x",
  judgeVersion: "D.1",
  rubric: "A.2",
};

const safety = (verdict: "met" | "missed") =>
  ["SAFE-1", "SAFE-2", "SAFE-3"].map((id) => ({ id, verdict, reason: `${id} ${verdict}.` }));

const JUDGED: Judged[] = [
  {
    fixture: "neck-desk",
    maker: "gemini",
    plan: {
      criteria: [{ id: "NECK-2", verdict: "missed", reason: "Nothing for the shoulder girdle." }],
      picks: [{ id: "Upright_Row", verdict: "suits", reason: "Fine." }],
    },
    rationales: { safety: safety("met") },
    errors: [],
  },
  {
    fixture: "neck-desk",
    maker: "heuristic",
    plan: {
      criteria: [{ id: "NECK-2", verdict: "missed", reason: "The row is not girdle endurance work." }],
      picks: [{ id: "Upright_Row", verdict: "unsuitable", reason: "Upright rows load an irritable neck." }],
    },
    rationales: null,
    errors: [],
  },
];

const markdown = (judged = JUDGED) =>
  toJudgedMarkdown(stamp, ["gemini", "heuristic"], [graded("gemini", { missed: ["NECK-2"] }), graded("heuristic", { met: ["NECK-2"] })], judged);

describe("toJudgedMarkdown", () => {
  it("labels every score provisional, and warns when the judge wrote the plans", () => {
    expect(markdown()).toContain("**Provisional.**");
    expect(markdown()).toContain("same model that wrote the Gemini plans");
    expect(toJudgedMarkdown({ ...stamp, judgeModel: "other" }, ["gemini"], [], [])).not.toContain("same model");
  });

  it("counts agreement with the code only where both graded, and lists the disagreements", () => {
    expect(markdown()).toContain("| Agrees with the code grade | 1 of 1 (100%) | 0 of 1 (0%) |");
    expect(markdown()).toContain(
      "- **neck-desk · heuristic · NECK-2:** code says met, judge says missed. The row is not girdle endurance work."
    );
  });

  it("names unsuitable picks, and says a maker without rationales has none to judge", () => {
    expect(markdown()).toContain("- **neck-desk · heuristic · Upright Row:** Upright rows load an irritable neck.");
    expect(markdown()).toContain("| Safety statements broken | 0 of 3 (0%) | no rationales |");
  });

  it("counts a judge failure rather than dropping it", () => {
    const failed = [JUDGED[0], { ...JUDGED[1], plan: null, errors: ["attempt 1: boom", "attempt 2: boom"] }];

    expect(markdown(failed)).toContain("| Judge failures | 0 | 1 |");
    expect(markdown(failed)).toContain("- **neck-desk · heuristic:** attempt 1: boom; attempt 2: boom");
  });
});
