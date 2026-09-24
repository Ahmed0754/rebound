//This is the HTTP plumbing: reading a request and writing a reply, plus the
//route matcher. None of it knows what a regime is, or that this app has a
//database - it would work unchanged in any other project.
//
//This is the part a framework like Express would normally provide. Writing it
//by hand is the cost of the "no framework, just plain Node" choice, and keeping
//it in its own file is what stops that cost from spreading into the app code.

import type { IncomingMessage, ServerResponse } from "node:http";

// The one place a response is written, so every reply is JSON and only the status changes.
export function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
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
export type Params = Record<string, string>;
export type Handler = (req: IncomingMessage, res: ServerResponse, params: Params) => Promise<void>;

/**
 * Compares a route pattern against a request path, one segment at a time.
 * Returns the captured params, or null when the route does not match.
 *
 * "/regime/:id" matches "/regime/abc" and captures { id: "abc" }; it does not
 * match "/regime" or "/regime/abc/extra", because a differing segment count
 * cannot be a match.
 */
export function matchPath(pattern: string, path: string): Params | null {
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
