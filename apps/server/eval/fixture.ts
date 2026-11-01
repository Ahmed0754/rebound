// The frozen fixtures `pnpm eval:freeze` writes, read back. Shared by the eval
// run and the judge, which reads them again to see what each plan was picked
// from.

import { mkdir, readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Answers } from "../src/clinical.js";
import type { Candidate } from "../src/models/exercises.js";

export const FIXTURES = join(import.meta.dirname, "fixtures");

/** A made-up person and the exercises they were offered, frozen. */
export type Fixture = {
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

export async function loadFixtures(): Promise<Fixture[]> {
  await mkdir(FIXTURES, { recursive: true });
  const files = (await readdir(FIXTURES)).filter((file) => file.endsWith(".json")).sort();

  return Promise.all(
    files.map(async (file) => ({
      ...JSON.parse(await readFile(join(FIXTURES, file), "utf8")),
      id: basename(file, ".json"),
    }))
  );
}
