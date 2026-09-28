import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const knee = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Straight Leg Raise",
    description: "Lift the leg straight up to hip height.",
    sets: 3,
    reps: 10,
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Wall Sit",
    description: "Slide down a wall and hold.",
    sets: 3,
    reps: 30,
  },
];

const SAVED_ID = "11111111-2222-3333-4444-555555555555";
const BROKEN_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

const saved = {
  id: SAVED_ID,
  muscle: "knee",
  bodyRegion: "knee",
  createdAt: "2026-09-24T00:00:00.000Z",
  regime: knee,
};

// No database and no Gemini key needed: routing, validation and error mapping
// are what these tests are about. Without the mock they would also write a row
// to the real database on every run.
vi.mock("./models/regimes.js", () => ({
  create: vi.fn(async (muscle: string) => (muscle === "knee" ? saved : null)),
  get: vi.fn(async (id: string) => {
    if (id === BROKEN_ID) {
      throw new Error("database is down");
    }

    return id === SAVED_ID ? saved : null;
  }),
}));

const { app } = await import("./app.js");

let base: string;
let server: Server;

beforeAll(async () => {
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, () => resolve(listening));
  });
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
});

type RegimeBody = { id: string; muscle: string; regime: { name: string; sets: number; reps: number }[] };
type ErrorBody = { error: string };

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

function postRegime(body: unknown) {
  return fetch(`${base}/api/regimes`, {
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

describe("GET /api/regimes/:id", () => {
  it("does not answer the POST route's path", async () => {
    // Method and path both have to match, so a GET to the collection is not a regime.
    expect((await fetch(`${base}/api/regimes`)).status).toBe(404);
  });

  it("returns the regime with that id", async () => {
    const res = await fetch(`${base}/api/regimes/${SAVED_ID}`);

    expect(res.status).toBe(200);
    const body = await json<RegimeBody>(res);
    expect(body.id).toBe(SAVED_ID);
    expect(body.regime).toHaveLength(2);
  });

  it("404s for an id that exists in no regime", async () => {
    const res = await fetch(`${base}/api/regimes/99999999-9999-9999-9999-999999999999`);
    expect(res.status).toBe(404);
  });

  it("404s for a malformed id rather than failing", async () => {
    const res = await fetch(`${base}/api/regimes/not-a-uuid`);
    expect(res.status).toBe(404);
    expect(await json<ErrorBody>(res)).toEqual({ error: "no regime with that id" });
  });

  it("does not match a path with an extra segment", async () => {
    // ":id" captures one segment and never two.
    const res = await fetch(`${base}/api/regimes/${SAVED_ID}/extra`);
    expect(res.status).toBe(404);
    expect((await json<ErrorBody>(res)).error).toBe("not found");
  });

  it("does not match an empty id", async () => {
    // A trailing slash must not capture "" and look like a valid lookup.
    const res = await fetch(`${base}/api/regimes/`);
    expect(res.status).toBe(404);
    expect((await json<ErrorBody>(res)).error).toBe("not found");
  });
});

describe("POST /api/regimes", () => {
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

  it("returns the id the regime was saved under", async () => {
    const body = await json<RegimeBody>(await postRegime({ muscle: "knee" }));

    // The client needs this to fetch the regime back later, so a response
    // without it is a broken contract even when the exercises are right.
    expect(body.id).toBe(SAVED_ID);
  });

  it("returns 201 and a regime for a known body region", async () => {
    const res = await postRegime({ muscle: "knee" });
    expect(res.status).toBe(201);
    const body = await json<RegimeBody>(res);
    expect(body.muscle).toBe("knee");
    expect(body.regime).toHaveLength(2);
    expect(body.regime[0]).toMatchObject({ name: "Straight Leg Raise", sets: 3, reps: 10 });
  });

  it("normalises case and surrounding whitespace", async () => {
    // The mock only knows "knee", so a 201 here means the controller cleaned it up.
    const res = await postRegime({ muscle: "  KNEE " });
    expect(res.status).toBe(201);
  });

  it("returns 404 when no exercises match", async () => {
    const res = await postRegime({ muscle: "spleen" });
    expect(res.status).toBe(404);
    expect((await json<ErrorBody>(res)).error).toContain("spleen");
  });
});

describe("errors", () => {
  it("turns a thrown model error into a 500 without leaking it", async () => {
    const res = await fetch(`${base}/api/regimes/${BROKEN_ID}`);
    expect(res.status).toBe(500);
    expect(await json<ErrorBody>(res)).toEqual({ error: "internal server error" });
  });
});

describe("CORS", () => {
  it("answers preflight with the allowed methods", async () => {
    const res = await fetch(`${base}/api/regimes`, { method: "OPTIONS" });
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
