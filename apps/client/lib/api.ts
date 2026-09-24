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

// Pings the server; nothing to validate, so there is no failure branch here.
export async function getHealth(): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_URL}/health`);
  return res.json();
}

// Named for what it returns, not the HTTP verb - it POSTs because the muscle
// is a body, not a query string, but callers just want a regime back.
export async function getRegime(muscle: string): Promise<Exercise[]> {
  const res = await fetch(`${API_URL}/regime`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ muscle }),
  });

  const data = await res.json();

  // The server's error message is more useful than a bare status code, so
  // surface it when there is one.
  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed: ${res.status}`);
  }

  return data.regime ?? [];
}
