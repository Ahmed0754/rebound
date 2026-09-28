"use client";

//this is my VIEW + client-side CONTROLLER for the home page
//it renders the form, holds UI state, calls the API, and shows the regime or an error.

import { useEffect, useState } from "react";
import { createRegime, getRegimeById, type Exercise } from "@/lib/api";

//Ids generated in this browser, newest first, so a past regime can be pulled
//back up without hitting "Show last saved" over and over. Session-local: no
//accounts yet, so there is nowhere server-side to keep this per person.
const HISTORY_KEY = "rebound.regimeHistory";
const HISTORY_LIMIT = 10;

type HistoryEntry = { id: string; muscle: string };

export default function Home() {
  const [muscle, setMuscle] = useState("");
  const [regime, setRegime] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  //Which regime is on screen: the id the server saved it under, and whether it
  //was just generated or fetched back. Both are only for the line above the list.
  const [regimeId, setRegimeId] = useState<string | null>(null);
  const [source, setSource] = useState<"new" | "saved" | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      // Corrupt or inaccessible storage is not worth surfacing - just start empty.
    }
  }, []);

  function remember(entry: HistoryEntry) {
    setHistory((prev) => {
      const next = [entry, ...prev.filter((h) => h.id !== entry.id)].slice(0, HISTORY_LIMIT);
      try {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        // Private browsing or a full quota: history just won't persist.
      }
      return next;
    });
  }

  //This is the important function
  //Controller: validates the input, POSTs to the server /regime route,
  //then pushes the result into state for the view to render
  async function submit() {
    if (!muscle.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const saved = await createRegime(muscle);
      setRegime(saved.regime);
      setRegimeId(saved.id);
      setSource("new");
      remember({ id: saved.id, muscle: saved.muscle });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRegime([]);
      setRegimeId(null);
      setSource(null);
    } finally {
      setLoading(false);
    }
  }

  //Controller: GETs one specific past regime by id and shows it. This is what
  //makes `history` more than a list of ids - it is the round-trip back.
  async function loadFromHistory(entry: HistoryEntry) {
    setLoading(true);
    setError(null);

    try {
      const found = await getRegimeById(entry.id);

      if (found === null) {
        setError("That regime is no longer in the database.");
        return;
      }

      setMuscle(found.muscle);
      setRegime(found.regime);
      setRegimeId(found.id);
      setSource("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <button
          onClick={submit}
          disabled={loading}
          style={{
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
      </div>

      {history.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {history.map((entry) => (
            <button
              key={entry.id}
              onClick={() => loadFromHistory(entry)}
              disabled={loading}
              title={entry.id}
              style={{
                padding: "6px 12px",
                border: "1px solid #ccc",
                borderRadius: 999,
                background: regimeId === entry.id ? "#eee" : "#fff",
                color: loading ? "#999" : "#333",
                fontSize: 13,
                cursor: loading ? "default" : "pointer",
              }}
            >
              {entry.muscle}
            </button>
          ))}
        </div>
      )}

      {error && <p style={{ color: "#b00020", marginTop: 16 }}>{error}</p>}

      {regimeId && (
        <p style={{ marginTop: 20, marginBottom: 0, color: "#555", fontSize: 13 }}>
          {source === "saved" ? "Loaded from the database" : "Saved"} &middot;{" "}
          <code style={{ fontSize: 12 }}>{regimeId}</code>
        </p>
      )}

      <ul style={{ listStyle: "none", padding: 0, marginTop: 16 }}>
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
