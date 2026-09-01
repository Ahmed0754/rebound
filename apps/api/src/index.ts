import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { buildRegime } from "./regime.js";

const port = Number(process.env.API_PORT ?? 4000);
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    "Access-Control-Allow-Origin": webOrigin,
  });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    // Nothing legitimate posts more than this; stop before buffering junk.
    if (size > 1_000_000) throw new Error("request body too large");
    chunks.push(chunk as Buffer);
  }

  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  // Preflight for the browser's POST with Content-Type: application/json.
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": webOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return;
  }

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/regime") {
      const body = (await readJson(req)) as { muscle?: unknown };
      const muscle = typeof body.muscle === "string" ? body.muscle.trim().toLowerCase() : "";

      if (!muscle) {
        send(res, 400, { error: "muscle is required" });
        return;
      }

      const regime = await buildRegime(muscle);

      if (regime.length === 0) {
        send(res, 404, { error: `no exercises found for "${muscle}"` });
        return;
      }

      send(res, 200, { muscle, regime });
      return;
    }

    send(res, 404, { error: "not found" });
  } catch (error) {
    // Never leak internal exception text to the client.
    console.error(error);
    send(res, 500, { error: "internal server error" });
  }
});

server.listen(port, () => {
  console.log(`api listening on http://localhost:${port}`);
});
