import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";

const knee = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Straight Leg Raise",
    bodyRegion: "knee",
    description: "Lift the leg straight up to hip height.",
    sets: 3,
    reps: 10,
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Wall Sit",
    bodyRegion: "knee",
    description: "Slide down a wall and hold.",
    sets: 3,
    reps: 30,
  },
];

// No database and no Gemini key needed: the endpoint's routing, validation and
// error mapping are what these tests are about.
vi.mock("./regime.js", () => ({
  buildRegime: vi.fn(async (muscle: string) => (muscle === "knee" ? knee : [])),
}));

const { createApiServer } = await import("./server.js");

let base: string;
const server = createApiServer();

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
});

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

type RegimeBody = { muscle: string; regime: { name: string; sets: number; reps: number }[] };

function postRegime(body: unknown) {
  return fetch(`${base}/regime`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});

describe("POST /regime", () => {
  it("returns 400 when muscle is missing", async () => {
    const res = await postRegime({});
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "muscle is required" });
  });

  it("returns 400 when muscle is only whitespace", async () => {
    const res = await postRegime({ muscle: "   " });
    expect(res.status).toBe(400);
  });

  it("returns 400 when muscle is not a string", async () => {
    const res = await postRegime({ muscle: 42 });
    expect(res.status).toBe(400);
  });

  it("returns a regime for a known body region", async () => {
    const res = await postRegime({ muscle: "knee" });
    expect(res.status).toBe(200);
    const body = await json<RegimeBody>(res);
    expect(body.muscle).toBe("knee");
    expect(body.regime).toHaveLength(2);
    expect(body.regime[0]).toMatchObject({ name: "Straight Leg Raise", sets: 3, reps: 10 });
  });

  it("normalises case and surrounding whitespace", async () => {
    const res = await postRegime({ muscle: "  KNEE " });
    expect(res.status).toBe(200);
    const body = await json<RegimeBody>(res);
    expect(body.muscle).toBe("knee");
  });

  it("returns 404 when no exercises match", async () => {
    const res = await postRegime({ muscle: "spleen" });
    expect(res.status).toBe(404);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain("spleen");
  });
});

describe("CORS", () => {
  it("answers preflight with the allowed methods", async () => {
    const res = await fetch(`${base}/regime`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("sets the allow-origin header on real responses", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  });
});

describe("unknown routes", () => {
  it("returns 404", async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
  });
});
