// Router + controller: matches routes, validates input, maps results to status codes.

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { buildRegime } from "../models/regime.js";

const webOrigin = process.env.WEB_ORIGIN || "http://localhost:3000";

// Nothing legitimate posts more than this; stop before buffering junk.
const maxBodyBytes = 1_000_000;

type Result = [number, unknown];

// Something the caller got wrong. Carries its own status so it is answered as
// such instead of being swallowed by the catch-all as a 500.
class ClientError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Collects the body as bytes and decodes it once, at the end. Decoding each
// chunk separately would mangle any multi-byte character split across two of
// them: the bytes are only valid UTF-8 once joined.
async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  let tooLarge = false;

  for await (const chunk of req) {
    size += (chunk as Buffer).length;

    if (size > maxBodyBytes) {
      // Over the cap: let go of what we have and keep reading without keeping
      // it, so memory stays bounded. Cutting the read short instead would reset
      // the connection under a client that is still uploading, and it would
      // never get to read the 413.
      tooLarge = true;
      chunks.length = 0;
      continue;
    }

    chunks.push(chunk as Buffer);
  }

  if (tooLarge) {
    throw new ClientError(413, "request body too large");
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8");

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ClientError(400, "invalid JSON body");
  }

  // `null` and the bare scalars parse fine but have no properties to read.
  if (parsed === null || typeof parsed !== "object") {
    throw new ClientError(400, "invalid JSON body");
  }

  return parsed as Record<string, unknown>;
}

// Decides what to answer. Never touches the response object.
async function route(req: IncomingMessage, body: Record<string, unknown>): Promise<Result> {
  const url = req.url || "/";
  const path = url.split("?")[0];

  if (req.method === "GET" && path === "/health") {
    return [200, { ok: true }];
  }

  if (req.method === "POST" && path === "/regime") {
    let muscle = "";

    if (typeof body.muscle === "string") {
      muscle = body.muscle.trim().toLowerCase();
    }

    if (muscle === "") {
      return [400, { error: "muscle is required" }];
    }

    const regime = await buildRegime(muscle);

    if (regime.length === 0) {
      return [404, { error: `no exercises found for "${muscle}"` }];
    }

    return [200, { muscle, regime }];
  }

  return [404, { error: "not found" }];
}

// Does all the HTTP: CORS, body, one write, one catch-all.
export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", webOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  let result: Result;

  try {
    const body = await readBody(req);
    result = await route(req, body);
  } catch (error) {
    if (error instanceof ClientError) {
      result = [error.status, { error: error.message }];
    } else {
      // Never leak internal exception text to the client.
      console.error(error);
      result = [500, { error: "internal server error" }];
    }
  }

  res.writeHead(result[0], { "Content-Type": "application/json" });
  res.end(JSON.stringify(result[1]));
}

export function createApiServer(): Server {
  return createServer(handleRequest);
}
