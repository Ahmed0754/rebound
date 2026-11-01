// The report's numbers that need more than one result to mean anything - the
// spread between repeats and the judge's - from canned results: no Gemini.

import { describe, it, expect } from "vitest";
import type { QualityResult } from "../src/quality.js";
import type { Grade } from "./graders.js";
import { consistency, toJudgedMarkdown, type Graded, type Judged, type JudgeStamp } from "./report.js";

const empty: QualityResult = { met: [], missed: [], notApplicable: [], unsatisfiable: [] };

function graded(
  maker: string,
  provisional: Partial<QualityResult>,
  { run = 0, picks = ["Upright_Row"], fixture = "neck-desk" } = {}
): Graded {
  const grade: Grade = {
    hard: [],
    quality: empty,
    provisional: { ...empty, ...provisional },
    benchmarks: [],
    pinned: false,
    overlap: [],
  };

  return {
    fixture,
    maker,
    run,
    ms: 0,
    error: null,
    items: picks.map((id) => ({ id, name: id.replace(/_/g, " "), description: "", unit: "reps", sets: 2, reps: 10, holdSeconds: null, rationale: null })),
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
    run: 0,
    plan: {
      criteria: [{ id: "NECK-2", verdict: "missed", reason: "Nothing for the shoulder girdle." }],
      picks: [{ id: "Upright_Row", verdict: "suits", reason: "Fine." }],
    },
    rationales: { safety: safety("met") },
    failed: [],
    errors: [],
  },
  {
    fixture: "neck-desk",
    maker: "heuristic",
    run: 0,
    plan: {
      criteria: [{ id: "NECK-2", verdict: "missed", reason: "The row is not girdle endurance work." }],
      picks: [{ id: "Upright_Row", verdict: "unsuitable", reason: "Upright rows load an irritable neck." }],
    },
    rationales: null,
    failed: [],
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
    const failed: Judged[] = [
      JUDGED[0],
      { ...JUDGED[1], plan: null, failed: ["plan"], errors: ["attempt 1: boom", "attempt 2: boom"] },
    ];

    expect(markdown(failed)).toContain("| Judge failures | 0 | 1 |");
    expect(markdown(failed)).toContain("- **neck-desk · heuristic · run 1:** failed (plan). attempt 1: boom; attempt 2: boom");
  });

  it("lists an attempt a retry recovered without counting it as a failure", () => {
    const recovered: Judged[] = [{ ...JUDGED[0], errors: ["attempt 1: boom"] }, JUDGED[1]];

    expect(markdown(recovered)).toContain("| Judge failures | 0 | 0 |");
    expect(markdown(recovered)).toContain("- **neck-desk · gemini · run 1:** recovered. attempt 1: boom");
  });

  it("shows the spread of unsuitable picks across runs", () => {
    const runs: Judged[] = [JUDGED[1], { ...JUDGED[1], run: 1, plan: { ...JUDGED[1].plan!, picks: [{ id: "Upright_Row", verdict: "suits", reason: "Fine." }] } }];
    const md = toJudgedMarkdown(stamp, ["heuristic"], [graded("heuristic", {}), graded("heuristic", {}, { run: 1 })], runs);

    expect(md).toContain("| Picks rated unsuitable, lowest–highest run | 0–100% |");
  });
});

describe("the judge's own consistency", () => {
  it("counts each verdict on a plan it saw twice as the same every time or not", () => {
    // Both makers picked the same one exercise for the same fixture, so the
    // judge got the same request twice: NECK-2 alike, the pick not.
    expect(markdown()).toContain("1 of 2 (50%) of its verdicts were the same every time");
  });

  it("says nothing when it never saw a plan twice", () => {
    const one = toJudgedMarkdown(stamp, ["gemini"], [graded("gemini", {})], [JUDGED[0]]);

    expect(one).not.toContain("own consistency");
  });
});

describe("consistency", () => {
  const rows = (results: Graded[], runs: number) => Object.fromEntries(consistency(results, runs));

  it("shows the spread of a rate across runs, and how much the picks overlap", () => {
    const results = [
      graded("gemini", { met: ["NECK-1", "NECK-2"] }, { run: 0, picks: ["A", "B"] }),
      graded("gemini", { met: ["NECK-1"], missed: ["NECK-2"] }, { run: 1, picks: ["A", "C"] }),
    ];

    expect(rows(results, 2)).toMatchObject({
      "Provisional criteria met (code), lowest–highest run": "50–100%",
      // A and B against A and C: one shared of three.
      "Picks two runs share, mean": "33%",
      "Fixtures with the same picks every run": "0 of 1 (0%)",
    });
  });

  it("counts a fixture whose picks never change, in any order", () => {
    const results = [0, 1, 2].map((run) => graded("heuristic", {}, { run, picks: run === 1 ? ["B", "A"] : ["A", "B"] }));

    expect(rows(results, 3)).toMatchObject({
      "Picks two runs share, mean": "100%",
      "Fixtures with the same picks every run": "1 of 1 (100%)",
    });
  });

  it("treats a failed run as one that picked nothing", () => {
    const failed = { ...graded("gemini", {}, { run: 1 }), error: "timeout", items: null };

    expect(rows([graded("gemini", {}, { run: 0 }), failed], 2)["Picks two runs share, mean"]).toBe("0%");
  });
});
