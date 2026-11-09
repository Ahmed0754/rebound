"use client";

// The pain tracker on a plan: a daily check-in (pain 0-10, and whether the
// exercises were done) and a graph of every check-in so far. It only records
// and shows; what the trend means for the plan is PlanAdjustment's job.

import { useEffect, useState } from "react";
import { Choices, ErrorMessage, Loading } from "@/components/ui";
import { listCheckIns, messageOf, saveCheckIn, type CheckIn } from "@/lib/api";

const PAIN_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// Today in the person's own timezone, "2026-11-02". Not toISOString(), which
// is UTC and is already tomorrow on an evening in the Americas.
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// "2 Nov". Read as UTC on both sides so the date never shifts.
function shortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function PainTracker({
  token,
  planId,
  onSaved,
}: {
  token: string;
  planId: string;
  onSaved?: () => void;
}) {
  const [checkIns, setCheckIns] = useState<CheckIn[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [pain, setPain] = useState<number | null>(null);
  const [did, setDid] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const day = today();

  useEffect(() => {
    let cancelled = false;

    listCheckIns(token, planId)
      .then((list) => {
        if (cancelled) return;
        setCheckIns(list);

        // Already checked in today: start from what was saved, to change it.
        const existing = list.find((checkIn) => checkIn.day === today());
        if (existing) {
          setPain(existing.pain);
          setDid(existing.didExercises);
        }
      })
      .catch((e) => {
        if (!cancelled) setLoadError(messageOf(e));
      });

    return () => {
      cancelled = true;
    };
  }, [token, planId]);

  async function save() {
    if (pain === null || did === null) return;

    setBusy(true);
    setError(null);
    setSaved(false);

    try {
      const checkIn = await saveCheckIn(token, planId, day, pain, did);

      setCheckIns((current) =>
        [...(current ?? []).filter((c) => c.day !== checkIn.day), checkIn].sort((a, b) => a.day.localeCompare(b.day))
      );
      setSaved(true);
      onSaved?.();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  const checkedInToday = checkIns?.some((checkIn) => checkIn.day === day) ?? false;

  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Pain tracker</h2>

      {loadError && <ErrorMessage>{loadError}</ErrorMessage>}
      {!loadError && checkIns === null && <Loading />}

      {checkIns !== null && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div className="question">
              <p>How bad is the pain today?</p>
              <div className="pain-scale">
                {PAIN_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    className="choice"
                    aria-pressed={pain === level}
                    aria-label={`Pain ${level} out of 10`}
                    onClick={() => setPain(level)}
                    disabled={busy}
                  >
                    {level}
                  </button>
                ))}
              </div>
              <div className="pain-ends">
                <span>No pain</span>
                <span>Worst imaginable</span>
              </div>
            </div>

            <div className="question">
              <p>Did you do your exercises today?</p>
              <Choices
                options={{ yes: "Yes", no: "No" }}
                selected={did === null ? [] : [did ? "yes" : "no"]}
                onPick={(answer) => setDid(answer === "yes")}
                disabled={busy}
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={busy || pain === null || did === null}>
              {busy ? "Saving…" : checkedInToday ? "Update today's check-in" : "Save today's check-in"}
            </button>

            {error && <ErrorMessage>{error}</ErrorMessage>}
            {saved && (
              <p className="success" role="status">
                ✓ Saved. Come back tomorrow to keep the graph going.
              </p>
            )}
          </form>

          <PainHistory checkIns={checkIns} />
        </>
      )}

      {/* Shown every time, whatever the numbers: the tracker doesn't judge a trend. */}
      <p className="muted small" style={{ marginBottom: 0 }}>
        If your pain keeps getting worse, or something new starts to hurt, stop the exercises and talk to a doctor
        or physiotherapist.
      </p>
    </section>
  );
}

function PainHistory({ checkIns }: { checkIns: CheckIn[] }) {
  if (checkIns.length === 0) {
    return <p className="muted">No check-ins yet. Your first one starts the graph.</p>;
  }

  const first = checkIns[0];
  const latest = checkIns[checkIns.length - 1];
  const exercised = checkIns.filter((checkIn) => checkIn.didExercises).length;

  return (
    <div className="pain-history">
      <p className="small" style={{ marginBottom: 8 }}>
        {checkIns.length} check-in{checkIns.length === 1 ? "" : "s"} · exercises done on {exercised} of them
        {checkIns.length > 1 && (
          <>
            {" "}
            · pain {first.pain} on {shortDay(first.day)}, {latest.pain} on {shortDay(latest.day)}
          </>
        )}
      </p>

      <PainChart checkIns={checkIns} />

      <div className="chart-legend small muted">
        <span>
          <svg width="12" height="12" aria-hidden="true">
            <circle cx="6" cy="6" r="4.5" className="dot-done" />
          </svg>
          Did the exercises
        </span>
        <span>
          <svg width="12" height="12" aria-hidden="true">
            <circle cx="6" cy="6" r="4.5" className="dot-skipped" />
          </svg>
          Didn&apos;t
        </span>
      </div>

      {checkIns.length === 1 && <p className="muted small">Check in again on another day to see a trend.</p>}
    </div>
  );
}

// Pain (0-10) up the side, days along the bottom, spaced by the real number of
// days between them so a missed week shows as a gap.
const W = 600;
const H = 220;
const PAD = { left: 36, right: 18, top: 14, bottom: 34 };

function PainChart({ checkIns }: { checkIns: CheckIn[] }) {
  const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;
  const start = dayNumber(checkIns[0].day);
  const span = dayNumber(checkIns[checkIns.length - 1].day) - start;

  // A single day sits in the middle rather than against the axis.
  const x = (day: string) =>
    span === 0 ? (PAD.left + W - PAD.right) / 2 : PAD.left + ((dayNumber(day) - start) / span) * (W - PAD.left - PAD.right);
  const y = (pain: number) => PAD.top + ((10 - pain) / 10) * (H - PAD.top - PAD.bottom);

  const line = checkIns.map((c, i) => `${i === 0 ? "M" : "L"}${x(c.day).toFixed(1)},${y(c.pain).toFixed(1)}`).join(" ");
  const labels = span === 0 ? [checkIns[0]] : [checkIns[0], checkIns[checkIns.length - 1]];

  return (
    <svg
      className="pain-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Pain over time: ${checkIns.map((c) => `${shortDay(c.day)} ${c.pain}`).join(", ")}`}
    >
      {[0, 5, 10].map((level) => (
        <g key={level}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(level)} y2={y(level)} className="chart-grid" />
          <text x={PAD.left - 10} y={y(level) + 5} textAnchor="end" className="chart-label">
            {level}
          </text>
        </g>
      ))}

      {labels.map((c, i) => (
        <text
          key={c.day}
          x={x(c.day)}
          y={H - 10}
          textAnchor={span === 0 ? "middle" : i === 0 ? "start" : "end"}
          className="chart-label"
        >
          {shortDay(c.day)}
        </text>
      ))}

      {checkIns.length > 1 && <path d={line} className="chart-line" />}

      {checkIns.map((c) => (
        <circle key={c.day} cx={x(c.day)} cy={y(c.pain)} r={6} className={c.didExercises ? "dot-done" : "dot-skipped"}>
          <title>
            {shortDay(c.day)}: pain {c.pain}, {c.didExercises ? "did the exercises" : "didn't do the exercises"}
          </title>
        </circle>
      ))}
    </svg>
  );
}
