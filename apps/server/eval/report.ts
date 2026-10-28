// Turns a run's graded results into the plain report a person reads. The JSON
// beside it holds everything; this is the summary.
//
// A failed generation counts in every number here. Where it can't - attempts,
// say, which a failed generation never reports - the number is not printed,
// and the report says why, rather than averaging over the plans that worked.
//
// The judge's report (`toJudgedMarkdown`) is a separate file, so a provisional
// score never sits in the same table as a primary one.

import { join } from "node:path";
import type { Quality } from "../src/models/regimes.js";
import type { QualityResult } from "../src/quality.js";
import type { RegimeItem } from "../src/types/index.js";
import { PROVISIONAL, type Grade } from "./graders.js";
import { SAFETY, type PlanJudgement, type RationaleJudgement } from "./judge.js";

export const REPORTS = join(import.meta.dirname, "reports");

/** One maker's attempt at one fixture, graded. */
export type Graded = {
  fixture: string;
  maker: string;
  ms: number;
  // Null when a plan came back.
  error: string | null;
  items: RegimeItem[] | null;
  quality: Quality | null;
  grade: Grade;
};

export type Stamp = {
  ranAt: string;
  commit: string;
  model: string;
  rubric: string;
  fixtures: number;
  makers: string[];
};

const percent = (part: number, whole: number) =>
  whole === 0 ? "-" : `${part} of ${whole} (${Math.round((part / whole) * 100)}%)`;

// For a number a failed generation has no value for.
function unlessFailed(results: Graded[], print: (generated: Graded[]) => string): string {
  const failed = results.filter((result) => result.error !== null).length;
  return failed > 0 ? `not printed: ${failed} failed` : print(results);
}

// How many criteria were met of those that could count, and how many plans
// met every one, for the live criteria or the provisional ones.
function criteriaMet(results: Graded[], of: (grade: Grade) => QualityResult): [string, string] {
  const counted = (result: Graded) => of(result.grade).met.length + of(result.grade).missed.length;
  const met = results.reduce((sum, result) => sum + of(result.grade).met.length, 0);
  const asked = results.reduce((sum, result) => sum + counted(result), 0);
  // A fixture where no criterion could count says nothing about quality.
  const graded = results.filter((result) => counted(result) > 0);

  return [
    percent(met, asked),
    `${percent(graded.filter((r) => of(r.grade).missed.length === 0).length, graded.length)} of the fixtures any applied to`,
  ];
}

function summary(results: Graded[]): [string, string][] {
  const generated = results.filter((result) => result.error === null);
  const [met, every] = criteriaMet(results, (grade) => grade.quality);
  const seconds = results.map((result) => result.ms / 1000);

  return [
    ["Plans generated", percent(generated.length, results.length)],
    ["Passed the hard checks", percent(results.filter((r) => r.grade.hard.length === 0).length, results.length)],
    ["Live criteria met", met],
    ["Plans meeting every live criterion", every],
    [
      "First valid plan missed a criterion",
      unlessFailed(results, (all) =>
        percent(all.filter((r) => (r.quality?.firstMissed.length ?? 0) > 0).length, all.length)
      ),
    ],
    [
      "Attempts per plan, mean",
      unlessFailed(results, (all) =>
        (all.reduce((sum, r) => sum + (r.quality?.attempts ?? 1), 0) / all.length).toFixed(2)
      ),
    ],
    [
      "Seconds per plan, mean / max",
      `${(seconds.reduce((a, b) => a + b, 0) / seconds.length).toFixed(1)} / ${Math.max(...seconds).toFixed(1)}`,
    ],
    [
      "Every dose at its ceiling",
      unlessFailed(results, (all) => percent(all.filter((r) => r.grade.pinned).length, all.length)),
    ],
    [
      "Repeats a movement pattern",
      unlessFailed(results, (all) => percent(all.filter((r) => r.grade.overlap.length > 0).length, all.length)),
    ],
  ];
}

