// Candidate pools other than the 20 `create` draws (piece E). The app offers
// Gemini 20 candidates in random order, so a criterion can be unsatisfiable
// only because the draw missed every exercise that meets it - shoulder-gym's
// 20 had no stretch at all. These pools ask what that costs.
//
// `pnpm eval:freeze --pool <name> --limit 40|all` draws a pool from the
// catalogue; `--choose-from <pool>` builds one from a pool already frozen,
// with the pure `chooseCovering` below. Pools live in fixtures/pools/<name>/,
// apart from the default fixtures, which stay what `create` would draw.

import { join } from "node:path";
import type { QualityContext, Tagged } from "../src/quality.js";
import { CRITERIA } from "../src/quality.js";
import { seeded } from "./baselines.js";
import { FIXTURES } from "./fixture.js";
import { PROVISIONAL } from "./graders.js";

export const POOLS = join(FIXTURES, "pools");

/**
 * `size` candidates that give every applicable criterion, live or provisional,
 * at least one candidate meeting it wherever the whole pool has one; the rest
 * at random. Seeded by `seed`, so the same pool chooses the same way.
 *
 * This aims the candidates at the grader, on purpose: it asks how a maker
 * does once no criterion is lost to the draw. It says nothing about the
 * plans `create` makes today.
 */
export function chooseCovering<T extends Tagged>(candidates: T[], context: QualityContext, size: number, seed: string): T[] {
  const random = seeded(seed);
  const pick = <U>(from: U[]) => from[Math.floor(random() * from.length)];
  const chosen: T[] = [];
  const criteria = [...CRITERIA, ...PROVISIONAL.flatMap((c) => (c.meets === undefined ? [] : [{ ...c, meets: c.meets }]))];

  for (const criterion of criteria) {
    if (!criterion.appliesTo(context) || criterion.meets(chosen) || !criterion.meets(candidates)) {
      continue;
    }

    const left = candidates.filter((c) => !chosen.includes(c));
    const one = left.filter((c) => criterion.meets([...chosen, c]));

    if (one.length > 0 && chosen.length < size) {
      chosen.push(pick(one));
      continue;
    }

    // ALL-1 asks for a stretch and a strength exercise, so one more can be
    // too few.
    const two = left.flatMap((a, i) =>
      left.slice(i + 1).filter((b) => criterion.meets([...chosen, a, b])).map((b) => [a, b])
    );

    if (two.length > 0 && chosen.length + 2 <= size) {
      chosen.push(...pick(two));
    }
  }

  const rest = candidates.filter((c) => !chosen.includes(c));

  while (chosen.length < size && rest.length > 0) {
    chosen.push(rest.splice(Math.floor(random() * rest.length), 1)[0]);
  }

  return chosen;
}
