// The controller for regimes: one handler per route. Each reads the request,
// calls the model, and picks a status code. Mounted at /api/regimes in app.ts.

import { Router } from "express";
import { decide, getLimits } from "../clinical.js";
import { get as getOnboarding } from "../models/onboarding.js";
import {
  create,
  GenerationFailed,
  get,
  list,
  remove,
  TooFewCandidates,
  update,
  UnknownExercise,
  WrongUnit,
} from "../models/regimes.js";
import { requireUser, userIdOf } from "../require-user.js";
import type { RegimeEdit } from "../types/index.js";

const router = Router();

// Every route here acts for the logged-in account, and only ever on that
// account's own regimes: another account's regime is a 404, the same as one
// that does not exist, so ids cannot be probed.
router.use(requireUser);

// A regime edited by hand still has to be a regime: at least one exercise,
// and not an unbounded list. Three is what the app generates and shows.
const MIN_ITEMS = 1;
const MAX_ITEMS = 10;

// `sets`, `reps` and `hold_seconds` are `integer` columns. A float or a
// numeric string reaches Postgres as a type error, which would surface as a
// 500 for what is plainly a bad request, so nothing but a whole number in
// range gets through.
const DOSE_LIMITS = {
  sets: { min: 1, max: 20 },
  reps: { min: 1, max: 100 },
  holdSeconds: { min: 1, max: 600 },
} as const;

function badDose(value: unknown, field: keyof typeof DOSE_LIMITS): string | null {
  const limit = DOSE_LIMITS[field];

  if (!Number.isInteger(value) || (value as number) < limit.min || (value as number) > limit.max) {
    return `${field} must be a whole number between ${limit.min} and ${limit.max}`;
  }

  return null;
}

// The catalogue's ids are slugs like "3_4_Sit-Up". `exercise_id` is unbounded
// `text`, so the cap is here rather than in the schema.
const MAX_ID_LENGTH = 200;

/**
 * Reads an edited exercise list out of a request body, or says what is wrong
 * with it. One message, aimed at whoever wrote the request.
 *
 * Only the id and the dose are read. Name and description are the record of
 * what the app told the user, so the model resolves them and they are never
 * accepted from a request.
 *
 * The dose is `sets` plus exactly one of `reps` or `holdSeconds`. Which one
 * the exercise takes is the server's to check (`WrongUnit`), since only it
 * knows the unit; here it only has to be one of them.
 */
function parseItems(body: unknown): { items: RegimeEdit[] } | { error: string } {
  const regime = (body as { regime?: unknown } | null | undefined)?.regime;

  if (!Array.isArray(regime)) {
    return { error: "regime must be an array of exercises" };
  }

  if (regime.length < MIN_ITEMS || regime.length > MAX_ITEMS) {
    return {
      error: `regime must have between ${MIN_ITEMS} and ${MAX_ITEMS} exercises`,
    };
  }

  const items: RegimeEdit[] = [];
  const seen = new Set<string>();

  for (const entry of regime) {
    const id = typeof entry?.id === "string" ? entry.id.trim() : "";

    if (id === "" || id.length > MAX_ID_LENGTH) {
      return { error: "every exercise needs an id" };
    }

    // Two rows for one exercise would have to collapse into one, which is an
    // intent nobody expressed, so it is rejected rather than quietly merged.
    if (seen.has(id)) {
      return { error: `"${id}" appears more than once` };
    }

    seen.add(id);

    const setsError = badDose(entry?.sets, "sets");

    if (setsError !== null) {
      return { error: setsError };
    }

    const hasReps = entry?.reps !== undefined && entry?.reps !== null;
    const hasHold = entry?.holdSeconds !== undefined && entry?.holdSeconds !== null;

    if (hasReps === hasHold) {
      return { error: `"${id}" needs exactly one of reps or holdSeconds` };
    }

    const amountError = hasReps ? badDose(entry.reps, "reps") : badDose(entry.holdSeconds, "holdSeconds");

    if (amountError !== null) {
      return { error: amountError };
    }

    items.push({
      id,
      sets: entry.sets,
      reps: hasReps ? entry.reps : null,
      holdSeconds: hasHold ? entry.holdSeconds : null,
    });
  }

  return { items };
}

/**
 * Builds and saves a regime, and picks the status for how that went. Shared
 * by both ways of asking for one.
 *
 * 409 when too few exercises fit: the request is fine, the stored answers are
 * what rule a plan out. 503 when no valid plan came back from the model: the
 * request is fine and could succeed later, which is what "try again" means.
 */
