// Runs the judge (piece D) over a report `pnpm eval` already wrote, so the
// judge can change without generating every plan again. `pnpm eval:judge
// [reports/<stamp>.json] [--concurrency N]`, the latest report when none is
// named.
//
// Every plan is regraded with today's graders first. Writes
// <stamp>.judged.json and .judged.md beside the report. Never saves anything
// else and never touches a real user: the fixtures are made up.

import { execSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getLimits } from "../src/clinical.js";
import { loadFixtures } from "./fixture.js";
import { grade, PROVISIONAL, RUBRIC_VERSION } from "./graders.js";
import {
  buildPlanJudgeRequest,
  judgePlan,
  judgeRationales,
  JUDGE_MODEL,
  JUDGE_VERSION,
  type JudgeCase,
  type PlanJudgement,
} from "./judge.js";
import { mapLimit, wholeNumberArg } from "./parallel.js";
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

// Only the provisional criteria code can't grade go to the judge: the rest
// are graded once, in code (graders.ts).
const JUDGE_ONLY = PROVISIONAL.filter((criterion) => criterion.meets === undefined);

async function main() {
  const file = process.argv.slice(2).find((arg) => arg.endsWith(".json")) ?? (await latestReport());
  const report = JSON.parse(await readFile(file, "utf8")) as {
    commit: string;
    model: string;
    makers: string[];
    results: Graded[];
  };
  const fixtures = new Map((await loadFixtures()).map((fixture) => [fixture.id, fixture]));
  const concurrency = wholeNumberArg("--concurrency", 8);

  // The same picks for the same person make the same blind request, whichever
  // maker or run they came from - the heuristic's every run, for one. Each is
  // asked once and the judgement reused; the promise is kept, not the answer,
  // so two workers reaching the same plan at once still share one call.
  const asked = new Map<string, Promise<{ plan: PlanJudgement | null; errors: string[] }>>();
  let reused = 0;

  // A few plans at a time (`--concurrency`, 8 unless set); results keep the
  // report's order. A report from before repeats has no run numbers; all of
  // it is run 0.
  const both = await mapLimit(report.results.map((r) => ({ ...r, run: r.run ?? 0 })), concurrency, async (result) => {
    const fixture = fixtures.get(result.fixture);

    if (fixture === undefined) {
      throw new Error(`${result.fixture}: no such fixture, so its plans can't be judged`);
    }

    const limits = getLimits(fixture.answers);
    const context = { region: fixture.answers.region, answers: fixture.answers, limits };
    const regraded = { ...result, grade: grade(result.items, fixture.candidates, context) };
    const criteria = JUDGE_ONLY.filter((c) => c.appliesTo(context)).map(({ id, says }) => ({ id, says }));
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
    let plan: PlanJudgement | null;

    if (result.items === null) {
      plan = { criteria: criteria.map(({ id }) => ({ id, verdict: "missed", reason: "No plan was generated." })), picks: [] };
    } else {
      const key = JSON.stringify(buildPlanJudgeRequest(input));
      const earlier = asked.get(key);

      if (earlier === undefined) {
        const fresh = (async () => {
          const own: string[] = [];
          return { plan: await twice(() => judgePlan(input), own), errors: own };
        })();
        asked.set(key, fresh);
        const answer = await fresh;
        plan = answer.plan;
        // Its errors are reported once, against the plan that made the call.
        errors.push(...answer.errors);
      } else {
        reused++;
        plan = (await earlier).plan;
      }
    }

    // Rationales differ run to run, so these are never reused.
    const hasRationales = (result.items ?? []).some((item) => item.rationale);
    const rationales = hasRationales ? await twice(() => judgeRationales(input), errors) : null;
    const failed = [
      ...(plan === null ? (["plan"] as const) : []),
      ...(hasRationales && rationales === null ? (["rationales"] as const) : []),
    ];
    console.log(
      `${result.fixture} · ${result.maker} · run ${result.run + 1} · ${plan === null ? "judge failed" : `${plan.picks.filter((p) => p.verdict !== "suits").length} picks flagged`}${errors.length > 0 ? ` · ${errors.length} errors` : ""}`
    );
    const judgement: Judged = { fixture: result.fixture, maker: result.maker, run: result.run, plan, rationales, failed, errors };
    return { regraded, judgement };
  });
  const graded: Graded[] = both.map((b) => b.regraded);
  const judged: Judged[] = both.map((b) => b.judgement);

  const stamp: JudgeStamp = {
    judgedAt: new Date().toISOString(),
    report: file.split(/[\\/]/).pop()!,
    commit: report.commit,
    model: report.model,
    judgeModel: JUDGE_MODEL,
    judgeVersion: JUDGE_VERSION,
    rubric: RUBRIC_VERSION,
    reused,
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
