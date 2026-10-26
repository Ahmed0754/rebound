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

import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getLimits } from "../src/clinical.js";
import { pool } from "../src/models/db.js";
import { getCandidatesFor } from "../src/models/regimes.js";
import { PROFILES } from "./profiles.js";

const FIXTURES = join(import.meta.dirname, "fixtures");
const force = process.argv.includes("--force");

async function exists(file: string) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

await mkdir(FIXTURES, { recursive: true });

try {
  for (const { id, ...profile } of PROFILES) {
    const file = join(FIXTURES, `${id}.json`);

    if (!force && (await exists(file))) {
      console.log(`${id} · already frozen`);
      continue;
    }

    const candidates = await getCandidatesFor(profile.answers, getLimits(profile.answers));

    if (candidates === null) {
      throw new Error(`${id}: "${profile.answers.region}" is not a region the catalogue knows`);
    }

    const fixture = { ...profile, frozenAt: new Date().toISOString(), candidates };
    await writeFile(file, `${JSON.stringify(fixture, null, 2)}\n`);
    console.log(`${id} · ${candidates.length} candidates`);
  }
} finally {
  await pool.end();
}
