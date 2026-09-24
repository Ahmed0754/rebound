//These are the CONTROLLERS for the regime endpoints: one function per route.
//Each reads what it needs off the request, calls a model, and picks a status
//code. None of them know how routing works or how a response is serialised.

import type { IncomingMessage, ServerResponse } from "node:http";
import { send, readJson, type Params } from "../http.js";
import { buildRegime } from "../models/generate-regime.js";
import { saveRegime, findLatestRegime, findRegimeById } from "../models/regimes.js";

export async function postRegime(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req);

  // Anything that is not a string becomes "", so there is only one way to be invalid.
  const muscle = typeof body.muscle === "string" ? body.muscle.trim().toLowerCase() : "";

  if (muscle === "") {
    send(res, 400, { error: "muscle is required" });
    return;
  }

  // The one line where HTTP hands off to the model layer.
  const regime = await buildRegime(muscle);

  // Not an error - the request was fine, there is just nothing stored for that region.
  if (regime.length === 0) {
    send(res, 404, { error: `no exercises found for "${muscle}"` });
    return;
  }

  // Saved before it is sent, so the id in the response is one that can actually
  // be fetched back. Saving afterwards would sometimes hand out an id for a
  // regime that failed to store.
  const id = await saveRegime(muscle, regime);

  send(res, 200, { id, muscle, regime });
}

export async function getLatestRegime(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const latest = await findLatestRegime();

  // Nothing saved yet is not an error - there is simply nothing to show.
  if (latest === null) {
    send(res, 404, { error: "no regime saved yet" });
    return;
  }

  send(res, 200, latest);
}

export async function getRegimeById(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Params
): Promise<void> {
  const found = await findRegimeById(params.id);

  // An id that is unused and an id that is malformed are the same answer: there
  // is no such regime. Saying which would tell a stranger how ids are shaped.
  if (found === null) {
    send(res, 404, { error: "no regime with that id" });
    return;
  }

  send(res, 200, found);
}
