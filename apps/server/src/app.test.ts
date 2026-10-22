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

// What `getFunnelFor` reports, passed through untouched by the controller.
const FUNNEL = {
  catalogue: 873,
  region: 60,
  equipment: 41,
  level: 30,
  category: 12,
  aggravators: 9,
  shown: 9,
};
const BROKEN_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

// Declared up here because `saved` below needs it: every regime has an owner.
const USER_ID = "33333333-3333-3333-3333-333333333333";
const OTHER_USER_ID = "44444444-4444-4444-4444-444444444444";

// Session tokens, and what the mocked sessions model says they belong to.
const TOKEN = "token-for-user";
const OTHER_TOKEN = "token-for-other-user";
const AUTH = { Authorization: `Bearer ${TOKEN}` };

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

// Same reason as UnknownExercise: the controller maps it with `instanceof`.
class TooFewCandidates extends Error {
  constructor(found: number, needed: number) {
    super(`only ${found} exercises fit these answers, and a plan needs at least ${needed}`);
    this.name = "TooFewCandidates";
  }
}

// Same reason again: mapped to a 503 with `instanceof`.
class GenerationFailed extends Error {
  constructor() {
    super("we couldn't build a plan right now - please try again in a few minutes");
    this.name = "GenerationFailed";
  }
}

// A saved questionnaire whose filters leave too little to build a plan from.
const NARROW_ONBOARDING_ID = "55555555-5555-5555-5555-555555555555";
// One the model will not produce a valid plan for.
const STUCK_ONBOARDING_ID = "66666666-6666-6666-6666-666666666666";
// One whose note was screened as a crisis.
const CRISIS_ONBOARDING_ID = "77777777-7777-7777-7777-777777777777";

