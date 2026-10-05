// The controller for onboarding: save a questionnaire, read one back. Mounted
// at /api/onboarding in app.ts. Most of this file is validation, in the same
// {value} | {error} shape as `parseItems` in controllers/regimes.ts.

import { Router } from "express";
import {
  ACTIVITY_LEVELS,
  AGE_BANDS,
  AGGRAVATORS,
  CONDITIONS,
  EQUIPMENT,
  GOALS,
  ONSETS,
  RED_FLAGS,
  SESSION_MINUTES,
  getLimits,
  hasRedFlag,
  type Answers,
} from "../clinical.js";
import { listRegions } from "../models/exercises.js";
import { create, get } from "../models/onboarding.js";

const router = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Long enough for "my lower back and left hip", short enough not to be a
// free-text field in disguise.
const MAX_REGION_LENGTH = 100;

const PAIN = { min: 0, max: 10 } as const;

function readUserId(req: { header(name: string): string | undefined }): string | null {
  const id = req.header("X-User-Id");
  return id !== undefined && UUID.test(id) ? id : null;
}

/** One value out of a closed list, or null. */
function one<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    return null;
  }

  return value as T;
}

/** Several values out of a closed list, or null. A repeat is a client bug, so it is rejected. */
function many<T extends string>(value: unknown, allowed: readonly T[]): T[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const picked: T[] = [];

  for (const entry of value) {
    const found = one(entry, allowed);

    if (found === null || picked.includes(found)) {
      return null;
    }

    picked.push(found);
  }

  return picked;
}

/**
 * Reads a questionnaire out of a request body, or says what is wrong with it.
 *
 * Every field is required. Defaulting a missing answer to the safe end would
 * tell someone their plan is small because of a question nobody asked them.
 */
function parseAnswers(body: unknown): { answers: Answers } | { error: string } {
  const input = (body ?? {}) as Record<string, unknown>;

  const goal = one(input.goal, GOALS);

  if (goal === null) {
    return { error: `goal must be one of: ${GOALS.join(", ")}` };
  }

  const region = typeof input.region === "string" ? input.region.trim().toLowerCase() : "";

  if (region === "" || region.length > MAX_REGION_LENGTH) {
    return { error: "region is required" };
  }

  const onset = one(input.onset, ONSETS);

  if (onset === null) {
    return { error: `onset must be one of: ${ONSETS.join(", ")}` };
  }

  // An integer column: a float or a numeric string would reach Postgres as a
  // type error, so a 500 for a plainly bad request.
  const painNow = input.painNow;

  if (
    !Number.isInteger(painNow) ||
    (painNow as number) < PAIN.min ||
    (painNow as number) > PAIN.max
  ) {
    return { error: `painNow must be a whole number between ${PAIN.min} and ${PAIN.max}` };
  }

  const aggravators = many(input.aggravators, AGGRAVATORS);

  if (aggravators === null) {
    return { error: `aggravators must be a list drawn from: ${AGGRAVATORS.join(", ")}` };
  }

  // Checked against the known list here, which is why `hasRedFlag` can just
  // ask whether the array is empty.
  const redFlags = many(input.redFlags, RED_FLAGS);

  if (redFlags === null) {
    return { error: `redFlags must be a list drawn from: ${RED_FLAGS.join(", ")}` };
  }

  const ageBand = one(input.ageBand, AGE_BANDS);

  if (ageBand === null) {
    return { error: `ageBand must be one of: ${AGE_BANDS.join(", ")}` };
  }

  const conditions = many(input.conditions, CONDITIONS);

  if (conditions === null) {
    return { error: `conditions must be a list drawn from: ${CONDITIONS.join(", ")}` };
  }

  const equipment = many(input.equipment, EQUIPMENT);

  if (equipment === null || equipment.length === 0) {
    return { error: `equipment must be a non-empty list drawn from: ${EQUIPMENT.join(", ")}` };
  }

  const activityLevel = one(input.activityLevel, ACTIVITY_LEVELS);

  if (activityLevel === null) {
    return { error: `activityLevel must be one of: ${ACTIVITY_LEVELS.join(", ")}` };
  }

  const sessionMinutes = SESSION_MINUTES.find((minutes) => minutes === input.sessionMinutes);

  if (sessionMinutes === undefined) {
    return { error: `sessionMinutes must be one of: ${SESSION_MINUTES.join(", ")}` };
  }

  return {
    answers: {
      goal,
      region,
      onset,
      painNow: painNow as number,
      aggravators,
      redFlags,
      ageBand,
      conditions,
      equipment,
      activityLevel,
      sessionMinutes,
    },
  };
}

/**
 * What a saved questionnaire looks like to the client.
 *
 * `outcome` carries the red-flag decision rather than the status code, because
 * the request was valid either way and "see a doctor" is a product answer.
 * `limits` is absent on a red flag: there is no plan for them to bound.
 */
function present(id: string, answers: Answers) {
  if (hasRedFlag(answers)) {
    return { id, outcome: "see_a_doctor" as const, redFlags: answers.redFlags };
  }

  return { id, outcome: "ready" as const, limits: getLimits(answers) };
}

router.post("/", async (req, res) => {
  const userId = readUserId(req);

  if (userId === null) {
    res.status(400).send({ error: "X-User-Id must be a user id" });
    return;
  }

  const parsed = parseAnswers(req.body);

  if ("error" in parsed) {
    res.status(400).send({ error: parsed.error });
    return;
  }

  // Checked against the real list, not just for length: region decides which
  // exercises are considered at all, so "spleen" should fail here rather than
  // at generation. Exact match - the questionnaire sends a choice, where the
  // older free-text route still relies on `matchRegion` to interpret prose.
  const regions = await listRegions();

  if (!regions.includes(parsed.answers.region)) {
    res.status(400).send({ error: `region must be one of: ${regions.join(", ")}` });
    return;
  }

  // Saved even for a red flag: the row is the record that someone was turned
  // away, and nothing is generated from it either way.
  const saved = await create(userId, parsed.answers);

  res.status(201).send(present(saved.id, saved.answers));
});

router.get("/:id", async (req, res) => {
  const userId = readUserId(req);

  if (userId === null) {
    res.status(400).send({ error: "X-User-Id must be a user id" });
    return;
  }

  const found = await get(req.params.id, userId);

  if (found === null) {
    res.status(404).send({ error: "no onboarding with that id" });
    return;
  }

  res.send({ ...present(found.id, found.answers), answers: found.answers });
});

export default router;