function benchmarkCounts(results: Graded[]): string {
  const counts = new Map<string, number>();
  let items = 0;

  for (const result of results) {
    items += result.items?.length ?? 0;

    for (const note of result.grade.benchmarks) {
      counts.set(note.id, (counts.get(note.id) ?? 0) + 1);
    }
  }

  const listed = [...counts].map(([id, count]) => `${id} ${count}`).join(", ");
  return `${listed || "none"} (across ${items} exercises)`;
}

// A pipe in an exercise name or an error would split the cell.
function row(cells: (string | number)[]): string {
  return `| ${cells.map((cell) => String(cell).replace(/\|/g, "\\|")).join(" | ")} |`;
}

export function toMarkdown(stamp: Stamp, results: Graded[]): string {
  const lines: string[] = [
    `# Eval report · ${stamp.ranAt}`,
    "",
    `Commit \`${stamp.commit}\` · model \`${stamp.model}\` · rubric ${stamp.rubric} · ${stamp.fixtures} fixtures`,
    "",
    "A failed generation is graded as an empty plan, so it counts against every rate below.",
    "",
    "## Summary",
    "",
    row(["", ...stamp.makers]),
    row(["---", ...stamp.makers.map(() => "---")]),
  ];

  const byMaker = stamp.makers.map((maker) => summary(results.filter((r) => r.maker === maker)));

  for (let i = 0; i < byMaker[0].length; i++) {
    lines.push(row([byMaker[0][i][0], ...byMaker.map((rows) => rows[i][1])]));
  }

  lines.push(
    "",
    "**Dose benchmarks** (REFERENCES.md §2). These are notes, not failures: where Rebound is stricter than a source, that is by design and goes to the expert.",
    "",
    ...stamp.makers.map(
      (maker) => `- ${maker}: ${benchmarkCounts(results.filter((r) => r.maker === maker))}`
    )
  );

  // The same for every maker: it depends only on the frozen candidates.
  const unsatisfiable = (of: (grade: Grade) => QualityResult) =>
    results
      .filter((r) => r.maker === stamp.makers[0] && of(r.grade).unsatisfiable.length > 0)
      .map((r) => `${r.fixture} (${of(r.grade).unsatisfiable.join(", ")})`)
      .join("; ") || "none";

  const provisional = stamp.makers.map((maker) =>
    criteriaMet(
      results.filter((r) => r.maker === maker),
      (grade) => grade.provisional
    )
  );
  const judgeOnly = PROVISIONAL.filter((criterion) => criterion.meets === undefined).map((c) => c.id);

  lines.push(
    "",
    `**Criteria no candidate could meet**, so not counted: ${unsatisfiable((grade) => grade.quality)}.`,
    "",
    "## Provisional criteria",
    "",
    "Graded here only. The live check never enforces these, so no maker was retried until it met them, and a difference between makers is not there by construction. They are provisional: each extrapolates from a guideline about one condition, mostly read through a summary, and nobody has reviewed whether it is fair to grade a plan on it (REFERENCES.md §3). They are kept out of the summary above so they cannot move it.",
    "",
    row(["", ...stamp.makers]),
    row(["---", ...stamp.makers.map(() => "---")]),
    row(["Provisional criteria met, in code", ...provisional.map(([met]) => met)]),
    row(["Plans meeting every one", ...provisional.map(([, every]) => every)]),
    "",
    `**Not graded in code:** ${judgeOnly.join(", ")}. Only the judge can grade these.`,
    "",
    `**Provisional criteria no candidate could meet**, so not counted: ${unsatisfiable((grade) => grade.provisional)}.`,
    "",
    "## By fixture",
    "",
    row(["Fixture", "Maker", "Plan", "Attempts", "Met", "Missed", "Notes"]),
    row(["---", "---", "---", "---", "---", "---", "---"])
  );

  for (const r of results) {
    const notes = [
      r.grade.hard.length > 0 && r.error === null ? `hard: ${r.grade.hard.length}` : "",
      r.grade.provisional.missed.length > 0 ? `provisional missed: ${r.grade.provisional.missed.join(", ")}` : "",
      r.grade.pinned ? "all at ceiling" : "",
      r.grade.overlap.length > 0 ? `repeats: ${r.grade.overlap.map((ids) => ids.join(" + ")).join("; ")}` : "",
      r.grade.benchmarks.length > 0 ? `benchmarks: ${r.grade.benchmarks.length}` : "",
    ].filter(Boolean);

    lines.push(
      row([
        r.fixture,
        r.maker,
        r.error === null ? r.items!.map((item) => item.name).join(", ") : "**failed**",
        r.quality?.attempts ?? "-",
        r.grade.quality.met.join(", ") || "-",
        r.grade.quality.missed.join(", ") || "-",
        notes.join(" · ") || "-",
      ])
    );
  }

  const errors = results.filter((r) => r.error !== null);

  if (errors.length > 0) {
    lines.push("", "## Errors", "", ...errors.map((r) => `- **${r.fixture} · ${r.maker}:** ${r.error}`));
  }

  return `${lines.join("\n")}\n`;
}