// No database and no Gemini key needed: routing, validation and error mapping
// are what these tests are about. Without the mock they would also write a row
// to the real database on every run.
//
// `update` stands in for the server-side resolve: it takes only id/sets/reps
// from the caller and rebuilds name and description from `knee`, so a test
// that sends its own text can show the text never reaches the response.
vi.mock("./models/regimes.js", () => ({
  UnknownExercise,
  TooFewCandidates,
  GenerationFailed,
  create: vi.fn(async (input: { muscle: string; userId: string; onboarding?: unknown }) => {
    if (input.onboarding !== undefined && input.muscle === "wrist") {
      throw new TooFewCandidates(1, 2);
    }

    if (input.muscle === "shoulder") {
      throw new GenerationFailed();
    }

    return input.muscle === "knee" ? { ...saved, userId: input.userId } : null;
  }),
  list: vi.fn(async (userId: string) => (userId === USER_ID ? [saved] : [])),
  get: vi.fn(async (id: string, userId: string) => {
    if (id === BROKEN_ID) {
      throw new Error("database is down");
    }

    return id === SAVED_ID && userId === USER_ID ? saved : null;
  }),
  update: vi.fn(async (id: string, userId: string, picks: { id: string; sets: number; reps: number }[]) => {
    if (id !== SAVED_ID || userId !== USER_ID) {
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
  remove: vi.fn(async (id: string, userId: string) => id === SAVED_ID && userId === USER_ID),
  getCandidatesFor: vi.fn(async () => []),
  getFunnelFor: vi.fn(async () => FUNNEL),
  toCandidateQuery: vi.fn((answers: { region: string }) => ({ region: answers.region })),
}));

const user = { id: USER_ID, username: "shahid", createdAt: CREATED_AT };
const PASSWORD = "correct horse battery";

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

// A stored questionnaire, as `get` returns one: the answers plus the note.
function storedOnboarding(id: string, userId: string, region: string, screening = "not_needed") {
  return {
    id,
    userId,
    createdAt: CREATED_AT,
    answers: {
      goal: "reduce_pain",
      region,
      onset: "acute",
      painNow: 8,
      aggravators: [],
      redFlags: [],
      ageBand: "50_plus",
      conditions: [],
      equipment: ["none"],
      activityLevel: "sedentary",
      sessionMinutes: 5,
    },
    note: {
      freeText: null,
      screening,
      screeningCategories: [],
      screeningQuote: null,
      screeningModel: null,
    },
  };
}

// `create` echoes what it was given, so a POST /api/onboarding test sees the
// outcome its answers and its screening produce.
vi.mock("./models/onboarding.js", () => ({
  create: vi.fn(async (userId: string, answers: unknown, note: unknown) => ({
    id: "88888888-8888-8888-8888-888888888888",
    userId,
    createdAt: CREATED_AT,
    answers,
    note,
  })),
  get: vi.fn(async (id: string, userId: string) => {
    if (id === NARROW_ONBOARDING_ID) {
      return storedOnboarding(id, userId, "wrist");
    }

    if (id === STUCK_ONBOARDING_ID) {
      return storedOnboarding(id, userId, "shoulder");
    }

    if (id === CRISIS_ONBOARDING_ID) {
      return storedOnboarding(id, userId, "knee", "crisis");
    }

    return null;
  }),
}));

// The real one calls Gemini. Each canned verdict is keyed on a word in the
// note, so a test picks its outcome by what it writes.
vi.mock("./models/classifier.js", () => ({
  screenNote: vi.fn(async (text: string) => {
    if (text.includes("kill myself")) {
      return { screening: "crisis", categories: ["self_harm"], quote: null, model: null };
    }

    if (text.includes("pregnant")) {
      return {
        screening: "flagged",
        categories: ["pregnancy_related"],
        quote: "36 weeks pregnant",
        model: "test",
      };
    }

    if (text.includes("OUTAGE")) {
      return { screening: "unavailable", categories: [], quote: null, model: null };
    }

    return { screening: "clear", categories: [], quote: null, model: "test" };
  }),
}));

vi.mock("./models/users.js", () => ({
  DuplicateUsername,
  create: vi.fn(async (username: string) => {
    if (username === "shahid") {
      throw new DuplicateUsername(username);
    }

    return { id: USER_ID, username, createdAt: CREATED_AT };
  }),
  // "shahid" is the only account with a password; its hash is the password
  // itself, which the auth.js mock below compares directly.
  findForLogin: vi.fn(async (username: string) =>
    username.toLowerCase() === "shahid" ? { user, passwordHash: PASSWORD } : null
  ),
  get: vi.fn(async (id: string) => (id === USER_ID ? user : null)),
  remove: vi.fn(async (id: string) => id === USER_ID),
}));

// No database: the token map stands in for the sessions table.
vi.mock("./models/sessions.js", () => ({
  create: vi.fn(async () => "new-token"),
  userIdFor: vi.fn(async (token: string) =>
    token === TOKEN ? USER_ID : token === OTHER_TOKEN ? OTHER_USER_ID : null
  ),
  remove: vi.fn(async () => undefined),
}));

// Real scrypt is slow on purpose, and auth.test.ts covers it. Here a "hash"
// is just the password, so login tests are about routing and status codes.
vi.mock("./auth.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./auth.js")>()),
  verifyPassword: vi.fn(async (password: string, hash: string) => password === hash),
  verifyNothing: vi.fn(async () => false),
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

// Logged in as USER_ID. The tests that are *about* logging in call fetch directly.
function send(method: string, path: string, body?: unknown) {
  return fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? AUTH : { ...AUTH, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function authed(url: string) {
  return fetch(url, { headers: AUTH });
}

// Creating a regime requires being logged in, so the ordinary helper is.
function postRegime(body: unknown) {
  return fetch(`${base}/api/regimes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...AUTH },
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
  function listRegimes(token: string | null) {
    return fetch(`${base}/api/regimes`, {
      headers: token === null ? undefined : { Authorization: `Bearer ${token}` },
    });
  }

  it("returns 401 when not logged in", async () => {
    expect((await listRegimes(null)).status).toBe(401);
  });

  it("returns the caller's regimes", async () => {
    const res = await listRegimes(TOKEN);

    expect(res.status).toBe(200);
    const body = await json<RegimeBody[]>(res);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(SAVED_ID);
  });

  // "Nothing yet" is an answer, so it is an empty list rather than a 404.
  it("returns an empty list for an account with none", async () => {
    const res = await listRegimes(OTHER_TOKEN);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([]);
  });
});

describe("GET /api/regimes/:id", () => {
  it("returns the regime with that id", async () => {
    const res = await authed(`${base}/api/regimes/${SAVED_ID}`);

    expect(res.status).toBe(200);
    const body = await json<RegimeBody>(res);
    expect(body.id).toBe(SAVED_ID);
    expect(body.regime).toHaveLength(2);
  });

  it("404s for an id that exists in no regime", async () => {
    const res = await authed(`${base}/api/regimes/99999999-9999-9999-9999-999999999999`);
    expect(res.status).toBe(404);
  });

  // The same answer as a missing one, so ids cannot be probed.
  it("404s for another account's regime", async () => {
    const res = await fetch(`${base}/api/regimes/${SAVED_ID}`, {
      headers: { Authorization: `Bearer ${OTHER_TOKEN}` },
    });
    expect(res.status).toBe(404);
  });

  it("401s when not logged in", async () => {
    expect((await fetch(`${base}/api/regimes/${SAVED_ID}`)).status).toBe(401);
  });

  it("404s for a malformed id rather than failing", async () => {
    const res = await authed(`${base}/api/regimes/not-a-uuid`);
    expect(res.status).toBe(404);
    expect(await json<ErrorBody>(res)).toEqual({ error: "no regime with that id" });
  });

  it("does not match a path with an extra segment", async () => {
    // ":id" captures one segment and never two.
    const res = await authed(`${base}/api/regimes/${SAVED_ID}/extra`);
    expect(res.status).toBe(404);
    expect((await json<ErrorBody>(res)).error).toBe("not found");
  });

  it("does not capture an empty id from a trailing slash", async () => {
    // It reaches the collection route instead: the account's list, not a
    // lookup of the id "".
    const res = await authed(`${base}/api/regimes/`);

    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });
});

describe("POST /api/regimes", () => {
  // Nothing is loosened to fill a plan, so a questionnaire whose filters
  // leave too little gets a refusal it can show, not an empty plan or a 500.
  it("returns 409 when too few exercises fit the questionnaire", async () => {
    const res = await postRegime({ onboardingId: NARROW_ONBOARDING_ID });

    expect(res.status).toBe(409);
    expect((await json<ErrorBody>(res)).error).toBe(
      "only 1 exercises fit these answers, and a plan needs at least 2"
    );
  });

  it("returns 503 when no valid plan came back from the model", async () => {
    const res = await postRegime({ onboardingId: STUCK_ONBOARDING_ID });

    expect(res.status).toBe(503);
    expect((await json<ErrorBody>(res)).error).toContain("try again");
  });

  // The crisis outcome is re-checked here, like a red flag, so ignoring the
  // crisis screen and posting the id anyway still gets no plan.
  it("returns 409 for a questionnaire whose note was a crisis", async () => {
    const res = await postRegime({ onboardingId: CRISIS_ONBOARDING_ID });

    expect(res.status).toBe(409);
    expect((await json<ErrorBody>(res)).error).toBe("these answers lead to crisis support, not a plan");
  });

  it("returns 404 for an onboarding id that matches nothing", async () => {
    const res = await postRegime({ onboardingId: "99999999-9999-9999-9999-999999999999" });

    expect(res.status).toBe(404);
  });

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

  it("saves the regime to the logged-in account", async () => {
    expect((await json<RegimeBody>(await postRegime({ muscle: "knee" }))).userId).toBe(USER_ID);
  });

  // `regimes.user_id` is `not null`, so a request from nobody cannot
  // produce a regime.
  it("returns 401 when not logged in", async () => {
    const res = await fetch(`${base}/api/regimes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ muscle: "knee" }),
    });

    expect(res.status).toBe(401);
    expect((await json<ErrorBody>(res)).error).toBe("log in to do that");
  });

  // A made-up or expired token is the same answer: log in again.
  it("returns 401 for a token no session has", async () => {
    const res = await fetch(`${base}/api/regimes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer made-up" },
      body: JSON.stringify({ muscle: "knee" }),
    });

    expect(res.status).toBe(401);
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
      // Exactly one amount: which one is right is the server's to check.
      ["neither reps nor a hold", { regime: [{ id: knee[0].id, sets: 3 }] }],
      ["both reps and a hold", { regime: [{ id: knee[0].id, sets: 3, reps: 10, holdSeconds: 30 }] }],
      ["a fractional hold", { regime: [{ id: knee[0].id, sets: 3, holdSeconds: 2.5 }] }],
      ["a hold longer than the cap", { regime: [{ id: knee[0].id, sets: 3, holdSeconds: 601 }] }],
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
  it("404s for another account's regime, and deletes nothing", async () => {
    const res = await fetch(`${base}/api/regimes/${SAVED_ID}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${OTHER_TOKEN}` },
    });
    expect(res.status).toBe(404);
  });

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
  function signUp(body: unknown) {
    return fetch(`${base}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 201, the new account and a session token", async () => {
    const res = await signUp({ username: "newuser", password: PASSWORD });
    expect(res.status).toBe(201);
    const body = await json<{ user: { id: string; username: string }; token: string }>(res);
    expect(body.user.username).toBe("newuser");
    expect(body.user.id).toBe(USER_ID);
    expect(body.token).toBe("new-token");
  });

  it("never sends the password back", async () => {
    const res = await signUp({ username: "newuser", password: PASSWORD });
    expect(await res.text()).not.toContain(PASSWORD);
  });

  it("normalises case and surrounding whitespace in the username", async () => {
    const res = await signUp({ username: "  NewUser  ", password: PASSWORD });
    expect(res.status).toBe(201);
    expect((await json<{ user: { username: string } }>(res)).user.username).toBe("newuser");
  });

  it("returns 400 when username is missing", async () => {
    expect((await signUp({ password: PASSWORD })).status).toBe(400);
  });

  it("returns 400 for a username failing the charset", async () => {
    expect((await signUp({ username: "sh!", password: PASSWORD })).status).toBe(400);
  });

  it("returns 400 for a username that is too short", async () => {
    expect((await signUp({ username: "ab", password: PASSWORD })).status).toBe(400);
  });

  it("returns 400 when password is missing", async () => {
    const res = await signUp({ username: "newuser" });
    expect(res.status).toBe(400);
    expect((await json<ErrorBody>(res)).error).toBe("password must be 8-128 characters");
  });

  it("returns 400 for a password that is too short", async () => {
    expect((await signUp({ username: "newuser", password: "short" })).status).toBe(400);
  });

  it("returns 400 for a password that is too long", async () => {
    expect((await signUp({ username: "newuser", password: "x".repeat(129) })).status).toBe(400);
  });

  it("returns 409 for a username already taken", async () => {
    const res = await signUp({ username: "shahid", password: PASSWORD });
    expect(res.status).toBe(409);
    expect((await json<ErrorBody>(res)).error).toContain("shahid");
  });
});

