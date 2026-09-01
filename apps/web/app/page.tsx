"use client";

import { useState } from "react";

type Exercise = {
  id: string;
  name: string;
  bodyRegion: string;
  description: string;
  sets: number;
  reps: number;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function Home() {
  const [muscle, setMuscle] = useState("");
  const [regime, setRegime] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!muscle.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/regime`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muscle }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? `Request failed: ${res.status}`);
      }

      setRegime(data.regime ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRegime([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 560, margin: "48px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 28, marginBottom: 24 }}>What muscle hurts?</h1>

      <input
        value={muscle}
        onChange={(e) => setMuscle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="e.g. knee"
        style={{
          padding: 10,
          width: "100%",
          boxSizing: "border-box",
          border: "1px solid #ccc",
          borderRadius: 8,
          fontSize: 16,
        }}
      />

      <button
        onClick={submit}
        disabled={loading}
        style={{
          marginTop: 12,
          padding: "10px 18px",
          border: "1px solid #111",
          borderRadius: 8,
          background: loading ? "#eee" : "#111",
          color: loading ? "#666" : "#fff",
          fontSize: 15,
          cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "Loading..." : "Get exercises"}
      </button>

      {error && <p style={{ color: "#b00020", marginTop: 16 }}>{error}</p>}

      <ul style={{ listStyle: "none", padding: 0, marginTop: 24 }}>
        {regime.map((ex) => (
          <li
            key={ex.id}
            style={{
              border: "1px solid #e5e5e5",
              background: "#fff",
              borderRadius: 10,
              padding: 16,
              marginBottom: 12,
            }}
          >
            <strong style={{ fontSize: 16 }}>{ex.name}</strong>
            <p style={{ margin: "8px 0", lineHeight: 1.5 }}>{ex.description}</p>
            <p style={{ margin: 0, color: "#555" }}>
              {ex.sets} sets &times; {ex.reps} reps
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
