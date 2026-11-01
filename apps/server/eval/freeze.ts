// Draws each profile's candidates from the catalogue, once, and writes them
// to eval/fixtures/<id>.json. `pnpm eval:freeze`.
//
// Frozen means frozen: a fixture that already exists is left alone, so every
// later run grades plans picked from the same 20 exercises. `--force` redraws
// them all, which makes old reports incomparable with new ones - only do it on
// purpose, say after a reseed, and say so in the commit.
//
// The same query `create` runs (`getCandidatesFor`), `order by random()` and
// all, so a fixture is one real draw a user could have had.
//
// Piece E's other pools (pools.ts) go to fixtures/pools/<name>/ instead:
//  - `--pool draw-2` draws another 20, the same way.
//  - `--pool 40 --limit 40`, or `--pool all --limit all`, draws more.
//  - `--pool chosen --choose-from all` chooses 20 from a pool already frozen,
//    covering every criterion it can (`chooseCovering`). No database.

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getLimits } from "../src/clinical.js";
import { pool } from "../src/models/db.js";
import { getCandidates } from "../src/models/exercises.js";
import { getCandidatesFor, toCandidateQuery } from "../src/models/regimes.js";
import { FIXTURES } from "./fixture.js";
import { chooseCovering, POOLS } from "./pools.js";
import { PROFILES } from "./profiles.js";

const force = process.argv.includes("--force");

function option(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}

const poolName = option("--pool");
const limit = option("--limit");
const chooseFrom = option("--choose-from");

if ((limit !== undefined || chooseFrom !== undefined) && poolName === undefined) {
  throw new Error("--limit and --choose-from make a different pool, so they need --pool <name>");
}

if (limit !== undefined && limit !== "all" && !(Number.isInteger(Number(limit)) && Number(limit) > 0)) {
  throw new Error(`--limit is a whole number or "all", not ${limit}`);
}

const dir = poolName === undefined ? FIXTURES : join(POOLS, poolName);

async function exists(file: string) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

await mkdir(dir, { recursive: true });

try {
  for (const { id, ...profile } of PROFILES) {
    const file = join(dir, `${id}.json`);

    if (!force && (await exists(file))) {
      console.log(`${id} · already frozen`);
      continue;
    }

    const limits = getLimits(profile.answers);
    let candidates;

    if (chooseFrom !== undefined) {
      const from = JSON.parse(await readFile(join(POOLS, chooseFrom, `${id}.json`), "utf8"));
      const context = { region: profile.answers.region, answers: profile.answers, limits };
      candidates = chooseCovering(from.candidates, context, 20, id);
    } else if (limit !== undefined) {
      // The query `create` runs, with a different cap. Far more than the
      // catalogue holds for any region is all of them.
      candidates = await getCandidates({
        ...toCandidateQuery(profile.answers, limits),
        limit: limit === "all" ? 100_000 : Number(limit),
      });
    } else {
      candidates = await getCandidatesFor(profile.answers, limits);
    }

    if (candidates === null) {
      throw new Error(`${id}: "${profile.answers.region}" is not a region the catalogue knows`);
    }

    const fixture = {
      ...profile,
      frozenAt: new Date().toISOString(),
      ...(poolName === undefined ? {} : { pool: poolName }),
      candidates,
    };
    await writeFile(file, `${JSON.stringify(fixture, null, 2)}\n`);
    console.log(`${id} · ${candidates.length} candidates`);
  }
} finally {
  await pool.end();
}