/** What the judge made of one maker's plan for one fixture (piece D). */
export type Judged = {
  fixture: string;
  maker: string;
  // Null only when the judge failed; a failed generation is judged as an
  // empty plan, missing every criterion, without asking the model.
  plan: PlanJudgement | null;
  // Null when the plan had no rationales, or the judge failed.
  rationales: RationaleJudgement | null;
  errors: string[];
};

export type JudgeStamp = {
  judgedAt: string;
  // The report whose plans were judged, and what made them.
  report: string;
  commit: string;
  model: string;
  judgeModel: string;
  judgeVersion: string;
  rubric: string;
};

function judgeSummary(graded: Graded[], judged: Judged[]): [string, string][] {
  const criteria = judged.flatMap((j) => j.plan?.criteria ?? []);
  const picks = judged.flatMap((j) => j.plan?.picks ?? []);
  const withRationales = judged.filter((j) => j.rationales !== null);
  const broken = withRationales.flatMap((j) => j.rationales!.safety.filter((s) => s.verdict === "missed"));
  const { agree, compared } = agreement(graded, judged);

  return [
    ["Provisional criteria met, judge", percent(criteria.filter((c) => c.verdict === "met").length, criteria.length)],
    ["Agrees with the code grade", percent(agree, compared)],
    ["Picks rated unsuitable", percent(picks.filter((p) => p.verdict === "unsuitable").length, picks.length)],
    ["Picks rated questionable", percent(picks.filter((p) => p.verdict === "questionable").length, picks.length)],
    [
      "Safety statements broken",
      withRationales.length === 0 ? "no rationales" : percent(broken.length, withRationales.length * SAFETY.length),
    ],
    ["Judge failures", String(judged.filter((j) => j.errors.length > 0).length)],
  ];
}

// Where the code and the judge both graded a criterion on the same plan.
function comparisons(graded: Graded[], judged: Judged[]) {
  return judged.flatMap((j) => {
    const code = graded.find((g) => g.fixture === j.fixture && g.maker === j.maker)?.grade.provisional;

    return (j.plan?.criteria ?? []).flatMap((c) => {
      const byCode = code?.met.includes(c.id) ? "met" : code?.missed.includes(c.id) ? "missed" : null;
      return byCode === null ? [] : [{ judged: j, criterion: c, byCode }];
    });
  });
}

function agreement(graded: Graded[], judged: Judged[]) {
  const all = comparisons(graded, judged);
  return { agree: all.filter((c) => c.byCode === c.criterion.verdict).length, compared: all.length };
}

