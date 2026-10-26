// The two baselines, on the committed fixtures: no database and no Gemini.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { getLimits, type Answers } from "../src/clinical.js";
import type { Candidate } from "../src/models/exercises.js";
import { heuristicPlan, randomPlan } from "./baselines.js";
import { grade } from "./graders.js";

const FIXTURES = join(import.meta.dirname, "fixtures");

const fixtures: { id: string; answers: Answers; candidates: Candidate[] }[] = readdirSync(FIXTURES)
  .filter((file) => file.endsWith(".json"))
  .map((file) => ({ ...JSON.parse(readFileSync(join(FIXTURES, file), "utf8")), id: file.replace(/\.json$/, "") }));

describe.each([
  ["random", randomPlan],
  ["heuristic", heuristicPlan],
])("the %s baseline", (_name, make) => {
  it.each(fixtures.map((fixture) => [fixture.id, fixture] as const))(
    "passes the hard checks on %s",
    async (_id, fixture) => {
      const limits = getLimits(fixture.answers);
      const { items } = await make(fixture, limits);
      const graded = grade(items, fixture.candidates, { region: fixture.answers.region, answers: fixture.answers, limits });

      expect(graded.hard).toEqual([]);
    }
  );

  it("makes the same plan for the same fixture every time", async () => {
    const fixture = fixtures[0];
    const limits = getLimits(fixture.answers);
    const ids = async () => (await make(fixture, limits)).items.map((item) => item.id);

    expect(await ids()).toEqual(await ids());
  });
});

describe("the heuristic baseline", () => {
  it("takes turns between the categories the limits allow", async () => {
    const fixture = fixtures.find((f) => f.id === "knee-plain")!;
    const limits = getLimits(fixture.answers);
    const { items } = await heuristicPlan(fixture, limits);
    const category = new Map(fixture.candidates.map((c) => [c.id, c.category]));

    expect(items.slice(0, 2).map((item) => category.get(item.id))).toEqual(["stretching", "strength"]);
  });
});
