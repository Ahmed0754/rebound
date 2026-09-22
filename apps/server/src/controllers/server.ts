// This is the controller: it handles the raw HTTP request/response and routing.
// It doesn't talk to the database or the AI itself - it just calls buildRegime()
// in the models folder and sends back whatever that returns.
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { buildRegime } from "../models/regime.js";

// The webpage runs on port 3000, this API runs on port 4000. Browsers block
// requests between different ports unless the server says this origin is allowed.
const webOrigin = process.env.WEB_ORIGIN || "http://localhost:3000";

// Sends a JSON response. Every route below calls this instead of writing
// the response directly, so replies are always formatted the same way.
function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// Reads the request body and parses it as JSON.
// Node doesn't do this automatically, so we do it by hand here.
async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];

  // The body comes in as a stream of small pieces, so collect them all first.
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }

  // No body was sent - return an empty object instead of trying (and failing)
  // to parse an empty string as JSON.
  if (chunks.length === 0) {
    return {};
  }

  // Combine all the pieces into one, then turn that into a JS object.
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

// This function runs for every single request that comes in.
// It figures out which route was requested and what to do about it.
export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {

  // Let the webpage (a different port) make requests to this server.
  res.setHeader("Access-Control-Allow-Origin", webOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Before sending a real POST request, browsers first send an OPTIONS
  // request to check if they're allowed. We just say "yes" and stop here.
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Ignore anything after "?" in the URL, so "/health?x=1" still counts as "/health".
  const path = (req.url || "/").split("?")[0];

  try {
    // Route: GET /health - just used to check the server is running.
    if (req.method === "GET" && path === "/health") {
      send(res, 200, { ok: true });
      return;
    }

    // Route: POST /regime - the main feature. Takes a body part, returns exercises.
    if (req.method === "POST" && path === "/regime") {
      const body = await readJson(req);

      // Make sure "muscle" was actually sent as text. If not, treat it as empty.
      const muscle = typeof body.muscle === "string" ? body.muscle.trim().toLowerCase() : "";

      if (muscle === "") {
        send(res, 400, { error: "muscle is required" });
        return;
      }

      // Do the actual work: look up exercises and ask the AI to build a plan.
      const regime = await buildRegime(muscle);

      // The input was valid, there just weren't any exercises for that body part.
      if (regime.length === 0) {
        send(res, 404, { error: `no exercises found for "${muscle}"` });
        return;
      }

      send(res, 200, { muscle, regime });
      return;
    }

    // No route matched what was requested.
    send(res, 404, { error: "not found" });
  } catch (error) {
    // Something broke unexpectedly (bad JSON, database issue, AI call failed, etc).
    // Log the real error for us to see, but only send back a generic message.
    console.error(error);
    send(res, 500, { error: "internal server error" });
  }
}

// Builds the actual server using handleRequest as its logic.
// index.ts calls .listen() on this to start it running.
export function createApiServer(): Server {
  return createServer(handleRequest);
}
