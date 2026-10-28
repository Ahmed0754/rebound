// Runs the judge (piece D) over a report `pnpm eval` already wrote, so the
// judge can change without generating every plan again. `pnpm eval:judge
// [reports/<stamp>.json]`, the latest report when none is named.
//
// Every plan is regraded with today's graders first, so the provisional code
// grades the judge is compared with are current. Writes <stamp>.judged.json
// and .judged.md beside the report. Never saves anything else and never
// touches a real user: the fixtures are made up.

import { execSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getLimits } from "../src/clinical.js";
import { loadFixtures } from "./fixture.js";
import { grade, PROVISIONAL, RUBRIC_VERSION } from "./graders.js";
import { judgePlan, judgeRationales, JUDGE_MODEL, JUDGE_VERSION, type JudgeCase } from "./judge.js";
import { REPORTS, toJudgedMarkdown, type Graded, type Judged, type JudgeStamp } from "./report.js";

async function latestReport(): Promise<string> {
  const reports = (await readdir(REPORTS)).filter((file) => /^[^.]+\.json$/.test(file)).sort();

  if (reports.length === 0) {
    throw new Error(`no report in ${REPORTS} yet; run \`pnpm eval\` first`);
  }

  return join(REPORTS, reports[reports.length - 1]);
}

// One retry: a judge call is cheap and a hole in the report is not.
async function twice<T>(ask: () => Promise<T>, errors: string[]): Promise<T | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await ask();
    } catch (caught) {
      errors.push(`attempt ${attempt}: ${String(caught)}`);
    }
  }

  return null;
}

async function main() {
  const file = process.argv[2] ?? (await latestReport());
  const report = JSON.parse(await readFile(file, "utf8")) as {
    commit: string;
    model: string;
    makers: string[];
    results: Graded[];
  };
  const fixtures = new Map((await loadFixtures()).map((fixture) => [fixture.id, fixture]));
  const graded: Graded[] = [];
  const judged: Judged[] = [];

  // One at a time, for the same rate limit the eval itself keeps to.
  for (const result of report.results) {
    const fixture = fixtures.get(result.fixture);

    if (fixture === undefined) {
      throw new Error(`${result.fixture}: no such fixture, so its plans can't be judged`);
    }

    const limits = getLimits(fixture.answers);
    const context = { region: fixture.answers.region, answers: fixture.answers, limits };
    const regraded = { ...result, grade: grade(result.items, fixture.candidates, context) };
    graded.push(regraded);

    // A criterion the code knows no candidate could meet is not held against
    // the plan, by the judge any more than by the code.
    const criteria = PROVISIONAL.filter(
      (c) => c.appliesTo(context) && !regraded.grade.provisional.unsatisfiable.includes(c.id)
    ).map(({ id, says }) => ({ id, says }));
    const input: JudgeCase = {
      region: fixture.answers.region,
      answers: fixture.answers,
      freeText: fixture.freeText,
      limits,
      items: result.items ?? [],
      tags: new Map(fixture.candidates.map((candidate) => [candidate.id, candidate])),
      criteria,
    };
    const errors: string[] = [];

    const plan =
      result.items === null
        ? {
            criteria: criteria.map(({ id }) => ({ id, verdict: "missed" as const, reason: "No plan was generated." })),
            picks: [],
          }
        : await twice(() => judgePlan(input), errors);
    const rationales = (result.items ?? []).some((item) => item.rationale)
      ? await twice(() => judgeRationales(input), errors)
      : null;

    judged.push({ fixture: result.fixture, maker: result.maker, plan, rationales, errors });
    console.log(
      `${result.fixture} · ${result.maker} · ${plan === null ? "judge failed" : `${plan.picks.filter((p) => p.verdict !== "suits").length} picks flagged`}${errors.length > 0 ? ` · ${errors.length} errors` : ""}`
    );
  }

  const stamp: JudgeStamp = {
    judgedAt: new Date().toISOString(),
    report: file.split(/[\\/]/).pop()!,
    commit: report.commit,
    model: report.model,
    judgeModel: JUDGE_MODEL,
    judgeVersion: JUDGE_VERSION,
    rubric: RUBRIC_VERSION,
  };
  const markdown = toJudgedMarkdown(stamp, report.makers, graded, judged);
  const out = file.replace(/\.json$/, "");

  await writeFile(
    `${out}.judged.json`,
    `${JSON.stringify(
      {
        ...stamp,
        // The code that judged, which may be later than the code that generated.
        judgedAtCommit: execSync("git describe --always --dirty").toString().trim(),
        results: judged,
        graded,
      },
      null,
      2
    )}\n`
  );
  await writeFile(`${out}.judged.md`, markdown);
  console.log(`\n${markdown}\nWrote ${out}.judged.json and .md`);
}

await main();
