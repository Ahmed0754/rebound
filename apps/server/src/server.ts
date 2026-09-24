//This is the server itself: what every request gets regardless of route (CORS,
//the error net), which routes exist, and the dispatch between them. It sits
//above the controllers and below index.ts, and is the only file that knows
//both that HTTP exists and that this app is about regimes.

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { send, matchPath, type Handler } from "./http.js";
import { postRegime, getLatestRegime, getRegimeById } from "./controllers/regime.js";

// The page runs on :3000 and this API on :4000, so the browser must be told :3000 is allowed.
const webOrigin = process.env.WEB_ORIGIN || "http://localhost:3000";

// Not a controller: a liveness probe, answering "is this process up" rather
// than anything about the app. It stays here because it has no model behind it.
async function getHealth(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  send(res, 200, { ok: true });
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
