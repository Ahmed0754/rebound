// The public-facing API calls this client makes: one named function per server endpoint.

import type { Answers } from "@/lib/questionnaire";

// Falls back to the server's own default port so a fresh checkout works
// without an .env file.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type Exercise = {
  id: string;
  name: string;
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
  // The account that generated it. A tag, not an ownership check: the server
  // does not yet refuse another account's plan on GET/PUT/DELETE by id.
  userId: string | null;
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

// A test account. No password: anyone holding the id can act as it.
export type User = {
  id: string;
  username: string;
  createdAt: string;
};

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
// can tell a 409 ("no plan from these answers") from a 503 ("try again").
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

// Every call goes through here. It adds `X-User-Id` when there is one, and
// turns a failure into an ApiError carrying the server's message - that is
// more specific than anything this client would invent.
//
// A 204 has no body, so it resolves to undefined. A failure body is parsed
// guardedly: a dead server or a proxy in the way answers with HTML, and that
// must not surface as a parse error instead of the status.
async function request<T>(
  path: string,
  { method = "GET", body, userId }: { method?: string; body?: unknown; userId?: string } = {}
): Promise<T> {
  let res: Response;

  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(userId ? { "X-User-Id": userId } : {}),
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

// Creates an account. Throws on a 400 (bad username) or a 409 (taken).
export function createUser(username: string): Promise<User> {
  return request("/api/users", { method: "POST", body: { username } });
}

// Every account, so a test session can pick one instead of remembering a uuid.
export function listUsers(): Promise<User[]> {
  return request("/api/users");
}

// One account, or a 404 ApiError if it has been deleted.
export function getUser(userId: string): Promise<User> {
  return request(`/api/users/${id(userId)}`);
}

// Deletes an account, and with it every plan and questionnaire it owns.
export function deleteUser(userId: string): Promise<void> {
  return request(`/api/users/${id(userId)}`, { method: "DELETE" });
}

// Saves a whole questionnaire in one go and returns the server's decision.
// Slow when there is a note: the server screens it with Gemini first.
export function createOnboarding(
  userId: string,
  answers: Answers,
  freeText: string
): Promise<OnboardingResult> {
  return request("/api/onboarding", { method: "POST", userId, body: { ...answers, freeText } });
}

// Reads a saved questionnaire's decision back by id. A 404 for an unknown id
// and for another account's alike.
export function getOnboarding(userId: string, onboardingId: string): Promise<OnboardingResult> {
  return request(`/api/onboarding/${id(onboardingId)}`, { userId });
}

// Generates a plan from a saved questionnaire and saves it. Slow: up to two
// Gemini calls. 409 means no plan from these answers, 503 means try again.
export function createRegimeFromOnboarding(userId: string, onboardingId: string): Promise<Regime> {
  return request("/api/regimes", { method: "POST", userId, body: { onboardingId } });
}

// Every plan this account has generated, newest first. None yet is an empty
// list, not an error.
export function listRegimes(userId: string): Promise<Regime[]> {
  return request("/api/regimes", { userId });
}

// One plan by id, or a 404 ApiError.
export function getRegimeById(regimeId: string): Promise<Regime> {
  return request(`/api/regimes/${id(regimeId)}`);
}

// Replaces the doses of a saved plan and returns it as it now stands.
export function updateRegime(regimeId: string, regime: RegimeEdit[]): Promise<Regime> {
  return request(`/api/regimes/${id(regimeId)}`, { method: "PUT", body: { regime } });
}

// Deletes a saved plan. Hard delete on the server; there is no undo.
export function deleteRegime(regimeId: string): Promise<void> {
  return request(`/api/regimes/${id(regimeId)}`, { method: "DELETE" });
}

// The message to show for anything a call threw.
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
