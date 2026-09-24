import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { buildRegime } from "../models/regime.js";
import { saveRegime, findLatestRegime } from "../models/regimes.js";

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

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

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

// The public-facing API surface: every route this server exposes, in one place.
const routes: { method: string; path: string; handler: Handler }[] = [
  { method: "GET", path: "/health", handler: getHealth },
  { method: "POST", path: "/regime", handler: postRegime },
  { method: "GET", path: "/regime/latest", handler: getLatestRegime },
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
    const route = routes.find((r) => r.method === req.method && r.path === path);

    if (route === undefined) {
      send(res, 404, { error: "not found" });
      return;
    }

    await route.handler(req, res);
  } catch (error) {
    // The real error goes to your terminal; the browser only ever sees this fixed sentence.
    console.error(error);
    send(res, 500, { error: "internal server error" });
  }
}

export function createApiServer(): Server {
  return createServer(handleRequest);
}
