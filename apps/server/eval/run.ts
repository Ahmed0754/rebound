// The offline eval (FUTURE_WORK Track Q): makes a plan for every fixture in
// eval/fixtures/ with every plan maker, and writes what came back to
// eval/reports/. It never saves a plan and never touches a real user.
//
// Each fixture freezes its 20 candidates, so every maker - and every run -
// picks from the same exercises. Limits are worked out from the answers at
// run time, so a change to the rules shows up in the next report.
//
// So far this is the plumbing (piece 0). The graders and the two baselines
// come next (pieces A and B).

import { execSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { getLimits, type Answers, type Limits } from "../src/clinical.js";
import type { Candidate } from "../src/models/exercises.js";
import { MODEL } from "../src/models/gemini.js";
import { generate, type Quality } from "../src/models/regimes.js";
import type { RegimeItem } from "../src/types/index.js";

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

/** What one maker made of one fixture. A failure is kept, never dropped. */
type Result = {
  fixture: string;
  maker: string;
  ms: number;
} & ({ ok: true; plan: Plan } | { ok: false; error: string });

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

async function run(maker: Maker, fixture: Fixture): Promise<Result> {
  const limits = getLimits(fixture.answers);
  const started = Date.now();
  const timed = { fixture: fixture.id, maker: maker.id };

  // The same refusal `create` makes before it calls the model.
  if (fixture.candidates.length < limits.count.min) {
    return {
      ...timed,
      ms: 0,
      ok: false,
      error: `${fixture.candidates.length} candidates, fewer than the ${limits.count.min} a plan needs`,
    };
  }

  try {
    const plan = await maker.make(fixture, limits);
    return { ...timed, ms: Date.now() - started, ok: true, plan };
  } catch (error) {
    return { ...timed, ms: Date.now() - started, ok: false, error: String(error) };
  }
}

async function main() {
  const fixtures = await loadFixtures();

  if (fixtures.length === 0) {
    console.log(`No fixtures in ${FIXTURES} yet, so nothing to run.`);
    return;
  }

  const results: Result[] = [];

  // One at a time: the Gemini makers share one API key's rate limit, and the
  // time each plan takes is part of what is measured.
  for (const fixture of fixtures) {
    for (const maker of MAKERS) {
      const result = await run(maker, fixture);
      results.push(result);
      console.log(
        `${fixture.id} · ${maker.id} · ${result.ok ? `${result.plan.items.length} exercises` : `failed: ${result.error}`} · ${result.ms} ms`
      );
    }
  }

  const ranAt = new Date().toISOString();
  const report = {
    ranAt,
    // "-dirty" when the code that ran was not all committed.
    commit: execSync("git describe --always --dirty").toString().trim(),
    model: MODEL,
    fixtures: fixtures.length,
    makers: MAKERS.map((maker) => maker.id),
    results,
  };

  await mkdir(REPORTS, { recursive: true });
  const file = join(REPORTS, `${ranAt.replace(/[:.]/g, "-")}.json`);
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${file}`);
}

await main();
