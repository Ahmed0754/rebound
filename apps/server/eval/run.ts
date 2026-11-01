// The offline eval (FUTURE_WORK Track Q): makes a plan for every fixture in
// eval/fixtures/ with every plan maker, and writes what came back to
// eval/reports/. It never saves a plan and never touches a real user.
//
// Each fixture freezes its 20 candidates, so every maker - and every run -
// picks from the same exercises. Limits are worked out from the answers at
// run time, so a change to the rules shows up in the next report.
//
// Every plan is graded in code (graders.ts), and each run writes two files:
// the JSON with everything, and the markdown summary a person reads
// (report.ts). Two of the makers are Gemini; two use no model (baselines.ts).

import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getLimits, type Limits } from "../src/clinical.js";
import { MODEL } from "../src/models/gemini.js";
import { generate, type Quality } from "../src/models/regimes.js";
import type { RegimeItem } from "../src/types/index.js";
import { heuristicPlan, randomPlan } from "./baselines.js";
import { FIXTURES, loadFixtures, type Fixture } from "./fixture.js";
import { POOLS } from "./pools.js";
import { grade, rubric } from "./graders.js";
import { REPORTS, toMarkdown, type Graded, type Stamp } from "./report.js";

type Plan = { items: RegimeItem[]; quality: Quality | null };

/** One way of making a plan from a fixture. `run` counts the repeats, from 0. */
type Maker = {
  id: string;
  make: (fixture: Fixture, limits: Limits, run: number) => Promise<Plan>;
};

function gemini(enforceQuality: boolean) {
  return (fixture: Fixture, limits: Limits) =>
    generate({
      region: fixture.answers.region,
      candidates: fixture.candidates,
      tagged: fixture.candidates,
      limits,
      answers: fixture.answers,
      freeText: fixture.freeText,
      enforceQuality,
    });
}

const MAKERS: Maker[] = [
  // Today's pipeline, as `create` runs it.
  { id: "gemini", make: gemini(true) },
  // The same, without retrying for quality: what the quality tier adds.
  { id: "gemini-no-quality", make: gemini(false) },
  // No model at all: what Gemini adds over a few rules, and over chance. The
  // heuristic is deterministic, so its repeats are identical by design.
  { id: "heuristic", make: (fixture, limits) => heuristicPlan(fixture, limits) },
  { id: "random", make: randomPlan },
];

// `--runs 5` repeats every maker on every fixture (piece E): one run is within
// noise of the next, so a difference between makers means little without the
// spread beside it.
function runsWanted(): number {
  const at = process.argv.indexOf("--runs");
  const runs = at === -1 ? 1 : Number(process.argv[at + 1]);

  if (!Number.isInteger(runs) || runs < 1) {
    throw new Error(`--runs needs a whole number of at least 1, not ${process.argv[at + 1]}`);
  }

  return runs;
}

// What one maker made of one fixture, graded. A failure is kept, never
// dropped: it is graded as an empty plan.
async function run(maker: Maker, fixture: Fixture, repeat: number): Promise<Graded> {
  const limits = getLimits(fixture.answers);
  const context = { region: fixture.answers.region, answers: fixture.answers, limits };
  const started = Date.now();
  let plan: Plan | null = null;
  let error: string | null = null;

  // The same refusal `create` makes before it calls the model.
  if (fixture.candidates.length < limits.count.min) {
    error = `${fixture.candidates.length} candidates, fewer than the ${limits.count.min} a plan needs`;
  } else {
    try {
      plan = await maker.make(fixture, limits, repeat);
    } catch (caught) {
      error = String(caught);
    }
  }

  return {
    fixture: fixture.id,
    maker: maker.id,
    run: repeat,
    ms: Date.now() - started,
    error,
    items: plan?.items ?? null,
    quality: plan?.quality ?? null,
    grade: grade(plan?.items ?? null, fixture.candidates, context),
  };
}

async function main() {
  const runs = runsWanted();
  // `--pool <name>` runs on one of piece E's other candidate pools (pools.ts)
  // instead of the 20 `create` would draw.
  const at = process.argv.indexOf("--pool");
  const pool = at === -1 ? undefined : process.argv[at + 1];
  const dir = pool === undefined ? FIXTURES : join(POOLS, pool);
  const fixtures = await loadFixtures(dir);

  if (fixtures.length === 0) {
    console.log(`No fixtures in ${dir} yet, so nothing to run.`);
    return;
  }

  const results: Graded[] = [];

  // One at a time: the Gemini makers share one API key's rate limit, and the
  // time each plan takes is part of what is measured.
  for (let repeat = 0; repeat < runs; repeat++) {
    for (const fixture of fixtures) {
      for (const maker of MAKERS) {
        const result = await run(maker, fixture, repeat);
        results.push(result);
        console.log(
          `run ${repeat + 1}/${runs} · ${fixture.id} · ${maker.id} · ${result.error === null ? `${result.items!.length} exercises` : `failed: ${result.error}`} · ${result.ms} ms`
        );
      }
    }
  }

  const stamp: Stamp = {
    ranAt: new Date().toISOString(),
    // "-dirty" when the code that ran was not all committed.
    commit: execSync("git describe --always --dirty").toString().trim(),
    model: MODEL,
    rubric: rubric().version,
    fixtures: fixtures.length,
    runs,
    ...(pool === undefined ? {} : { pool }),
    makers: MAKERS.map((maker) => maker.id),
  };
  const report = {
    ...stamp,
    rubric: rubric(),
    frozenAt: Object.fromEntries(fixtures.map((fixture) => [fixture.id, fixture.frozenAt])),
    results,
  };
  const markdown = toMarkdown(stamp, results);

  await mkdir(REPORTS, { recursive: true });
  const file = join(REPORTS, stamp.ranAt.replace(/[:.]/g, "-"));
  await writeFile(`${file}.json`, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(`${file}.md`, markdown);
  console.log(`\n${markdown}\nWrote ${file}.json and .md`);
}

await main();
