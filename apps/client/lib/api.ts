// The public-facing API calls this client makes: one named function per server endpoint.

import type { Answers } from "@/lib/questionnaire";

// Falls back to the server's own default port so a fresh checkout works
// without an .env file.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type Exercise = {
  // The catalogue's slug, e.g. "3_4_Sit-Up". Also where its pictures live -
  // see lib/exercises.ts.
  id: string;
  name: string;
  // The steps, one per line. Plans made before that change have them run
  // together on one line instead.
  description: string;
  // A count of repetitions, or a position held for a number of seconds. The
  // server decides which, from the catalogue; exactly one of `reps` and
  // `holdSeconds` is a number, the one `unit` names.
  unit: "reps" | "hold";
  sets: number;
  reps: number | null;
  holdSeconds: number | null;
  // One line on why this exercise, when the plan was generated with one.
  rationale: string | null;
};

export type Regime = {
  id: string;
  // The body region the plan is for, e.g. "knee".
  muscle: string;
  // When it was generated, and when it was last edited. They are equal until
  // someone saves a change, which is the only visible sign a PUT landed.
  createdAt: string;
  updatedAt: string;
  regime: Exercise[];
  // The account that generated it. The server only ever returns a plan to
  // its own account.
  userId: string;
  // The limits the server validated the plan against. Null for plans made
  // before the server recorded them.
  limits: Limits | null;
};

// One exercise as the server lets a client ask for it. No name and no
// description: a saved regime is the record of what the app told someone, so
// the server looks that text up itself and never takes it from a request.
export type RegimeEdit = {
  id: string;
  sets: number;
  reps: number | null;
  holdSeconds: number | null;
};

// An account. The password never comes back from the server.
export type User = {
  id: string;
  username: string;
  createdAt: string;
};

// What signing up and logging in both return: the account, and the session
// token every later call has to send.
export type Session = { user: User; token: string };

export type Range = { min: number; max: number };

// The bounds the server put on a plan for these answers. Shown only on the
// "ready" screen - the client never computes or enforces any of it.
export type Limits = {
  sets: Range;
  reps: Range;
  hold: Range;
  count: Range;
  difficultyCap: string;
  categories: string[];
  // Already written for the user, e.g. "your pain is 7 or above".
  reasons: string[];
};

// How a questionnaire's answers narrowed the exercise library down: the count
// left after each filter in turn (each including the ones before it), and how
// many of those the AI was shown to choose from.
export type Funnel = {
  catalogue: number;
  region: number;
  equipment: number;
  level: number;
  category: number;
  aggravators: number;
  shown: number;
};

export type Screening = "not_needed" | "clear" | "flagged" | "crisis" | "unavailable";

// One saved questionnaire, as the server decided it. Branch on `outcome`,
// never on the HTTP status: all three come back as a success.
export type OnboardingResult =
  | { id: string; outcome: "ready"; screening: Screening; limits: Limits }
  | {
      id: string;
      outcome: "see_a_doctor";
      screening: Screening;
      redFlags: string[];
      noteCategories: string[];
      noteQuote: string | null;
    }
  | { id: string; outcome: "crisis"; screening: Screening };

// A failed request, with the server's own message and the status, so a page
// can tell a 409 ("no plan from these answers") from a 503 ("try again"), and
// a 401 (logged out, or the session expired) from either.
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

// Every call goes through here. It sends the session token when there is one, and
// turns a failure into an ApiError carrying the server's message - that is
// more specific than anything this client would invent.
//
// A 204 has no body, so it resolves to undefined. A failure body is parsed
// guardedly: a dead server or a proxy in the way answers with HTML, and that
// must not surface as a parse error instead of the status.
async function request<T>(
  path: string,
  { method = "GET", body, token }: { method?: string; body?: unknown; token?: string } = {}
): Promise<T> {
  let res: Response;

  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // fetch only rejects when no response arrived at all.
    throw new ApiError("Couldn't reach the server. Is it running?", 0);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(data?.error ?? `Request failed: ${res.status}`, res.status);
  }

  return data as T;
}

const id = (value: string) => encodeURIComponent(value);

// Pings the server; nothing to validate, so there is no failure branch here.
export function getHealth(): Promise<{ ok: boolean }> {
  return request("/health");
}

// The body regions the questionnaire may name. Fetched rather than copied:
// it lives in the database, not in source.
export function listRegions(): Promise<string[]> {
  return request("/api/regions");
}

// Creates an account and logs it in. Throws on a 400 (bad username or
// password) or a 409 (username taken).
export function signUp(username: string, password: string): Promise<Session> {
  return request("/api/users", { method: "POST", body: { username, password } });
}

// Logs in. A 401 means the username or the password is wrong - the server
// deliberately doesn't say which.
export function logIn(username: string, password: string): Promise<Session> {
  return request("/api/sessions", { method: "POST", body: { username, password } });
}

// Ends this session on the server, so the token stops working even if it leaked.
export function logOut(token: string): Promise<void> {
  return request("/api/sessions", { method: "DELETE", token });
}

// The account a token belongs to, or a 401 ApiError once it has expired or
// the account is gone.
export function getMe(token: string): Promise<User> {
  return request("/api/users/me", { token });
}

// Deletes the logged-in account, and with it every plan and questionnaire it owns.
export function deleteMe(token: string): Promise<void> {
  return request("/api/users/me", { method: "DELETE", token });
}

// Saves a whole questionnaire in one go and returns the server's decision.
// Slow when there is a note: the server screens it with Gemini first.
export function createOnboarding(
  token: string,
  answers: Answers,
  freeText: string
): Promise<OnboardingResult> {
  return request("/api/onboarding", { method: "POST", token, body: { ...answers, freeText } });
}

// Reads a saved questionnaire's decision back by id. A 404 for an unknown id
// and for another account's alike.
export function getOnboarding(token: string, onboardingId: string): Promise<OnboardingResult> {
  return request(`/api/onboarding/${id(onboardingId)}`, { token });
}

// How these answers narrowed the library down. 409 when the answers don't
// lead to a plan, so there is nothing to narrow.
export async function getFunnel(token: string, onboardingId: string): Promise<Funnel> {
  const body = await request<{ funnel: Funnel }>(`/api/onboarding/${id(onboardingId)}/candidates`, { token });
  return body.funnel;
}

// Generates a plan from a saved questionnaire and saves it. Slow: the server
// keeps retrying Gemini for up to 20 seconds. 409 means no plan from these
// answers, 503 means try again.
export function createRegimeFromOnboarding(token: string, onboardingId: string): Promise<Regime> {
  return request("/api/regimes", { method: "POST", token, body: { onboardingId } });
}

// Every plan this account has generated, newest first. None yet is an empty
// list, not an error.
export function listRegimes(token: string): Promise<Regime[]> {
  return request("/api/regimes", { token });
}

// One of this account's plans by id, or a 404 ApiError - for another
// account's plan too.
export function getRegimeById(token: string, regimeId: string): Promise<Regime> {
  return request(`/api/regimes/${id(regimeId)}`, { token });
}

// Replaces the doses of a saved plan and returns it as it now stands.
export function updateRegime(token: string, regimeId: string, regime: RegimeEdit[]): Promise<Regime> {
  return request(`/api/regimes/${id(regimeId)}`, { method: "PUT", token, body: { regime } });
}

// Deletes a saved plan. Hard delete on the server; there is no undo.
export function deleteRegime(token: string, regimeId: string): Promise<void> {
  return request(`/api/regimes/${id(regimeId)}`, { method: "DELETE", token });
}

// The message to show for anything a call threw.
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
