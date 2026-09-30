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

// The server's error message is more useful than a bare status code, so
// surface it when there is one. Shared by the three calls below.
async function readOrThrow(res: Response): Promise<Regime> {
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed: ${res.status}`);
  }

  return data;
}

// Generates a regime and saves it. Named for what it does rather than the HTTP
// verb, so it cannot be confused with reading one back.
export async function createRegime(muscle: string): Promise<Regime> {
  const res = await fetch(`${API_URL}/api/regimes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ muscle }),
  });

  return readOrThrow(res);
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
