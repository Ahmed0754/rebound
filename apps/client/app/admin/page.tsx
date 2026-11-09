"use client";

//The admin page: testing tools for the admin's own plans. Edit a plan's pain
//graph, then see what the real adjustment rules make of it, and run the judge.
//Showing this page is only a convenience: the server checks every admin call.

import { useEffect, useState } from "react";
import Link from "next/link";
import { PainHistory, today } from "@/components/pain-tracker";
import { PlanAdjustment } from "@/components/plan-adjustment";
import { AccountError, ErrorMessage, Loading } from "@/components/ui";
import { listCheckIns, listRegimes, messageOf, replaceCheckIns, type Regime } from "@/lib/api";
import { useRequiredUser } from "@/lib/current-user";
import { regionLabel } from "@/lib/questionnaire";

type Row = { day: string; pain: number; didExercises: boolean };

const PAIN_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

//Pain oldest first, ending today, one check-in a day. `done` is false when the
//exercises were skipped on every one of them.
const PRESETS: { label: string; pains: number[]; done?: boolean }[] = [
  { label: "Improving", pains: [7, 6, 6, 4, 3, 3, 3] },
  { label: "Improving, skipped sessions", pains: [7, 6, 6, 4, 3, 3, 3], done: false },
  { label: "Worsening", pains: [2, 2, 3, 2, 5, 5, 5] },
  { label: "Steady", pains: [4, 5, 4, 5, 4, 5, 4] },
  { label: "Sudden spike", pains: [3, 3, 3, 3, 4, 4, 9] },
  { label: "High and steady", pains: [8, 8, 8, 8, 8, 8, 8] },
  { label: "Too few", pains: [4, 4, 4] },
];

function presetRows(pains: number[], done = true): Row[] {
  return pains.map((pain, i) => ({ day: today(i - pains.length + 1), pain, didExercises: done }));
}

//The most recent day that doesn't have a row yet.
function nextFreeDay(rows: Row[]): string {
  const used = new Set(rows.map((row) => row.day));
  let offset = 0;

  while (used.has(today(offset))) offset -= 1;

  return today(offset);
}

const byDay = (a: Row, b: Row) => a.day.localeCompare(b.day);

export default function AdminPage() {
  const { user, token, error: accountError } = useRequiredUser();
  const [plans, setPlans] = useState<Regime[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.isAdmin === true;

  useEffect(() => {
    if (!isAdmin || !token) return;

    let cancelled = false;

    listRegimes(token)
      .then((list) => {
        if (cancelled) return;
        setPlans(list);
        setSelectedId(list[0]?.id ?? null);
      })
      .catch((e) => {
        if (!cancelled) setError(messageOf(e));
      });

    return () => {
      cancelled = true;
    };
  }, [isAdmin, token]);

  if (accountError) {
    return (
      <main className="page">
        <AccountError message={accountError} />
      </main>
    );
  }

  if (!user || !token) {
    return (
      <main className="page">
        <Loading />
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="page">
        <h1>Not available</h1>
        <p className="lead">This page is for admins.</p>
      </main>
    );
  }

  const plan = plans?.find((p) => p.id === selectedId) ?? null;

  return (
    <main className="page page-app">
      <h1>Admin</h1>
      <p className="lead">Test the judge and the weekly adjustment on your own plans.</p>

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {!error && plans === null && <Loading />}

      {plans !== null && plans.length === 0 && (
        <section className="card">
          <p style={{ marginTop: 0 }}>This account has no plans yet.</p>
          <Link className="btn btn-primary" href="/onboarding">
            Make one
          </Link>
        </section>
      )}

      {plans !== null && plans.length > 0 && (
        <section className="card">
          <label htmlFor="admin-plan">
            <strong>Plan</strong>
          </label>
          <select
            id="admin-plan"
            className="input"
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {regionLabel(p.muscle)}: {p.regime.length} exercises, made{" "}
                {new Date(p.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
              </option>
            ))}
          </select>
        </section>
      )}

      {plan && (
        //Keyed, so switching plans starts from that plan's own check-ins.
        <PlanTools
          key={plan.id}
          token={token}
          plan={plan}
          onChanged={(updated) =>
            setPlans((current) => current?.map((p) => (p.id === updated.id ? updated : p)) ?? current)
          }
        />
      )}
    </main>
  );
}

