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
// (report.ts). The two baselines come next (piece B).

import { execSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { getLimits, type Answers, type Limits } from "../src/clinical.js";
import type { Candidate } from "../src/models/exercises.js";
import { MODEL } from "../src/models/gemini.js";
import { generate, type Quality } from "../src/models/regimes.js";
import type { RegimeItem } from "../src/types/index.js";
import { grade, rubric } from "./graders.js";
import { toMarkdown, type Graded, type Stamp } from "./report.js";

const FIXTURES = join(import.meta.dirname, "fixtures");
const REPORTS = join(import.meta.dirname, "reports");

/** A made-up person and the exercises they were offered, frozen. */
type Fixture = {
  // The file name, without .json.
  id: string;
  // What this fixture is here to test, in a line.
  about: string;
  answers: Answers;
  freeText: string | null;
  // When `pnpm eval:freeze` drew the candidates.
  frozenAt: string;
  candidates: Candidate[];
};

type Plan = { items: RegimeItem[]; quality: Quality | null };

/** One way of making a plan from a fixture. */
type Maker = {
  id: string;
  make: (fixture: Fixture, limits: Limits) => Promise<Plan>;
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
];

async function loadFixtures(): Promise<Fixture[]> {
  await mkdir(FIXTURES, { recursive: true });
  const files = (await readdir(FIXTURES)).filter((file) => file.endsWith(".json")).sort();

  return Promise.all(
    files.map(async (file) => ({
      ...JSON.parse(await readFile(join(FIXTURES, file), "utf8")),
      id: basename(file, ".json"),
    }))
  );
}

// What one maker made of one fixture, graded. A failure is kept, never
// dropped: it is graded as an empty plan.
async function run(maker: Maker, fixture: Fixture): Promise<Graded> {
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
      plan = await maker.make(fixture, limits);
    } catch (caught) {
      error = String(caught);
    }
  }

  return {
    fixture: fixture.id,
    maker: maker.id,
    ms: Date.now() - started,
    error,
    items: plan?.items ?? null,
    quality: plan?.quality ?? null,
    grade: grade(plan?.items ?? null, fixture.candidates, context),
  };
}

async function main() {
  const fixtures = await loadFixtures();

  if (fixtures.length === 0) {
    console.log(`No fixtures in ${FIXTURES} yet, so nothing to run.`);
    return;
  }

  const results: Graded[] = [];

  // One at a time: the Gemini makers share one API key's rate limit, and the
  // time each plan takes is part of what is measured.
  for (const fixture of fixtures) {
    for (const maker of MAKERS) {
      const result = await run(maker, fixture);
      results.push(result);
      console.log(
        `${fixture.id} · ${maker.id} · ${result.error === null ? `${result.items!.length} exercises` : `failed: ${result.error}`} · ${result.ms} ms`
      );
    }
  }

  const stamp: Stamp = {
    ranAt: new Date().toISOString(),
    // "-dirty" when the code that ran was not all committed.
    commit: execSync("git describe --always --dirty").toString().trim(),
    model: MODEL,
    rubric: rubric().version,
    fixtures: fixtures.length,
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
