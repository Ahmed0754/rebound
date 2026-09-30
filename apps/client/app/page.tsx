"use client";

//this is my VIEW + client-side CONTROLLER for the home page
//it renders the form, holds UI state, calls the API, and shows the regime or an error.

import { useState } from "react";
import { createRegime, getRegimeById, updateRegime, type Exercise } from "@/lib/api";

export default function Home() {
  const [muscle, setMuscle] = useState("");
  const [regime, setRegime] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  //When the regime on screen was last written. Equal to the created time until
  //an edit is saved, so it is the visible proof the PUT went through.
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  //Which regime is on screen: the id the server saved it under, and whether it
  //was just generated or fetched back. Both are only for the line above the list.
  const [regimeId, setRegimeId] = useState<string | null>(null);
  const [source, setSource] = useState<"new" | "saved" | null>(null);
  //Stand-in for accounts: until a regime belongs to a signed-in user, this is
  //how someone gets back to one - paste the id you were given and look it up
  //directly.
  const [lookupId, setLookupId] = useState("");
  //Edit mode. `doses` is the draft: the only thing this editor can change is
  //how many sets and reps of each exercise, so it holds nothing else.
  //
  //Held as strings, not numbers, so clearing a box leaves it empty instead of
  //snapping to 0 and fighting the next keystroke. They become numbers on save.
  //
  //Index-aligned with `regime`, which is safe only because nothing here adds,
  //removes or reorders an exercise. Key it by exercise id if that ever changes.
  const [editing, setEditing] = useState(false);
  const [doses, setDoses] = useState<{ sets: string; reps: string }[]>([]);

  //This is the important function
  //Controller: validates the input, POSTs to the server /api/regimes route,
  //then pushes the result into state for the view to render
  async function submit() {
    if (!muscle.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const saved = await createRegime(muscle);
      setRegime(saved.regime);
      setRegimeId(saved.id);
      setUpdatedAt(saved.updatedAt);
      setSource("new");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRegime([]);
      setRegimeId(null);
      setUpdatedAt(null);
      setSource(null);
    } finally {
      setLoading(false);
    }
  }

  //Controller: GETs one specific regime by id and shows it.
  async function loadById(id: string) {
    setLoading(true);
    setError(null);

    try {
      const found = await getRegimeById(id);

      if (found === null) {
        setError("No regime with that id.");
        return;
      }

      setMuscle(found.muscle);
      setRegime(found.regime);
      setRegimeId(found.id);
      setUpdatedAt(found.updatedAt);
      setSource("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function lookup() {
    const id = lookupId.trim();
    if (!id) return;
    loadById(id);
  }

  //Controller: opens the editor on a copy of the current doses. `regime` is
  //left alone until the server confirms the change, so a save that fails
  //cannot leave the screen showing a plan the database does not have.
  function startEdit() {
    setDoses(regime.map((ex) => ({ sets: String(ex.sets), reps: String(ex.reps) })));
    setError(null);
    setEditing(true);
  }

  //Throwing the draft away is the whole of cancelling; nothing else was touched.
  function cancelEdit() {
    setEditing(false);
    setError(null);
  }

  function setDose(index: number, field: "sets" | "reps", value: string) {
    setDoses((current) =>
      current.map((dose, i) => (i === index ? { ...dose, [field]: value } : dose))
    );
  }

  //Controller: PUTs the edited doses and swaps in whatever the server says the
  //regime now is.
  //
  //Nothing is checked here first, on purpose. The server already rejects a
  //dose that is not a whole number in range, and its message is better than
  //anything this page would invent - validating twice would only hide it.
  async function save() {
    if (!regimeId) return;

    setLoading(true);
    setError(null);

    try {
      //Only the id and the two numbers are sent. The exercise text is the
      //record of what this app told the user, so the server owns it.
      const updated = await updateRegime(
        regimeId,
        regime.map((ex, i) => ({
          id: ex.id,
          sets: Number(doses[i].sets),
          reps: Number(doses[i].reps),
        }))
      );

      setRegime(updated.regime);
      setUpdatedAt(updated.updatedAt);
      setSource("saved");
      setEditing(false);
    } catch (e) {
      //Stay in edit mode so the rejected numbers are still on screen to fix.
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
        {/* Locked during an edit: generating a new regime would throw away
            the draft without the user having asked for that. */}
        <button
          onClick={submit}
          disabled={loading || editing}
          style={{
            padding: "10px 18px",
            border: "1px solid #111",
            borderRadius: 8,
            background: loading || editing ? "#eee" : "#111",
            color: loading || editing ? "#666" : "#fff",
            fontSize: 15,
            cursor: loading || editing ? "default" : "pointer",
          }}
        >
          {loading ? "Loading..." : "Get exercises"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <input
          value={lookupId}
          onChange={(e) => setLookupId(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") lookup();
          }}
          placeholder="Look up a regime by id"
          style={{
            flex: 1,
            minWidth: 200,
            padding: "8px 10px",
            boxSizing: "border-box",
            border: "1px solid #ccc",
            borderRadius: 8,
            fontSize: 14,
          }}
        />

        <button
          onClick={lookup}
          disabled={loading || editing}
          style={{
            padding: "8px 16px",
            border: "1px solid #111",
            borderRadius: 8,
            background: "#fff",
            color: loading || editing ? "#999" : "#111",
            fontSize: 14,
            cursor: loading || editing ? "default" : "pointer",
          }}
        >
          Find
        </button>
      </div>

      {error && <p style={{ color: "#b00020", marginTop: 16 }}>{error}</p>}

      {regimeId && (
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            flexWrap: "wrap",
            marginTop: 20,
          }}
        >
          <p style={{ margin: 0, color: "#555", fontSize: 13 }}>
            {source === "saved" ? "Loaded from the database" : "Saved"} &middot;{" "}
            <code style={{ fontSize: 12 }}>{regimeId}</code>
            {updatedAt && (
              <>
                {" "}
                &middot; last written {new Date(updatedAt).toLocaleTimeString()}
              </>
            )}
          </p>

          {/* Only reachable with a regime on screen, since the whole line is. */}
          {!editing && (
            <button
              onClick={startEdit}
              disabled={loading}
              style={{
                padding: "4px 12px",
                border: "1px solid #bbb",
                borderRadius: 8,
                background: "#fff",
                color: loading ? "#999" : "#111",
                fontSize: 13,
                cursor: loading ? "default" : "pointer",
              }}
            >
              Edit sets &amp; reps
            </button>
          )}
        </div>
      )}

      <ul style={{ listStyle: "none", padding: 0, marginTop: 16 }}>
        {regime.map((ex, i) => (
          <li
            key={ex.id}
            style={{
              border: editing ? "1px solid #111" : "1px solid #e5e5e5",
              background: "#fff",
              borderRadius: 10,
              padding: 16,
              marginBottom: 12,
            }}
          >
            {/* The name and description stay plain text in edit mode, because
                they are not the client's to change - the server fills them in
                from what it already has stored. */}
            <strong style={{ fontSize: 16 }}>{ex.name}</strong>
            <p style={{ margin: "8px 0", lineHeight: 1.5 }}>{ex.description}</p>

            {editing ? (
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                {(["sets", "reps"] as const).map((field) => (
                  <label
                    key={field}
                    style={{ display: "flex", gap: 6, alignItems: "center", color: "#555" }}
                  >
                    <input
                      type="number"
                      min={1}
                      value={doses[i]?.[field] ?? ""}
                      onChange={(e) => setDose(i, field, e.target.value)}
                      disabled={loading}
                      style={{
                        width: 64,
                        padding: "6px 8px",
                        border: "1px solid #ccc",
                        borderRadius: 6,
                        fontSize: 15,
                      }}
                    />
                    {field}
                  </label>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, color: "#555" }}>
                {ex.sets} sets &times; {ex.reps} reps
              </p>
            )}
          </li>
        ))}
      </ul>

      {editing && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={save}
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
            {loading ? "Saving..." : "Save changes"}
          </button>

          <button
            onClick={cancelEdit}
            disabled={loading}
            style={{
              padding: "10px 18px",
              border: "1px solid #bbb",
              borderRadius: 8,
              background: "#fff",
              color: loading ? "#999" : "#111",
              fontSize: 15,
              cursor: loading ? "default" : "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </main>
  );
}
