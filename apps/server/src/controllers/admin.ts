// The controller for the admin page: test tools for an admin's own plans.
// Mounted at /api/admin in app.ts.
//
//   PUT /api/admin/regimes/:id/checkins   makes a plan's check-ins this list
//
// Plans are found for their owner, as everywhere else, so being an admin gives
// no access to anyone else's plan or pain scores. The judge is on its own
// route in controllers/regimes.ts, behind the same check.

import { Router } from "express";
import * as checkins from "../models/checkins.js";
import { get } from "../models/regimes.js";
import { requireAdmin, requireUser, userIdOf } from "../require-user.js";

const router = Router();

router.use(requireUser, requireAdmin);

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// About two months of daily check-ins: more than any test needs.
const MAX_CHECK_INS = 60;

// `new Date` turns 2026-02-30 into March and throws on month 13 once formatted,
// so the date has to survive the round trip to be real.
function isRealDay(day: string): boolean {
  const date = new Date(`${day}T00:00:00Z`);

  return DAY.test(day) && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day;
}

// Tomorrow in UTC, the latest date that is already today somewhere.
function latestDay(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

type Entry = { day: string; pain: number; didExercises: boolean };

/**
 * Reads the list out of a request body, or says what is wrong with it. Days
 * before the plan was made are allowed, unlike a real check-in: filling in the
 * past is the point. Future days are not, because the trend would read them as
 * the most recent.
 */
function parseCheckIns(body: unknown): { checkIns: Entry[] } | { error: string } {
  const list = (body as { checkIns?: unknown } | null | undefined)?.checkIns;

  if (!Array.isArray(list)) {
    return { error: "checkIns must be a list" };
  }

  if (list.length > MAX_CHECK_INS) {
    return { error: `at most ${MAX_CHECK_INS} check-ins` };
  }

  const latest = latestDay();
  const seen = new Set<string>();
  const checkIns: Entry[] = [];

  for (const entry of list) {
    const { day, pain, didExercises } = (entry ?? {}) as Record<string, unknown>;

    if (typeof day !== "string" || !isRealDay(day)) {
      return { error: "every day must be a date like 2026-11-02" };
    }

    if (day > latest) {
      return { error: `${day} is in the future` };
    }

    if (seen.has(day)) {
      return { error: `${day} appears more than once` };
    }

    seen.add(day);

    if (typeof pain !== "number" || !Number.isInteger(pain) || pain < 0 || pain > 10) {
      return { error: `pain on ${day} must be a whole number from 0 to 10` };
    }

    if (typeof didExercises !== "boolean") {
      return { error: `didExercises on ${day} must be true or false` };
    }

    checkIns.push({ day, pain, didExercises });
  }

  return { checkIns };
}

router.put("/regimes/:id/checkins", async (req, res) => {
  const userId = userIdOf(res);
  const regime = await get(req.params.id, userId);

  if (regime === null) {
    res.status(404).send({ error: "no regime with that id" });
    return;
  }

  const parsed = parseCheckIns(req.body);

  if ("error" in parsed) {
    res.status(400).send({ error: parsed.error });
    return;
  }

  res.send(await checkins.replaceAll(regime.id, userId, parsed.checkIns));
});

export default router;
