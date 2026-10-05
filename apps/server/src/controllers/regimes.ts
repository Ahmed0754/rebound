// The controller for regimes: one handler per route. Each reads the request,
// calls the model, and picks a status code. Mounted at /api/regimes in app.ts.

import { Router } from "express";
import { create, get, remove, update, UnknownExercise } from "../models/regimes.js";
import type { RegimeEdit } from "../types/index.js";

const router = Router();

// Same shape as the one in models/regimes.ts and models/users.ts. Checked
// here, not left to the database, because an invalid uuid reaching a foreign
// key would surface as a 500 for what is only a bad header.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Required on create, since `regimes.user_id` is `not null` - there is no such
// thing as a regime belonging to nobody, so a request that names nobody cannot
// make one. A missing and a malformed header are the same answer: a caller who
// sent a broken id has not identified an account either, and quietly treating
// it as "no account" is how a frontend bug turns into plans saved under
// nothing.
//
// Still not authentication. Nothing checks that the caller is entitled to act
// as this account, and `get`, `update` and `remove` do not read it at all -
// see the capitalised TODO in models/regimes.ts.
function readUserId(req: { header(name: string): string | undefined }): string | null {
  const id = req.header("X-User-Id");
  return id !== undefined && UUID.test(id) ? id : null;
}

// A regime edited by hand still has to be a regime: at least one exercise,
// and not an unbounded list. Three is what the app generates and shows.
const MIN_ITEMS = 1;
const MAX_ITEMS = 10;

// `sets` and `reps` are `integer` columns. A float or a numeric string reaches
// Postgres as a type error, which would surface as a 500 for what is plainly a
// bad request, so nothing but a whole number in range gets through.
const DOSE_LIMITS = {
  sets: { min: 1, max: 20 },
  reps: { min: 1, max: 100 },
} as const;

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

    for (const [field, limit] of Object.entries(DOSE_LIMITS)) {
      const value: unknown = entry?.[field];

      if (!Number.isInteger(value) || (value as number) < limit.min || (value as number) > limit.max) {
        return {
          error: `${field} must be a whole number between ${limit.min} and ${limit.max}`,
        };
      }
    }

    items.push({ id, sets: entry.sets, reps: entry.reps });
  }

  return { items };
}

router.post("/", async (req, res) => {
  // Anything that is not a string becomes "", so there is only one way to be invalid.
  const muscle = typeof req.body?.muscle === "string" ? req.body.muscle.trim().toLowerCase() : "";

  if (muscle === "") {
    res.status(400).send({ error: "muscle is required" });
    return;
  }

  const userId = readUserId(req);

  // A plan is saved to an account, so one has to be named. 400 rather than
  // 401: there is no authentication to have failed, the request is simply
  // missing something it needs.
  if (userId === null) {
    res.status(400).send({ error: "X-User-Id must be a user id" });
    return;
  }

  const regime = await create(muscle, userId);

  // Not an error: the request was fine, there is just nothing stored for that region.
  if (regime === null) {
    res.status(404).send({ error: `no exercises found for "${muscle}"` });
    return;
  }

  res.status(201).send(regime);
});

router.get("/:id", async (req, res) => {
  const regime = await get(req.params.id);

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
    const regime = await update(req.params.id, parsed.items);

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
    if (error instanceof UnknownExercise) {
      res.status(400).send({ error: error.message });
      return;
    }

    throw error;
  }
});

router.delete("/:id", async (req, res) => {
  const deleted = await remove(req.params.id);

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