describe("POST /api/sessions", () => {
  function logIn(body: unknown) {
    return fetch(`${base}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns the account and a session token for the right password", async () => {
    const res = await logIn({ username: "shahid", password: PASSWORD });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ user, token: "new-token" });
  });

  it("ignores case in the username", async () => {
    expect((await logIn({ username: "Shahid", password: PASSWORD })).status).toBe(200);
  });

  it("returns 401 for a wrong password", async () => {
    const res = await logIn({ username: "shahid", password: "not the password" });
    expect(res.status).toBe(401);
    expect((await json<ErrorBody>(res)).error).toBe("wrong username or password");
  });

  // The same message as a wrong password, so the form can't be used to find
  // out who has an account.
  it("returns the same 401 for a username nobody has", async () => {
    const res = await logIn({ username: "nobody", password: PASSWORD });
    expect(res.status).toBe(401);
    expect((await json<ErrorBody>(res)).error).toBe("wrong username or password");
  });

  it("returns 401 for an empty body", async () => {
    expect((await logIn({})).status).toBe(401);
  });
});

describe("DELETE /api/sessions", () => {
  it("logs out: 204 with no body", async () => {
    const res = await send("DELETE", "/api/sessions");
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("returns 401 when not logged in", async () => {
    expect((await fetch(`${base}/api/sessions`, { method: "DELETE" })).status).toBe(401);
  });
});

describe("GET /api/users/me", () => {
  it("returns the logged-in account", async () => {
    const res = await authed(`${base}/api/users/me`);
    expect(res.status).toBe(200);
    expect(await json<unknown>(res)).toEqual(user);
  });

  it("returns 401 when not logged in", async () => {
    expect((await fetch(`${base}/api/users/me`)).status).toBe(401);
  });

  it("returns 401 when the session's account has been deleted", async () => {
    const res = await fetch(`${base}/api/users/me`, {
      headers: { Authorization: `Bearer ${OTHER_TOKEN}` },
    });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/users/me", () => {
  it("returns 204 with no body", async () => {
    const res = await send("DELETE", "/api/users/me");
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("returns 401 when not logged in", async () => {
    expect((await fetch(`${base}/api/users/me`, { method: "DELETE" })).status).toBe(401);
  });
});

// Nobody needs anyone's account but their own, so these are gone.
describe("routes that no longer exist", () => {
  it("does not list accounts", async () => {
    expect((await authed(`${base}/api/users`)).status).toBe(404);
  });

  it("does not look an account up by id", async () => {
    expect((await authed(`${base}/api/users/${USER_ID}`)).status).toBe(404);
  });
});

describe("errors", () => {
  it("turns a thrown model error into a 500 without leaking it", async () => {
    const res = await authed(`${base}/api/regimes/${BROKEN_ID}`);
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

  // Without it the browser drops the session token from every cross-origin call.
  it("allows the Authorization header", async () => {
    const res = await fetch(`${base}/api/regimes`, { method: "OPTIONS" });
    expect(res.headers.get("access-control-allow-headers")).toContain("Authorization");
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
    ageBand: "30_49",
    conditions: [],
    equipment: ["none"],
    activityLevel: "recreational",
    sessionMinutes: 10,
  };

  function postOnboarding(body: unknown, loggedIn = true) {
    return fetch(`${base}/api/onboarding`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(loggedIn ? AUTH : {}) },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when not logged in", async () => {
    expect((await postOnboarding(answers, false)).status).toBe(401);
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

  it("rejects a note over 500 characters", async () => {
    const res = await postOnboarding({ ...answers, freeText: "a".repeat(501) });

    expect(res.status).toBe(400);
    expect((await json<ErrorBody>(res)).error).toBe("freeText must be at most 500 characters");
  });

  it("treats a blank note as no note, with nothing to screen", async () => {
    const res = await postOnboarding({ ...answers, freeText: "   " });

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ outcome: "ready", screening: "not_needed" });
  });

  it("is ready, with limits, when the note screens clear", async () => {
    const res = await postOnboarding({ ...answers, freeText: "stairs are the worst" });
    const body = await json<{ outcome: string; screening: string; limits?: unknown }>(res);

    expect(body.outcome).toBe("ready");
    expect(body.screening).toBe("clear");
    expect(body.limits).toBeDefined();
  });

  // The PRD's example: "no" to the pregnancy question, then this in the note.
  it("sends a flagged note to a doctor, saying what it was flagged for", async () => {
    const res = await postOnboarding({ ...answers, freeText: "36 weeks pregnant, sciatica's been brutal" });

    await expect(res.json()).resolves.toMatchObject({
      outcome: "see_a_doctor",
      noteCategories: ["pregnancy_related"],
      noteQuote: "36 weeks pregnant",
    });
  });

  // Its own outcome, never folded into see_a_doctor, and with no limits.
  it("sends crisis language to crisis", async () => {
    const res = await postOnboarding({ ...answers, freeText: "I want to kill myself" });
    const body = await json<{ outcome: string; limits?: unknown }>(res);

    expect(body.outcome).toBe("crisis");
    expect(body.limits).toBeUndefined();
  });

  // ADR 0021, as decided: an unscreened note goes through, and says so.
  it("is ready when the classifier was down, and reports the note as unscreened", async () => {
    const res = await postOnboarding({ ...answers, freeText: "OUTAGE sore after football" });

    await expect(res.json()).resolves.toMatchObject({ outcome: "ready", screening: "unavailable" });
  });
});

describe("GET /api/onboarding/:id/candidates", () => {
  function getCandidates(onboardingId: string) {
    return fetch(`${base}/api/onboarding/${onboardingId}/candidates`, {
      headers: AUTH,
    });
  }

  it("reports how the answers narrowed the catalogue down", async () => {
    const res = await getCandidates(NARROW_ONBOARDING_ID);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ funnel: FUNNEL, candidates: [] });
  });

  // Same gate as generating: no plan, so no exercises to count either.
  it("returns 409 for answers that lead to crisis resources", async () => {
    expect((await getCandidates(CRISIS_ONBOARDING_ID)).status).toBe(409);
  });

  it("returns 404 for an unknown questionnaire", async () => {
    expect((await getCandidates("99999999-9999-9999-9999-999999999999")).status).toBe(404);
  });
});