async function build(input: Parameters<typeof create>[0], region: string) {
  try {
    const regime = await create(input);

    if (regime === null) {
      return { status: 404, body: { error: `no exercises found for "${region}"` } };
    }

    return { status: 201, body: regime };
  } catch (error) {
    if (error instanceof TooFewCandidates) {
      return { status: 409, body: { error: error.message } };
    }

    if (error instanceof GenerationFailed) {
      return { status: 503, body: { error: error.message } };
    }

    throw error;
  }
}

/**
 * Builds a regime from a saved questionnaire.
 *
 * The decision runs again here even though it ran when the answers were
 * saved: without it, a "see a doctor" or crisis response could just be
 * ignored and the id posted straight to this route.
 */
async function fromOnboarding(onboardingId: string, userId: string) {
  const onboarding = await getOnboarding(onboardingId, userId);

  if (onboarding === null) {
    return { status: 404, body: { error: "no onboarding with that id" } };
  }

  // Not a 400 - the request is well formed and the id is real. The stored
  // answers are what forbid a plan.
  const outcome = decide(onboarding.answers, onboarding.note.screening);

  // Worded per outcome: crisis is never described as a referral.
  if (outcome === "crisis") {
    return { status: 409, body: { error: "these answers lead to crisis support, not a plan" } };
  }

  if (outcome === "see_a_doctor") {
    return { status: 409, body: { error: "these answers need a doctor, not a plan" } };
  }

  return build(
    {
      muscle: onboarding.answers.region,
      userId,
      onboarding: {
        answers: onboarding.answers,
        limits: getLimits(onboarding.answers),
        freeText: onboarding.note.freeText,
      },
    },
    onboarding.answers.region
  );
}

router.post("/", async (req, res) => {
  const userId = userIdOf(res);

  const onboardingId =
    typeof req.body?.onboardingId === "string" ? req.body.onboardingId.trim() : "";

  if (onboardingId !== "") {
    const { status, body } = await fromOnboarding(onboardingId, userId);

    res.status(status).send(body);
    return;
  }

  // The original path: a body part typed into a box, no questionnaire, so no
  // limits and Gemini's dose is taken as given.
  //
  // Anything that is not a string becomes "", so there is only one way to be invalid.
  const muscle = typeof req.body?.muscle === "string" ? req.body.muscle.trim().toLowerCase() : "";

  if (muscle === "") {
    res.status(400).send({ error: "muscle or onboardingId is required" });
    return;
  }

  // A 404 from here is not an error: the request was fine, there is just
  // nothing stored for that region.
  const { status, body } = await build({ muscle, userId }, muscle);

  res.status(status).send(body);
});

// The caller's own regimes, newest first. Declared before "/:id" so the bare
// path is not read as an id.
router.get("/", async (_req, res) => {
  // An account with no regimes is an empty list, not a 404: the question
  // "what has this account made" has an answer, and it is "nothing yet".
  res.send(await list(userIdOf(res)));
});

router.get("/:id", async (req, res) => {
  const regime = await get(req.params.id, userIdOf(res));

  // An unused id and a malformed one get the same answer, so a stranger
  // learns nothing about how ids are shaped.
  if (regime === null) {
    res.status(404).send({ error: "no regime with that id" });
    return;
  }

  res.send(regime);
});

router.put("/:id", async (req, res) => {
  // The path says which regime this is. A body naming a different one is a
  // mistake worth reporting rather than quietly resolving one way or the other.
  if (typeof req.body?.id === "string" && req.body.id !== req.params.id) {
    res.status(400).send({ error: "id in the body does not match the id in the path" });
    return;
  }

  const parsed = parseItems(req.body);

  if ("error" in parsed) {
    res.status(400).send({ error: parsed.error });
    return;
  }

  try {
    const regime = await update(req.params.id, userIdOf(res), parsed.items);

    // Replace-only, not create-or-replace. An unknown id is a miss: there is
    // nothing in the request to build a regime out of, since `muscle` and the
    // body region come from generating one, not from editing one.
    if (regime === null) {
      res.status(404).send({ error: "no regime with that id" });
      return;
    }

    res.send(regime);
  } catch (error) {
    // The regime is there; the request named an exercise that is neither in it
    // nor in the catalogue. That is a bad body, so it must not read as a 404.
    if (error instanceof UnknownExercise || error instanceof WrongUnit) {
      res.status(400).send({ error: error.message });
      return;
    }

    throw error;
  }
});

router.delete("/:id", async (req, res) => {
  const deleted = await remove(req.params.id, userIdOf(res));

  // 404 rather than an unconditional 204, so this matches GET on the same path
  // and a UI can tell whether it deleted anything. The cost is that a retried
  // DELETE 404s; a client that cares should read that as already gone.
  if (!deleted) {
    res.status(404).send({ error: "no regime with that id" });
    return;
  }

  res.sendStatus(204);
});

export default router;


//structure:
// depend son http request
// diff api endpoints for different HTTP methods (GET, POST, PUT, DELETE)
//sub apis
