// The public-facing API calls this client makes: one named function per server endpoint.

// Falls back to the server's own default port so a fresh checkout works
// without an .env file.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type Exercise = {
  id: string;
  name: string;
  bodyRegion: string;
  description: string;
  sets: number;
  reps: number;
};

export type Regime = {
  id: string;
  muscle: string;
  regime: Exercise[];
};

// Pings the server; nothing to validate, so there is no failure branch here.
export async function getHealth(): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_URL}/health`);
  return res.json();
}

// The server's error message is more useful than a bare status code, so
// surface it when there is one. Shared by both calls below.
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
  const res = await fetch(`${API_URL}/regime`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ muscle }),
  });

  return readOrThrow(res);
}

// Reads back one regime by the id `createRegime` returned. Null when no regime
// has that id, for the same reason as below.
export async function getRegimeById(id: string): Promise<Regime | null> {
  const res = await fetch(`${API_URL}/regime/${encodeURIComponent(id)}`);

  if (res.status === 404) {
    return null;
  }

  return readOrThrow(res);
}

// Reads back the most recently saved regime. There is one global "latest"
// because there are no accounts yet.
//
// Returns null rather than throwing when nothing has been saved: an empty
// database is an ordinary state on a fresh checkout, not a failure worth
// showing as an error.
export async function getLatestRegime(): Promise<Regime | null> {
  const res = await fetch(`${API_URL}/regime/latest`);

  if (res.status === 404) {
    return null;
  }

  return readOrThrow(res);
}
