import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { buildRegime } from "../models/regime.js";
import { saveRegime, findLatestRegime, findRegimeById } from "../models/regimes.js";

// The page runs on :3000 and this API on :4000, so the browser must be told :3000 is allowed.
const webOrigin = process.env.WEB_ORIGIN || "http://localhost:3000";

// The one place a response is written, so every reply is JSON and only the status changes.
function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];

  // The body arrives in pieces, so collect the raw bytes first.
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  // Join the bytes before reading them as text: one character can be split across two pieces.
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

// Params are whatever the route's `:name` segments captured - `{}` for a route
// that has none, so a handler never has to check whether it was given any.
type Params = Record<string, string>;
type Handler = (req: IncomingMessage, res: ServerResponse, params: Params) => Promise<void>;

/**
 * Compares a route pattern against a request path, one segment at a time.
 * Returns the captured params, or null when the route does not match.
 *
 * "/regime/:id" matches "/regime/abc" and captures { id: "abc" }; it does not
 * match "/regime" or "/regime/abc/extra", because a differing segment count
 * cannot be a match.
 */
function matchPath(pattern: string, path: string): Params | null {
  const wanted = pattern.split("/");
  const actual = path.split("/");

  if (wanted.length !== actual.length) {
    return null;
  }

  const params: Params = {};

  for (let i = 0; i < wanted.length; i++) {
    if (wanted[i].startsWith(":")) {
      // "/regime/" would otherwise capture an empty id and look like a match.
      if (actual[i] === "") {
        return null;
      }

      // Ids arrive percent-encoded if they contain anything unusual.
      params[wanted[i].slice(1)] = decodeURIComponent(actual[i]);
      continue;
    }

    if (wanted[i] !== actual[i]) {
      return null;
    }
  }

  return params;
}

async function getHealth(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  send(res, 200, { ok: true });
}

async function postRegime(req: IncomingMessage, res: ServerResponse): Promise<void> {
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

async function getLatestRegime(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const latest = await findLatestRegime();

  // Nothing saved yet is not an error - there is simply nothing to show.
  if (latest === null) {
    send(res, 404, { error: "no regime saved yet" });
    return;
  }

  send(res, 200, latest);
}

async function getRegimeById(
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

// The public-facing API surface: every route this server exposes, in one place.
//
// ORDER MATTERS from here on. The first match wins, and "/regime/:id" would
// happily match "/regime/latest" with id = "latest", so the literal route has
// to come first. Any new literal route under an existing `:param` route goes
// above it for the same reason.
const routes: { method: string; path: string; handler: Handler }[] = [
  { method: "GET", path: "/health", handler: getHealth },
  { method: "POST", path: "/regime", handler: postRegime },
  { method: "GET", path: "/regime/latest", handler: getLatestRegime },
  { method: "GET", path: "/regime/:id", handler: getRegimeById },
];

export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {

  // Set before any routing, so every reply below carries them - errors included.
  res.setHeader("Access-Control-Allow-Origin", webOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // The browser asks permission with its own OPTIONS request before a cross-origin POST.
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Drop the query string, so "/health?x=1" still matches "/health".
  const path = (req.url || "/").split("?")[0];

  try {
    // Walked in order rather than searched, because the params a route captures
    // are only known once it has matched, and the first match is the winner.
    for (const route of routes) {
      if (route.method !== req.method) {
        continue;
      }

      const params = matchPath(route.path, path);

      if (params === null) {
        continue;
      }

      await route.handler(req, res, params);
      return;
    }

    // Reached only when no route matched.
    send(res, 404, { error: "not found" });
  } catch (error) {
    // The real error goes to your terminal; the browser only ever sees this fixed sentence.
    console.error(error);
    send(res, 500, { error: "internal server error" });
  }
}

export function createApiServer(): Server {
  return createServer(handleRequest);
}