/** The judge's report on a run's plans. Every score in it is provisional. */
export function toJudgedMarkdown(stamp: JudgeStamp, makers: string[], graded: Graded[], judged: Judged[]): string {
  const name = (j: Judged, id: string) =>
    graded.find((g) => g.fixture === j.fixture && g.maker === j.maker)?.items?.find((item) => item.id === id)?.name ?? id;
  const lines: string[] = [
    `# Judge report · ${stamp.judgedAt}`,
    "",
    `Judged \`${stamp.report}\` (commit \`${stamp.commit}\`, model \`${stamp.model}\`) · judge \`${stamp.judgeModel}\` · judge ${stamp.judgeVersion} · rubric ${stamp.rubric}`,
    "",
    "**Provisional.** These are one model's opinions, not yet calibrated against an expert's. Use them to find the plans worth a person's look, not as a score.",
  ];

  if (stamp.judgeModel === stamp.model) {
    lines.push("", "**The judge is the same model that wrote the Gemini plans**, and a model may rate its own plans kindly.");
  }

  lines.push(
    "",
    "The judge saw each plan's exercises and the person's answers, in the same prompt and the same order for every maker, without rationales, doses or the maker's name. How many exercises a plan has can still differ by maker. It graded only the provisional criteria, never the live ones, and none that no candidate could meet. A failed generation counts as an empty plan, missing every criterion.",
    "",
    "## Summary",
    "",
    row(["", ...makers]),
    row(["---", ...makers.map(() => "---")])
  );

  const byMaker = makers.map((maker) =>
    judgeSummary(
      graded.filter((g) => g.maker === maker),
      judged.filter((j) => j.maker === maker)
    )
  );

  for (let i = 0; i < byMaker[0].length; i++) {
    lines.push(row([byMaker[0][i][0], ...byMaker.map((rows) => rows[i][1])]));
  }

  const flagged = judged.flatMap((j) =>
    (j.plan?.picks ?? []).filter((p) => p.verdict === "unsuitable").map((p) => ({ j, p }))
  );
  lines.push(
    "",
    "## Picks rated unsuitable",
    "",
    ...(flagged.length === 0
      ? ["None."]
      : flagged.map(({ j, p }) => `- **${j.fixture} · ${j.maker} · ${name(j, p.id)}:** ${p.reason}`))
  );

  const disagreements = comparisons(graded, judged).filter((c) => c.byCode !== c.criterion.verdict);
  lines.push(
    "",
    "## Where the judge and the code disagree",
    "",
    ...(disagreements.length === 0
      ? ["Nowhere."]
      : disagreements.map(
          ({ judged: j, criterion: c, byCode }) =>
            `- **${j.fixture} · ${j.maker} · ${c.id}:** code says ${byCode}, judge says ${c.verdict}. ${c.reason}`
        ))
  );

  const broken = judged.flatMap((j) =>
    (j.rationales?.safety ?? []).filter((s) => s.verdict === "missed").map((s) => ({ j, s }))
  );
  lines.push(
    "",
    "## Rationales that break a safety statement",
    "",
    ...(broken.length === 0 ? ["None."] : broken.map(({ j, s }) => `- **${j.fixture} · ${j.maker} · ${s.id}:** ${s.reason}`)),
    "",
    "## By fixture",
    "",
    row(["Fixture", "Maker", "Criteria met", "Criteria missed", "Questionable", "Unsuitable"]),
    row(["---", "---", "---", "---", "---", "---"])
  );

  for (const j of judged) {
    const ids = (verdict: string) =>
      (j.plan?.criteria ?? []).filter((c) => c.verdict === verdict).map((c) => c.id).join(", ") || "-";
    const picks = (verdict: string) =>
      (j.plan?.picks ?? []).filter((p) => p.verdict === verdict).map((p) => name(j, p.id)).join(", ") || "-";

    lines.push(
      row([j.fixture, j.maker, ids("met"), ids("missed"), picks("questionable"), picks("unsuitable")])
    );
  }

  const failed = judged.filter((j) => j.errors.length > 0);

  if (failed.length > 0) {
    lines.push("", "## Judge errors", "", ...failed.map((j) => `- **${j.fixture} · ${j.maker}:** ${j.errors.join("; ")}`));
  }

  return `${lines.join("\n")}\n`;
}
