// The public-facing API calls this client makes: one named function per server endpoint.

// Falls back to the server's own default port so a fresh checkout works
// without an .env file.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type Exercise = {
  id: string;
  name: string;
  description: string;
  sets: number;
  reps: number;
};

export type Regime = {
  id: string;
  muscle: string;
  // When it was generated, and when it was last edited. They are equal until
  // someone saves a change, which is the only visible sign a PUT landed.
  createdAt: string;
  updatedAt: string;
  regime: Exercise[];
  // Who was signed in when this was generated, or null if nobody was. A tag,
  // not an ownership check - see ACCOUNTS.md.
  userId: string | null;
};

// One exercise as the server lets a client ask for it. No name and no
// description: a saved regime is the record of what the app told someone, so
// the server looks that text up itself and never takes it from a request.
export type RegimeEdit = {
  id: string;
  sets: number;
  reps: number;
};

// Pings the server; nothing to validate, so there is no failure branch here.
export async function getHealth(): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_URL}/health`);
  return res.json();
}

// A test account - see ACCOUNTS.md. No password: anyone holding the id can
// act as it.
export type User = {
  id: string;
  username: string;
  createdAt: string;
};

// Creates an account and returns it. Throws on a 400 (bad username) or a 409
// (taken), with the server's own message - it is more specific than anything
// this client would invent.
export async function createUser(username: string): Promise<User> {
  const res = await fetch(`${API_URL}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed: ${res.status}`);
  }

  return data;
}

// Every account, so a test session can pick one instead of remembering a uuid.
export async function listUsers(): Promise<User[]> {
  const res = await fetch(`${API_URL}/api/users`);

  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }

  return res.json();
}

// Deletes an account. The server answers 204 with no body, so there is
// nothing to hand back on success.
export async function deleteUser(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

  if (res.ok) {
    return;
  }

  const data = await res.json().catch(() => null);
  throw new Error(data?.error ?? `Request failed: ${res.status}`);
}

// The server's error message is more useful than a bare status code, so
// surface it when there is one. Generic because the regime calls below return
// one regime and the list call returns several.
async function readOrThrow<T = Regime>(res: Response): Promise<T> {
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed: ${res.status}`);
  }

  return data;
}

// Generates a regime and saves it. Named for what it does rather than the HTTP
// verb, so it cannot be confused with reading one back.
//
// `userId` is optional: there is no sign-in requirement, only a tag applied
// when the caller happens to have one. See ACCOUNTS.md.
export async function createRegime(muscle: string, userId?: string): Promise<Regime> {
  const res = await fetch(`${API_URL}/api/regimes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(userId ? { "X-User-Id": userId } : {}),
    },
    body: JSON.stringify({ muscle }),
  });

  return readOrThrow(res);
}

// Every regime this account has generated, newest first. An account that has
// not generated one yet comes back as an empty list, not an error.
export async function listRegimes(userId: string): Promise<Regime[]> {
  const res = await fetch(`${API_URL}/api/regimes`, {
    headers: { "X-User-Id": userId },
  });

  return readOrThrow<Regime[]>(res);
}

// Reads back one regime by the id `createRegime` returned.
//
// Returns null rather than throwing when no regime has that id: an id that
// matches nothing is an ordinary miss - a typo, or a regime from a database
// that has since been reset - not a failure worth showing as an error.
export async function getRegimeById(id: string): Promise<Regime | null> {
  const res = await fetch(`${API_URL}/api/regimes/${encodeURIComponent(id)}`);

  if (res.status === 404) {
    return null;
  }

  return readOrThrow(res);
}

// Replaces the exercises of a saved regime and returns it as it now stands.
//
// Throws on a 404, unlike `getRegimeById`: looking up an id that matches
// nothing is an ordinary miss, but saving into one means the regime went away
// while it was being edited, and that is worth putting in front of the user.
export async function updateRegime(id: string, regime: RegimeEdit[]): Promise<Regime> {
  const res = await fetch(`${API_URL}/api/regimes/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ regime }),
  });

  return readOrThrow(res);
}

// Deletes a saved regime. The server answers 204 with no body, so there is
// nothing to hand back and `readOrThrow` does not fit.
//
// Throws on a 404 for the same reason `updateRegime` does: the id came from a
// regime that is on screen, so nothing to delete means it went away underneath
// the user rather than that they mistyped it.
export async function deleteRegime(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/regimes/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

  if (res.ok) {
    return;
  }

  // The success case has no body, but a failure does. Still guarded: a dead
  // server or a proxy in the way answers with HTML, and that must not surface
  // as a parse error instead of the status.
  const data = await res.json().catch(() => null);

  throw new Error(data?.error ?? `Request failed: ${res.status}`);
}
