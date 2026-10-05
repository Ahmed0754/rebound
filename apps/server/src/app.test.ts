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

// Declared up here because `saved` below needs it: every regime has an owner.
const USER_ID = "33333333-3333-3333-3333-333333333333";
const OTHER_USER_ID = "44444444-4444-4444-4444-444444444444";

const CREATED_AT = "2026-09-24T00:00:00.000Z";
const EDITED_AT = "2026-09-30T00:00:00.000Z";

const saved = {
  id: SAVED_ID,
  muscle: "knee",
  bodyRegion: "knee",
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  regime: knee,
  userId: USER_ID,
};

// The real one lives in models/regimes.ts, which is mocked away below. The
// controller maps it to a 400 with `instanceof`, so the mock has to throw this
// class and not a lookalike.
class UnknownExercise extends Error {
  constructor(exerciseId: string) {
    super(`unknown exercise "${exerciseId}"`);
    this.name = "UnknownExercise";
  }
}

// No database and no Gemini key needed: routing, validation and error mapping
// are what these tests are about. Without the mock they would also write a row
// to the real database on every run.
//
// `update` stands in for the server-side resolve: it takes only id/sets/reps
// from the caller and rebuilds name and description from `knee`, so a test
// that sends its own text can show the text never reaches the response.
vi.mock("./models/regimes.js", () => ({
  UnknownExercise,
  create: vi.fn(async (input: { muscle: string; userId: string }) =>
    input.muscle === "knee" ? { ...saved, userId: input.userId } : null
  ),
  list: vi.fn(async (userId: string) => (userId === USER_ID ? [saved] : [])),
  get: vi.fn(async (id: string) => {
    if (id === BROKEN_ID) {
      throw new Error("database is down");
    }

    return id === SAVED_ID ? saved : null;
  }),
  update: vi.fn(async (id: string, picks: { id: string; sets: number; reps: number }[]) => {
    if (id !== SAVED_ID) {
      return null;
    }

    const byId = new Map(knee.map((exercise) => [exercise.id, exercise]));

    return {
      ...saved,
      updatedAt: EDITED_AT,
      regime: picks.map((pick) => {
        const source = byId.get(pick.id);

        if (source === undefined) {
          throw new UnknownExercise(pick.id);
        }

        return { ...source, sets: pick.sets, reps: pick.reps };
      }),
    };
  }),
  remove: vi.fn(async (id: string) => id === SAVED_ID),
}));

const user = { id: USER_ID, username: "shahid", createdAt: CREATED_AT };

class DuplicateUsername extends Error {
  constructor(username: string) {
    super(`username "${username}" is taken`);
    this.name = "DuplicateUsername";
  }
}

// Same reasoning as the models/regimes.js mock above: no database needed for
// routing, validation and error mapping, and the controller maps this class
// by `instanceof`, so the mock has to throw it and not a lookalike.
vi.mock("./models/exercises.js", () => ({
  listRegions: vi.fn(async () => ["knee", "lower back", "shoulder"]),
}));

