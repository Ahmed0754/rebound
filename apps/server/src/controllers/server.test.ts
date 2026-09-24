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
vi.mock("../models/regime.js", () => ({
  buildRegime: vi.fn(async (muscle: string) => (muscle === "knee" ? knee : [])),
}));

// Mocked for the same reason, and for one more: without it these tests write a
// row to the real database on every run.
const saved = {
  id: "11111111-2222-3333-4444-555555555555",
  muscle: "knee",
  bodyRegion: "knee",
  createdAt: "2026-09-24T00:00:00.000Z",
  regime: knee,
};

vi.mock("../models/regimes.js", () => ({
  saveRegime: vi.fn(async () => "00000000-0000-0000-0000-000000000000"),
  findLatestRegime: vi.fn(async () => null),
  findRegimeById: vi.fn(async (id: string) =>
    id === "11111111-2222-3333-4444-555555555555" ? saved : null
  ),
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

describe("GET /regime/latest", () => {
  it("404s when nothing has been saved", async () => {
    const res = await fetch(`${base}/regime/latest`);

    // An empty database is an ordinary state, not a server fault, so this must
    // not come back as a 500.
    expect(res.status).toBe(404);
    expect((await json<{ error: string }>(res)).error).toBe("no regime saved yet");
  });

  it("does not answer the POST route's path", async () => {
    // Method and path both have to match, so a GET to /regime is not a regime.
    expect((await fetch(`${base}/regime`)).status).toBe(404);
  });

  it("is not swallowed by the /regime/:id route", async () => {
    // "/regime/:id" would match "/regime/latest" with id = "latest", so this
    // fails the moment the two routes are listed in the wrong order.
    const res = await fetch(`${base}/regime/latest`);
    expect(await json<{ error: string }>(res)).toEqual({ error: "no regime saved yet" });
  });
});

describe("GET /regime/:id", () => {
  it("returns the regime with that id", async () => {
    const res = await fetch(`${base}/regime/11111111-2222-3333-4444-555555555555`);

    expect(res.status).toBe(200);
    const body = await json<{ id: string; regime: unknown[] }>(res);
    expect(body.id).toBe("11111111-2222-3333-4444-555555555555");
    expect(body.regime).toHaveLength(2);
  });

  it("404s for an id that exists in no regime", async () => {
    const res = await fetch(`${base}/regime/99999999-9999-9999-9999-999999999999`);
    expect(res.status).toBe(404);
  });

  it("404s for a malformed id rather than failing", async () => {
    // Postgres rejects a non-uuid outright, so without the guard in the model
    // this would surface as a 500 for what is only a bad URL.
    const res = await fetch(`${base}/regime/not-a-uuid`);
    expect(res.status).toBe(404);
    expect((await json<{ error: string }>(res)).error).toBe("no regime with that id");
  });

  it("does not match a path with an extra segment", async () => {
    // Segment counts must agree, so ":id" captures one segment and never two.
    const res = await fetch(`${base}/regime/11111111-2222-3333-4444-555555555555/extra`);
    expect(res.status).toBe(404);
    expect((await json<{ error: string }>(res)).error).toBe("not found");
  });

  it("does not match an empty id", async () => {
    // "/regime/" must not capture "" and look like a valid lookup.
    const res = await fetch(`${base}/regime/`);
    expect(res.status).toBe(404);
    expect((await json<{ error: string }>(res)).error).toBe("not found");
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

  it("returns the id the regime was saved under", async () => {
    const body = await json<{ id: string }>(await postRegime({ muscle: "knee" }));

    // The client needs this to fetch the regime back later, so a response
    // without it is a broken contract even when the exercises are right.
    expect(body.id).toBe("00000000-0000-0000-0000-000000000000");
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

describe("request bodies", () => {
  // A body this size arrives in several socket chunks. Joining the chunks as
  // bytes before decoding is what keeps the three-byte characters that straddle
  // a boundary intact; the 404 echoes the muscle back, so a mangled one shows.
  it("keeps multi-byte characters intact across chunk boundaries", async () => {
    const muscle = "日".repeat(60_000);
    const res = await postRegime({ muscle });
    expect(res.status).toBe(404);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe(`no exercises found for "${muscle}"`);
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
