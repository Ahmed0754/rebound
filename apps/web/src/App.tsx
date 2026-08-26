import { useState } from "react";

type Exercise = {
  id: string;
  name: string;
  bodyRegion: string;
  description: string;
  sets: number;
  reps: number;
};

const API_URL = import.meta.env.VITE_API_URL;

function App() {
  const [muscle, setMuscle] = useState("");
  const [regime, setRegime] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!muscle.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/poc/regime`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muscle }),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = await res.json();
      setRegime(data.regime ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRegime([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 480, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>What muscle hurts?</h1>
      <input
        value={muscle}
        onChange={(e) => setMuscle(e.target.value)}
        placeholder="e.g. knee"
        style={{ padding: 8, width: "100%", boxSizing: "border-box" }}
      />
      <button onClick={submit} disabled={loading} style={{ marginTop: 12, padding: "8px 16px" }}>
        {loading ? "Loading..." : "Get exercises"}
      </button>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <ul style={{ listStyle: "none", padding: 0, marginTop: 20 }}>
        {regime.map((ex) => (
          <li key={ex.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 12, marginBottom: 10 }}>
            <strong>{ex.name}</strong>
            <p>{ex.description}</p>
            <p>{ex.sets} sets x {ex.reps} reps</p>
          </li>
        ))}
      </ul>
    </main>
  );
}

export default App;