function PlanTools({
  token,
  plan,
  onChanged,
}: {
  token: string;
  plan: Regime;
  onChanged: (plan: Regime) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  //Bumped after each save, so the suggestion below follows the graph.
  const [saves, setSaves] = useState(0);

  useEffect(() => {
    let cancelled = false;

    listCheckIns(token, plan.id)
      .then((list) => {
        if (!cancelled) setRows(list.map(({ day, pain, didExercises }) => ({ day, pain, didExercises })));
      })
      .catch((e) => {
        if (!cancelled) setLoadError(messageOf(e));
      });

    return () => {
      cancelled = true;
    };
  }, [token, plan.id]);

  function edit(next: Row[]) {
    setRows(next);
    setDirty(true);
    setError(null);
  }

  function setRow(index: number, change: Partial<Row>) {
    if (rows) edit(rows.map((row, i) => (i === index ? { ...row, ...change } : row)));
  }

  async function save() {
    if (!rows) return;

    setBusy(true);
    setError(null);

    try {
      const saved = await replaceCheckIns(token, plan.id, [...rows].sort(byDay));

      setRows(saved.map(({ day, pain, didExercises }) => ({ day, pain, didExercises })));
      setDirty(false);
      setSaves((n) => n + 1);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>The judge</h2>
          <div className="row">
            <Link className="btn btn-small btn-pill" href={`/plans/${plan.id}`}>
              Open the plan
            </Link>
            <Link className="btn btn-small btn-pill" href={`/plans/${plan.id}/evaluation`}>
              Run the judge
            </Link>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Pain graph</h2>
        <p className="muted small">
          Saving replaces this plan&apos;s check-ins with this list, and every one counts as newly saved. To simulate
          the next week after applying a change, load or edit the days and save again.
        </p>

        {loadError && <ErrorMessage>{loadError}</ErrorMessage>}
        {!loadError && rows === null && <Loading />}

        {rows !== null && (
          <>
            <div className="row admin-presets">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className="btn btn-small btn-pill"
                  onClick={() => edit(presetRows(preset.pains, preset.done))}
                  disabled={busy}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <ul className="admin-checkins plain-list">
              {rows.map((row, i) => (
                <li key={i} className="row">
                  <input
                    className="input"
                    type="date"
                    aria-label="Day"
                    value={row.day}
                    onChange={(e) => setRow(i, { day: e.target.value })}
                    disabled={busy}
                  />
                  <select
                    className="input"
                    aria-label={`Pain on ${row.day}`}
                    value={row.pain}
                    onChange={(e) => setRow(i, { pain: Number(e.target.value) })}
                    disabled={busy}
                  >
                    {PAIN_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        Pain {level}
                      </option>
                    ))}
                  </select>
                  <label className="row small">
                    <input
                      type="checkbox"
                      checked={row.didExercises}
                      onChange={(e) => setRow(i, { didExercises: e.target.checked })}
                      disabled={busy}
                    />
                    Did exercises
                  </label>
                  <button
                    type="button"
                    className="btn btn-small btn-pill"
                    onClick={() => edit(rows.filter((_, j) => j !== i))}
                    disabled={busy}
                    aria-label={`Remove ${row.day}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>

            <div className="row" style={{ marginBottom: 16 }}>
              <button
                type="button"
                className="btn btn-small btn-pill"
                onClick={() => edit([...rows, { day: nextFreeDay(rows), pain: 4, didExercises: true }])}
                disabled={busy}
              >
                Add a day
              </button>
              <button
                type="button"
                className="btn btn-small btn-pill"
                onClick={() => edit([])}
                disabled={busy || rows.length === 0}
              >
                Clear all
              </button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !dirty}>
                {busy ? "Saving…" : dirty ? "Save the graph" : "Saved"}
              </button>
            </div>

            {error && <ErrorMessage>{error}</ErrorMessage>}

            {/* Follows the edits before they are saved. A blank date has no place on it. */}
            <PainHistory checkIns={rows.filter((row) => row.day !== "").sort(byDay)} />
          </>
        )}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Current doses</h2>
        <ul className="change-list">
          {plan.regime.map((ex) => (
            <li key={ex.id}>
              <span>{ex.name}</span>
              <span>
                {ex.sets} × {ex.unit === "hold" ? `${ex.holdSeconds}s hold` : `${ex.reps} reps`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* The same card customers get, so this tests the real thing. */}
      <PlanAdjustment token={token} plan={plan} checkInsSaved={saves} onApplied={onChanged} />
    </>
  );
}
