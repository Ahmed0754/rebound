// Turns a run's graded results into the plain report a person reads. The JSON
// beside it holds everything; this is the summary.
//
// A failed generation counts in every number here. Where it can't - attempts,
// say, which a failed generation never reports - the number is not printed,
// and the report says why, rather than averaging over the plans that worked.

import type { Quality } from "../src/models/regimes.js";
import type { RegimeItem } from "../src/types/index.js";
import type { Grade } from "./graders.js";

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

function summary(results: Graded[]): [string, string][] {
  const generated = results.filter((result) => result.error === null);
  const met = results.reduce((sum, result) => sum + result.grade.quality.met.length, 0);
  const asked = results.reduce(
    (sum, result) => sum + result.grade.quality.met.length + result.grade.quality.missed.length,
    0
  );
  // A fixture where no criterion could count says nothing about quality.
  const graded = results.filter(
    (result) => result.grade.quality.met.length + result.grade.quality.missed.length > 0
  );
  const seconds = results.map((result) => result.ms / 1000);

  return [
    ["Plans generated", percent(generated.length, results.length)],
    ["Passed the hard checks", percent(results.filter((r) => r.grade.hard.length === 0).length, results.length)],
    ["Live criteria met", percent(met, asked)],
    [
      "Plans meeting every live criterion",
      `${percent(graded.filter((r) => r.grade.quality.missed.length === 0).length, graded.length)} of the fixtures any applied to`,
    ],
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
  const unsatisfiable = results
    .filter((r) => r.maker === stamp.makers[0] && r.grade.quality.unsatisfiable.length > 0)
    .map((r) => `${r.fixture} (${r.grade.quality.unsatisfiable.join(", ")})`);

  lines.push(
    "",
    `**Criteria no candidate could meet**, so not counted: ${unsatisfiable.join("; ") || "none"}.`,
    "",
    "## By fixture",
    "",
    row(["Fixture", "Maker", "Plan", "Attempts", "Met", "Missed", "Notes"]),
    row(["---", "---", "---", "---", "---", "---", "---"])
  );

  for (const r of results) {
    const notes = [
      r.grade.hard.length > 0 && r.error === null ? `hard: ${r.grade.hard.length}` : "",
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
