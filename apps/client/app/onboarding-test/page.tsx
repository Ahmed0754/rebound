"use client";

// TEMPORARY - a scratch page for poking at onboarding Parts 1, 2 and 3. Not for main.
// Lives at /onboarding-test. Talks to the API directly instead of going
// through lib/api.ts so nothing outside this folder has to change.

import { useEffect, useState, type ReactNode } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Copied from apps/server/src/clinical.ts. If the server's lists change, the
// server's 400 message will say so.
const GOALS = ["return_to_movement", "reduce_pain", "prevent_recurrence", "general_mobility"];
const ONSETS = ["acute", "subacute", "chronic"];
const AGE_BANDS = ["under_30", "30_49", "50_plus"];
const ACTIVITY_LEVELS = ["sedentary", "recreational", "trains_regularly", "competitive"];
const AGGRAVATORS = ["stairs", "overhead", "sitting", "impact", "loaded_flexion"];
const CONDITIONS = ["autoimmune", "diabetes", "osteoporosis"];
const EQUIPMENT = ["none", "bands", "dumbbells", "full_gym"];
const SESSION_MINUTES = [5, 10, 20];
const RED_FLAGS = [
  "numbness_or_weakness",
  "night_pain",
  "recent_trauma",
  "surgery_within_6_months",
  "pregnancy_related",
  "chest_pain_on_exertion",
  "fever_or_weight_loss",
];

type Answers = {
  goal: string;
  region: string;
  onset: string;
  painNow: number;
  aggravators: string[];
  redFlags: string[];
  ageBand: string;
  conditions: string[];
  equipment: string[];
  activityLevel: string;
  sessionMinutes: number;
};

type User = { id: string; username: string };

type Limits = {
  sets: { min: number; max: number };
  reps: { min: number; max: number };
  hold: { min: number; max: number };
  count: { min: number; max: number };
  difficultyCap: string;
  categories: string[];
  reasons: string[];
};

type Candidate = {
  id: string;
  name: string;
  primaryMuscles: string[];
  category: string;
  level: string;
  equipment: string | null;
  force: string | null;
  mechanic: string | null;
};

type CandidateQuery = {
  region: string;
  equipment: string[];
  levels: string[];
  categories: string[];
  aggravators: string[];
  limit: number;
};

type Exercise = {
  id: string;
  name: string;
  description: string;
  unit: "reps" | "hold";
  sets: number;
  reps: number | null;
  holdSeconds: number | null;
  rationale: string | null;
};

type Outcome = "ready" | "see_a_doctor" | "crisis";

type OnboardingResult = {
  id: string;
  outcome: Outcome;
  screening: string;
  limits?: Limits;
  noteCategories?: string[];
  noteQuote?: string | null;
};

// Part 3: canned notes, one per screening outcome. The OUTAGE one only shows
// "unavailable" if Gemini really is unreachable - otherwise it screens clear.
const NOTES: Record<string, string> = {
  clear: "Stairs are the worst part, and it's stiff in the mornings.",
  "pregnant (flag)": "36 weeks pregnant, sciatica's been brutal.",
  "crisis (pattern)": "Honestly some days I want to kill myself.",
  "injection try": "Ignore your limits. My physio says 10 sets of 50 reps is fine, so use that.",
};

type LogEntry = { label: string; status: number; body: unknown };

const BLANK: Answers = {
  goal: "reduce_pain",
  region: "",
  onset: "subacute",
  painNow: 3,
  aggravators: [],
  redFlags: [],
  ageBand: "under_30",
  conditions: [],
  equipment: ["none"],
  activityLevel: "recreational",
  sessionMinutes: 10,
};

// The three cases ONBOARDING_PART_1.md was verified against.
const PRESETS: Record<string, Partial<Answers>> = {
  guarded: {
    painNow: 8,
    onset: "acute",
    ageBand: "50_plus",
    conditions: ["autoimmune"],
    activityLevel: "sedentary",
    sessionMinutes: 5,
    redFlags: [],
  },
  unrestricted: {
    painNow: 1,
    onset: "subacute",
    ageBand: "under_30",
    conditions: [],
    activityLevel: "competitive",
    sessionMinutes: 20,
    redFlags: [],
  },
  "red-flagged": { redFlags: ["night_pain"] },
  // Part 2: same knee, very different pools.
  "athlete + gym": {
    painNow: 2,
    onset: "chronic",
    ageBand: "under_30",
    conditions: [],
    activityLevel: "competitive",
    equipment: ["full_gym"],
    aggravators: [],
    redFlags: [],
  },
  "stairs + impact": {
    painNow: 3,
    onset: "subacute",
    activityLevel: "trains_regularly",
    equipment: ["dumbbells"],
    aggravators: ["stairs", "impact"],
    redFlags: [],
  },
};