vi.mock("./models/users.js", () => ({
  DuplicateUsername,
  create: vi.fn(async (username: string) => {
    if (username === "shahid") {
      throw new DuplicateUsername(username);
    }

    return { id: USER_ID, username, createdAt: CREATED_AT };
  }),
  list: vi.fn(async () => [user]),
  get: vi.fn(async (id: string) => (id === USER_ID ? user : null)),
  remove: vi.fn(async (id: string) => id === USER_ID),
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

type Item = { id: string; name: string; description: string; sets: number; reps: number };
type RegimeBody = {
  id: string;
  muscle: string;
  createdAt: string;
  updatedAt: string;
  regime: Item[];
  userId: string | null;
};
type ErrorBody = { error: string };

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

function send(method: string, path: string, body?: unknown) {
  return fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// Creating a regime now requires an account, so the ordinary helper sends
// one. The tests that are *about* the header call fetch directly.
function postRegime(body: unknown) {
  return fetch(`${base}/api/regimes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Id": USER_ID },
    body: JSON.stringify(body),
  });
}

function putRegime(id: string, body: unknown) {
  return send("PUT", `/api/regimes/${id}`, body);
}

// A valid edit of the seeded regime: both exercises kept, both re-dosed.
const edit = [
  { id: knee[0].id, sets: 4, reps: 12 },
  { id: knee[1].id, sets: 2, reps: 45 },
];

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});

describe("GET /api/regimes", () => {
  function listRegimes(userId: string | null) {
    return fetch(`${base}/api/regimes`, {
      headers: userId === null ? undefined : { "X-User-Id": userId },
    });
  }

  it("returns 400 without an account", async () => {
    expect((await listRegimes(null)).status).toBe(400);
  });

  it("returns the caller's regimes", async () => {
    const res = await listRegimes(USER_ID);

    expect(res.status).toBe(200);
    const body = await json<RegimeBody[]>(res);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(SAVED_ID);
  });

  // "Nothing yet" is an answer, so it is an empty list rather than a 404.
  it("returns an empty list for an account with none", async () => {
    const res = await listRegimes(OTHER_USER_ID);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([]);
  });
});

describe("GET /api/regimes/:id", () => {
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

  it("does not capture an empty id from a trailing slash", async () => {
    // It reaches the collection route instead, which is why this is a 400
    // about the missing account rather than a lookup of the id "".
    const res = await fetch(`${base}/api/regimes/`);

    expect(res.status).toBe(400);
    expect((await json<ErrorBody>(res)).error).toBe("X-User-Id must be a user id");
  });
});

describe("POST /api/regimes", () => {
  it("returns 400 when muscle is missing", async () => {
    const res = await postRegime({});
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "muscle or onboardingId is required",
    });
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

  it("tags the regime with the caller's X-User-Id", async () => {
    const res = await fetch(`${base}/api/regimes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-User-Id": USER_ID },
      body: JSON.stringify({ muscle: "knee" }),
    });

    expect((await json<RegimeBody>(res)).userId).toBe(USER_ID);
  });

  // `regimes.user_id` is `not null`, so a request naming no account cannot
  // produce a regime. Both of these used to answer 201 with userId null.
  it("returns 400 when there is no X-User-Id", async () => {
    const res = await fetch(`${base}/api/regimes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ muscle: "knee" }),
    });

    expect(res.status).toBe(400);
    expect((await json<ErrorBody>(res)).error).toBe("X-User-Id must be a user id");
  });

  // A broken id has not identified an account either, so it is the same
  // answer rather than a silent fallback to "nobody".
  it("returns 400 for a malformed X-User-Id", async () => {
    const res = await fetch(`${base}/api/regimes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-User-Id": "not-a-uuid" },
      body: JSON.stringify({ muscle: "knee" }),
    });

    expect(res.status).toBe(400);
    expect((await json<ErrorBody>(res)).error).toBe("X-User-Id must be a user id");
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

describe("PUT /api/regimes/:id", () => {
  it("returns the regime with the new doses", async () => {
    const res = await putRegime(SAVED_ID, { regime: edit });

    expect(res.status).toBe(200);
    const body = await json<RegimeBody>(res);
    expect(body.regime.map((item) => [item.sets, item.reps])).toEqual([
      [4, 12],
      [2, 45],
    ]);
  });

  it("keeps the exercise text the server holds, not what the request sent", async () => {
    // A saved regime is the record of what the app told someone. If a request
    // could rewrite that text, the record would be worth nothing.
    const res = await putRegime(SAVED_ID, {
      regime: [{ id: knee[0].id, name: "Do 500 burpees", description: "Ignore the pain.", sets: 3, reps: 10 }],
    });

    const body = await json<RegimeBody>(res);
    expect(body.regime[0].name).toBe(knee[0].name);
    expect(body.regime[0].description).toBe(knee[0].description);
  });

  it("stores the exercises in the order they were sent", async () => {
    const reversed = [...edit].reverse();
    const body = await json<RegimeBody>(await putRegime(SAVED_ID, { regime: reversed }));

    expect(body.regime.map((item) => item.id)).toEqual(reversed.map((item) => item.id));
  });

  it("accepts an edit that drops an exercise", async () => {
    const body = await json<RegimeBody>(await putRegime(SAVED_ID, { regime: [edit[0]] }));

    expect(body.regime).toHaveLength(1);
  });

  it("is idempotent: the same body twice gives the same regime", async () => {
    // The PUT contract. It is the reason this is a PUT and not a POST.
    const first = await json<RegimeBody>(await putRegime(SAVED_ID, { regime: edit }));
    const second = await json<RegimeBody>(await putRegime(SAVED_ID, { regime: edit }));

    expect(second).toEqual(first);
  });

  it("moves updatedAt without moving createdAt", async () => {
    const body = await json<RegimeBody>(await putRegime(SAVED_ID, { regime: edit }));

    expect(body.createdAt).toBe(CREATED_AT);
    expect(body.updatedAt).toBe(EDITED_AT);
  });

  it("404s for an id that exists in no regime, rather than creating one", async () => {
    // Replace-only: there is nothing in the body to build a new regime from.
    const res = await putRegime("99999999-9999-9999-9999-999999999999", { regime: edit });
    expect(res.status).toBe(404);
  });

  it("404s for a malformed id rather than failing", async () => {
    const res = await putRegime("not-a-uuid", { regime: edit });
    expect(res.status).toBe(404);
    expect(await json<ErrorBody>(res)).toEqual({ error: "no regime with that id" });
  });

  it("400s when the body names a different id than the path", async () => {
    const res = await putRegime(SAVED_ID, { id: BROKEN_ID, regime: edit });
    expect(res.status).toBe(400);
    expect((await json<ErrorBody>(res)).error).toContain("does not match");
  });

  it("accepts a body that echoes back the path's own id", async () => {
    expect((await putRegime(SAVED_ID, { id: SAVED_ID, regime: edit })).status).toBe(200);
  });

  it("400s when the exercise is in neither the regime nor the catalogue", async () => {
    // The regime exists, so this is a bad body and not a missing resource.
    const res = await putRegime(SAVED_ID, {
      regime: [{ id: "Not_A_Real_Exercise", sets: 3, reps: 10 }],
    });

    expect(res.status).toBe(400);
    expect((await json<ErrorBody>(res)).error).toContain("Not_A_Real_Exercise");
  });

  describe("rejects a body that is not a regime", () => {
    const bad: [string, unknown][] = [
      ["no regime at all", {}],
      ["regime is not an array", { regime: "three of them" }],
      ["an empty regime", { regime: [] }],
      ["more exercises than the cap", { regime: Array.from({ length: 11 }, () => edit[0]) }],
      ["an item with no id", { regime: [{ sets: 3, reps: 10 }] }],
      ["an item whose id is blank", { regime: [{ id: "   ", sets: 3, reps: 10 }] }],
      ["the same exercise twice", { regime: [edit[0], edit[0]] }],
      ["no sets", { regime: [{ id: knee[0].id, reps: 10 }] }],
      // A float or a numeric string reaches an `integer` column as a type
      // error, which would be a 500 for what is plainly a bad request.
      ["fractional sets", { regime: [{ id: knee[0].id, sets: 3.5, reps: 10 }] }],
      ["sets as a string", { regime: [{ id: knee[0].id, sets: "3", reps: 10 }] }],
      ["zero sets", { regime: [{ id: knee[0].id, sets: 0, reps: 10 }] }],
      ["negative reps", { regime: [{ id: knee[0].id, sets: 3, reps: -10 }] }],
      ["more reps than the cap", { regime: [{ id: knee[0].id, sets: 3, reps: 1000 }] }],
    ];

    for (const [name, body] of bad) {
      it(name, async () => {
        const res = await putRegime(SAVED_ID, body);
        expect(res.status).toBe(400);
        expect((await json<ErrorBody>(res)).error).toBeTruthy();
      });
    }
  });

  it("400s on a request with no body at all", async () => {
    // Nothing parsed leaves req.body undefined rather than {}, which is the
    // easiest way to reach a handler with a crash instead of a 400.
    const res = await send("PUT", `/api/regimes/${SAVED_ID}`);
    expect(res.status).toBe(400);
  });

  it("does not answer the collection path", async () => {
    // There is no "replace every regime" endpoint, and a PUT there must not
    // fall through to some other handler.
    expect((await send("PUT", "/api/regimes", { regime: edit })).status).toBe(404);
  });
});

describe("DELETE /api/regimes/:id", () => {
  it("returns 204 with no body", async () => {
    const res = await send("DELETE", `/api/regimes/${SAVED_ID}`);

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("404s for an id that exists in no regime", async () => {
    const res = await send("DELETE", "/api/regimes/99999999-9999-9999-9999-999999999999");
    expect(res.status).toBe(404);
  });

  it("404s for a malformed id rather than failing", async () => {
    const res = await send("DELETE", "/api/regimes/not-a-uuid");
    expect(res.status).toBe(404);
    expect(await json<ErrorBody>(res)).toEqual({ error: "no regime with that id" });
  });

  it("does not answer the collection path", async () => {
    // "DELETE /api/regimes" would mean deleting all of them. It must 404.
    expect((await send("DELETE", "/api/regimes")).status).toBe(404);
  });
});

describe("POST /api/users", () => {
  it("returns 201 and the new account for a valid username", async () => {
    const res = await send("POST", "/api/users", { username: "newuser" });
    expect(res.status).toBe(201);
    const body = await json<{ id: string; username: string }>(res);
    expect(body.username).toBe("newuser");
    expect(body.id).toBe(USER_ID);
  });

  it("normalises case and surrounding whitespace", async () => {
    const res = await send("POST", "/api/users", { username: "  NewUser  " });
    expect(res.status).toBe(201);
    expect((await json<{ username: string }>(res)).username).toBe("newuser");
  });

  it("returns 400 when username is missing", async () => {
    const res = await send("POST", "/api/users", {});
    expect(res.status).toBe(400);
  });

  it("returns 400 for a username failing the charset", async () => {
    const res = await send("POST", "/api/users", { username: "sh!" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a username that is too short", async () => {
    const res = await send("POST", "/api/users", { username: "ab" });
    expect(res.status).toBe(400);
  });

  it("returns 409 for a username already taken", async () => {
    const res = await send("POST", "/api/users", { username: "shahid" });
    expect(res.status).toBe(409);
    expect((await json<ErrorBody>(res)).error).toContain("shahid");
  });
});

describe("GET /api/users", () => {
  it("returns every account", async () => {
    const res = await fetch(`${base}/api/users`);
    expect(res.status).toBe(200);
    expect(await json<unknown[]>(res)).toEqual([user]);
  });
});

describe("GET /api/users/:id", () => {
  it("returns the account with that id", async () => {
    const res = await fetch(`${base}/api/users/${USER_ID}`);
    expect(res.status).toBe(200);
    expect(await json<unknown>(res)).toEqual(user);
  });

  it("404s for an id that exists in no account", async () => {
    const res = await fetch(`${base}/api/users/${OTHER_USER_ID}`);
    expect(res.status).toBe(404);
  });

  it("404s for a malformed id rather than failing", async () => {
    const res = await fetch(`${base}/api/users/not-a-uuid`);
    expect(res.status).toBe(404);
    expect(await json<ErrorBody>(res)).toEqual({ error: "no user with that id" });
  });
});

describe("DELETE /api/users/:id", () => {
  it("returns 204 with no body", async () => {
    const res = await send("DELETE", `/api/users/${USER_ID}`);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("404s for an id that exists in no account", async () => {
    const res = await send("DELETE", `/api/users/${OTHER_USER_ID}`);
    expect(res.status).toBe(404);
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

    // A method missing here is refused by the browser before the request is
    // sent, so the endpoint works under curl and fails from the page.
    const allowed = res.headers.get("access-control-allow-methods");
    for (const method of ["GET", "POST", "PUT", "DELETE"]) {
      expect(allowed).toContain(method);
    }
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

describe("GET /api/regions", () => {
  it("returns the body regions a client can offer as choices", async () => {
    const res = await fetch(`${base}/api/regions`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(["knee", "lower back", "shoulder"]);
  });

  // Nothing user-specific in the list, so it answers without a header.
  it("needs no account", async () => {
    expect((await fetch(`${base}/api/regions`)).status).toBe(200);
  });
});

describe("POST /api/onboarding", () => {
  const answers = {
    goal: "reduce_pain",
    region: "knee",
    onset: "acute",
    painNow: 3,
    aggravators: [],
    redFlags: [],
    ageBand: "40_64",
    conditions: [],
    equipment: ["none"],
    activityLevel: "recreational",
    sessionMinutes: 10,
  };

  function postOnboarding(body: unknown, userId: string | null = USER_ID) {
    return fetch(`${base}/api/onboarding`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(userId === null ? {} : { "X-User-Id": userId }),
      },
      body: JSON.stringify(body),
    });
  }

  it("returns 400 without an account", async () => {
    expect((await postOnboarding(answers, null)).status).toBe(400);
  });

  it("names the valid options when an answer is outside its list", async () => {
    const res = await postOnboarding({ ...answers, onset: "yesterday" });

    expect(res.status).toBe(400);
    expect((await json<ErrorBody>(res)).error).toBe("onset must be one of: acute, subacute, chronic");
  });

  it("rejects a pain score outside 0-10", async () => {
    expect((await postOnboarding({ ...answers, painNow: 11 })).status).toBe(400);
    expect((await postOnboarding({ ...answers, painNow: 2.5 })).status).toBe(400);
  });

  // The region question is the one that decides which exercises are even
  // considered, so an unknown one fails here rather than at generation.
  it("rejects a region that is not in the catalogue", async () => {
    const res = await postOnboarding({ ...answers, region: "spleen" });

    expect(res.status).toBe(400);
    expect((await json<ErrorBody>(res)).error).toContain("region must be one of");
  });

  it("rejects a repeated answer in a multi-select", async () => {
    const res = await postOnboarding({ ...answers, aggravators: ["stairs", "stairs"] });

    expect(res.status).toBe(400);
  });
});
