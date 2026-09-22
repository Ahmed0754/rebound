import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { buildRegime } from "../models/regime.js";

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
    if (req.method === "GET" && path === "/health") {
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && path === "/regime") {
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

      send(res, 200, { muscle, regime });
      return;
    }

    // Reached only when no route above matched, because each match ends in a return.
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