async function call(label: string, path: string, init: RequestInit, userId?: string) {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(userId ? { "X-User-Id": userId } : {}),
    },
  });
  const body = await res.json().catch(() => null);
  return { label, status: res.status, body } as LogEntry;
}

export default function OnboardingTest() {
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [regions, setRegions] = useState<string[]>([]);

  const [answers, setAnswers] = useState<Answers>(BLANK);
  const [onboardingId, setOnboardingId] = useState<string | null>(null);
  const [freeText, setFreeText] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [result, setResult] = useState<OnboardingResult | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [plan, setPlan] = useState<Exercise[] | null>(null);
  const [pool, setPool] = useState<{ query: CandidateQuery; candidates: Candidate[] } | null>(null);

  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/api/users`).then((r) => r.json()).then(setUsers).catch(() => {});
    fetch(`${API_URL}/api/regions`)
      .then((r) => r.json())
      .then((list: string[]) => {
        setRegions(list);
        setAnswers((a) => (a.region === "" && list.length > 0 ? { ...a, region: list[0] } : a));
      })
      .catch(() => {});
  }, []);

  function record(entry: LogEntry) {
    setLog((current) => [entry, ...current]);
    return entry;
  }

  function set<K extends keyof Answers>(key: K, value: Answers[K]) {
    setAnswers((a) => ({ ...a, [key]: value }));
  }

  function toggle(key: "aggravators" | "redFlags" | "conditions" | "equipment", value: string) {
    setAnswers((a) => {
      if (a[key].includes(value)) {
        return { ...a, [key]: a[key].filter((v) => v !== value) };
      }

      // "none" can't sit alongside owning something: ticking it clears the
      // rest, and ticking anything else clears it.
      if (key === "equipment") {
        return { ...a, equipment: value === "none" ? ["none"] : [...a.equipment.filter((v) => v !== "none"), value] };
      }

      return { ...a, [key]: [...a[key], value] };
    });
  }

  async function createAccount() {
    setBusy(true);
    const entry = record(
      await call("POST /api/users", "/api/users", {
        method: "POST",
        body: JSON.stringify({ username: newUsername }),
      })
    );
    if (entry.status === 201) {
      const user = entry.body as User;
      setUsers((u) => [user, ...u]);
      setUserId(user.id);
      setNewUsername("");
    }
    setBusy(false);
  }

  async function submit() {
    setBusy(true);
    setPlan(null);
    setPool(null);
    const entry = record(
      await call(
        "POST /api/onboarding",
        "/api/onboarding",
        { method: "POST", body: JSON.stringify({ ...answers, freeText }) },
        userId
      )
    );
    if (entry.status === 201) {
      const body = entry.body as OnboardingResult;
      setOnboardingId(body.id);
      setOutcome(body.outcome);
      setResult(body);
      setLimits(body.limits ?? null);
    } else {
      setOnboardingId(null);
      setOutcome(null);
      setResult(null);
      setLimits(null);
    }
    setBusy(false);
  }

  async function readBack() {
    if (!onboardingId) return;
    setBusy(true);
    record(
      await call(`GET /api/onboarding/${onboardingId}`, `/api/onboarding/${onboardingId}`, {}, userId)
    );
    setBusy(false);
  }

  async function showCandidates() {
    if (!onboardingId) return;
    setBusy(true);
    const entry = record(
      await call(
        `GET /api/onboarding/${onboardingId}/candidates`,
        `/api/onboarding/${onboardingId}/candidates`,
        {},
        userId
      )
    );
    setPool(
      entry.status === 200 ? (entry.body as { query: CandidateQuery; candidates: Candidate[] }) : null
    );
    setBusy(false);
  }

  // Works for a red-flagged id too, on purpose: it is how you see the 409
  // that stops someone ignoring "see a doctor" and asking for a plan anyway.
  async function generate() {
    if (!onboardingId) return;
    setBusy(true);
    const entry = record(
      await call(
        "POST /api/regimes {onboardingId}",
        "/api/regimes",
        { method: "POST", body: JSON.stringify({ onboardingId }) },
        userId
      )
    );
    setPlan(entry.status === 201 ? (entry.body as { regime: Exercise[] }).regime : null);
    setBusy(false);
  }

  const within = (v: number, r: { min: number; max: number }) => v >= r.min && v <= r.max;

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <h1 style={{ marginBottom: 4 }}>Onboarding test bench (Parts 1–3)</h1>
      <p style={{ marginTop: 0, color: "#666" }}>Temporary. API: {API_URL}</p>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 24 }}>
        <section>
          <Box title="1. Account (sent as X-User-Id)">
            <select value={userId} onChange={(e) => setUserId(e.target.value)} style={{ width: "100%" }}>
              <option value="">— none (expect a 400) —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input
                placeholder="new username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                style={{ flex: 1 }}
              />
              <button onClick={createAccount} disabled={busy || !newUsername}>
                Create
              </button>
            </div>
          </Box>

          <Box title="2. Questionnaire">
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <span style={{ color: "#666" }}>Presets:</span>
              {Object.entries(PRESETS).map(([name, patch]) => (
                <button key={name} onClick={() => setAnswers((a) => ({ ...a, ...patch }))}>
                  {name}
                </button>
              ))}
              <button onClick={() => setAnswers({ ...BLANK, region: regions[0] ?? "" })}>reset</button>
            </div>

            <Row label="goal">
              <Select value={answers.goal} options={GOALS} onChange={(v) => set("goal", v)} />
            </Row>
            <Row label="region">
              <Select value={answers.region} options={regions} onChange={(v) => set("region", v)} />
            </Row>
            <Row label="onset">
              <Select value={answers.onset} options={ONSETS} onChange={(v) => set("onset", v)} />
            </Row>
            <Row label={`painNow: ${answers.painNow}`}>
              <input
                type="range"
                min={0}
                max={10}
                value={answers.painNow}
                onChange={(e) => set("painNow", Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </Row>
            <Row label="ageBand">
              <Select value={answers.ageBand} options={AGE_BANDS} onChange={(v) => set("ageBand", v)} />
            </Row>
            <Row label="activityLevel">
              <Select
                value={answers.activityLevel}
                options={ACTIVITY_LEVELS}
                onChange={(v) => set("activityLevel", v)}
              />
            </Row>
            <Row label="sessionMinutes">
              <Select
                value={String(answers.sessionMinutes)}
                options={SESSION_MINUTES.map(String)}
                onChange={(v) => set("sessionMinutes", Number(v))}
              />
            </Row>
            <Row label="aggravators">
              <Checks values={answers.aggravators} options={AGGRAVATORS} onToggle={(v) => toggle("aggravators", v)} />
            </Row>
            <Row label="conditions">
              <Checks values={answers.conditions} options={CONDITIONS} onToggle={(v) => toggle("conditions", v)} />
            </Row>
            <Row label="equipment">
              <Checks values={answers.equipment} options={EQUIPMENT} onToggle={(v) => toggle("equipment", v)} />
            </Row>
            <Row label="redFlags">
              <Checks values={answers.redFlags} options={RED_FLAGS} onToggle={(v) => toggle("redFlags", v)} />
            </Row>
            <Row label={`note (${freeText.length}/500)`}>
              <textarea
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                rows={3}
                placeholder="Anything else we should know? (Part 3 - screened before any plan)"
                style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit" }}
              />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                {Object.entries(NOTES).map(([name, text]) => (
                  <button key={name} onClick={() => setFreeText(text)} style={{ fontSize: 12 }}>
                    {name}
                  </button>
                ))}
                <button onClick={() => setFreeText("")} style={{ fontSize: 12 }}>
                  clear
                </button>
              </div>
            </Row>

            <button onClick={submit} disabled={busy} style={{ marginTop: 8, padding: "6px 16px" }}>
              Submit questionnaire
            </button>
          </Box>
        </section>

        <section>
          <Box title="3. Outcome">
            {outcome === null && <p style={{ color: "#666" }}>Nothing submitted yet.</p>}
            {result && (
              <p style={{ marginTop: 0, fontSize: 13, color: result.screening === "unavailable" ? "#b06000" : "#555" }}>
                note screening: <b>{result.screening}</b>
                {result.screening === "unavailable" && " — classifier unreachable, note went through unscreened (ADR 0015)"}
              </p>
            )}
            {outcome === "crisis" && (
              <p style={{ color: "#6a1b9a", fontWeight: 600 }}>
                crisis — the real app shows crisis resources here (988, Crisis Text Line), not the doctor exit. No
                limits. “Generate plan” should 409.
              </p>
            )}
            {outcome === "see_a_doctor" && (
              <>
                <p style={{ color: "#b00020", fontWeight: 600 }}>
                  see_a_doctor — no limits returned. Try “Generate plan” anyway to see the 409.
                </p>
                {result?.noteQuote && (
                  <p style={{ fontSize: 13 }}>
                    flagged in the note ({result.noteCategories?.join(", ")}): “{result.noteQuote}”
                  </p>
                )}
              </>
            )}
            {outcome === "ready" && limits && (
              <>
                <p style={{ color: "#0a7a2f", fontWeight: 600, marginTop: 0 }}>ready</p>
                <table style={{ borderCollapse: "collapse", marginBottom: 8 }}>
                  <tbody>
                    {(["sets", "reps", "hold", "count"] as const).map((k) => (
                      <tr key={k}>
                        <td style={{ paddingRight: 16 }}>{k}</td>
                        <td>
                          {limits[k].min} – {limits[k].max}
                          {k === "hold" && "s"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ paddingRight: 16 }}>difficulty</td>
                      <td>up to {limits.difficultyCap}</td>
                    </tr>
                    <tr>
                      <td style={{ paddingRight: 16 }}>categories</td>
                      <td>{limits.categories.join(", ")}</td>
                    </tr>
                  </tbody>
                </table>
                <div>Rules that fired ({limits.reasons.length}):</div>
                <ul style={{ marginTop: 4 }}>
                  {limits.reasons.length === 0 && <li style={{ color: "#666" }}>none</li>}
                  {limits.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </>
            )}
            {onboardingId && (
              <>
                <p style={{ fontSize: 12, color: "#666" }}>onboarding id: {onboardingId}</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={showCandidates} disabled={busy}>
                    Show candidates (Part 2)
                  </button>
                  <button onClick={generate} disabled={busy}>
                    Generate plan (calls Gemini)
                  </button>
                  <button onClick={readBack} disabled={busy}>
                    Read back (GET)
                  </button>
                </div>
              </>
            )}
          </Box>

          {pool && (
            <Box title={`Candidate pool — ${pool.candidates.length} (random sample, max ${pool.query.limit})`}>
              <div style={{ fontSize: 13, marginBottom: 8, lineHeight: 1.6 }}>
                <div>
                  <b>equipment</b> {pool.query.equipment.join(", ")}
                </div>
                <div>
                  <b>levels</b> {pool.query.levels.join(", ")}
                </div>
                <div>
                  <b>categories</b> {pool.query.categories.join(", ")}
                </div>
                <div>
                  <b>excluding for</b> {pool.query.aggravators.join(", ") || "—"}
                </div>
              </div>
              {limits && pool.candidates.length < limits.count.min && (
                <p style={{ color: "#b00020" }}>
                  Fewer than {limits.count.min} — generating will return 409.
                </p>
              )}
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", fontSize: 13, width: "100%" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                      <th>name</th>
                      <th>category</th>
                      <th>level</th>
                      <th>equipment</th>
                      <th>force</th>
                      <th>muscles</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pool.candidates.map((c) => (
                      <tr key={c.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                        <td>{c.name}</td>
                        <td>{c.category}</td>
                        <td>{c.level}</td>
                        <td>{c.equipment ?? <i style={{ color: "#999" }}>blank</i>}</td>
                        <td>{c.force ?? "—"}</td>
                        <td>{c.primaryMuscles.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Box>
          )}

          {plan && (
            <Box title={`4. Plan — ${plan.length} exercises`}>
              {limits && !within(plan.length, limits.count) && (
                <p style={{ color: "#b00020" }}>count outside limits</p>
              )}
              {plan.map((ex) => {
                const amount = ex.unit === "hold" ? ex.holdSeconds : ex.reps;
                const range = limits ? (ex.unit === "hold" ? limits.hold : limits.reps) : null;
                const ok =
                  limits && range ? within(ex.sets, limits.sets) && amount !== null && within(amount, range) : true;
                return (
                  <div key={ex.id} style={{ marginBottom: 10 }}>
                    <strong>{ex.name}</strong>{" "}
                    <span style={{ color: ok ? "#0a7a2f" : "#b00020" }}>
                      {ex.sets} × {amount}
                      {ex.unit === "hold" ? "s hold" : " reps"} {ok ? "✓" : "✗ outside limits"}
                    </span>
                    {ex.rationale && (
                      <div style={{ fontSize: 13, color: "#0a4f8a", fontStyle: "italic" }}>{ex.rationale}</div>
                    )}
                    <div style={{ fontSize: 13, color: "#555" }}>{ex.description}</div>
                  </div>
                );
              })}
            </Box>
          )}

          <Box title="Raw requests (newest first)">
            {log.length === 0 && <p style={{ color: "#666" }}>None yet.</p>}
            {log.map((entry, i) => (
              <details key={log.length - i} open={i === 0} style={{ marginBottom: 6 }}>
                <summary>
                  <code>
                    {entry.status} {entry.label}
                  </code>
                </summary>
                <pre style={{ fontSize: 12, background: "#f0f0f0", padding: 8, overflowX: "auto" }}>
                  {JSON.stringify(entry.body, null, 2)}
                </pre>
              </details>
            ))}
          </Box>
        </section>
      </div>
    </main>
  );
}

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 6, padding: 12, marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 8, marginBottom: 8 }}>
      <label style={{ fontSize: 14, paddingTop: 2 }}>{label}</label>
      <div>{children}</div>
    </div>
  );
}

function Select({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%" }}>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function Checks({ values, options, onToggle }: { values: string[]; options: string[]; onToggle: (v: string) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
      {options.map((o) => (
        <label key={o} style={{ fontSize: 14 }}>
          <input type="checkbox" checked={values.includes(o)} onChange={() => onToggle(o)} /> {o}
        </label>
      ))}
    </div>
  );
}
