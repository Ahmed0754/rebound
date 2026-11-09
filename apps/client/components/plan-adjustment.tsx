"use client";

// What the last week of pain says to do with a plan, from the server, a button
// to apply it, and the changes applied so far with a way to undo the latest.
// Nothing changes until the person applies it.

import { useEffect, useState } from "react";
import Link from "next/link";
import { today } from "@/components/pain-tracker";
import { ErrorMessage } from "@/components/ui";
import {
  applyAdjustment,
  getAdjustment,
  listAdjustments,
  messageOf,
  undoAdjustment,
  type Adjustment,
  type AdjustmentEvent,
  type Regime,
} from "@/lib/api";

function amountText(unit: "reps" | "hold", reps: number | null, holdSeconds: number | null): string {
  return unit === "hold" ? `${holdSeconds}s hold` : `${reps} reps`;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function PlanAdjustment({
  token,
  plan,
  checkInsSaved,
  onApplied,
}: {
  token: string;
  plan: Regime;
  // Bumped by the pain tracker after each save, so the suggestion follows.
  checkInsSaved: number;
  onApplied: (plan: Regime) => void;
}) {
  const [adjustment, setAdjustment] = useState<Adjustment | null>(null);
  const [history, setHistory] = useState<AdjustmentEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped when the server says what's on screen is out of date.
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let cancelled = false;

    // Not worth an error on the page: the plan works without either.
    getAdjustment(token, plan.id, today())
      .then((result) => {
        if (!cancelled) setAdjustment(result);
      })
      .catch(() => undefined);

    listAdjustments(token, plan.id)
      .then((result) => {
        if (!cancelled) setHistory(result);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [token, plan.id, plan.updatedAt, checkInsSaved, reloads]);

  if (adjustment === null) return null;

  const { proposed, stop } = adjustment;
  const current = new Map(plan.regime.map((ex) => [ex.id, ex]));

  // Either kind of change: the same busy state, error and reload if refused.
  async function change(save: () => Promise<Regime>) {
    setBusy(true);
    setError(null);

    try {
      onApplied(await save());
    } catch (e) {
      setError(messageOf(e));
      setReloads((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    if (!proposed) return;

    const doses = proposed.map(({ id, sets, reps, holdSeconds }) => ({ id, sets, reps, holdSeconds }));

    change(() => applyAdjustment(token, plan.id, doses, today()));
  }

  return (
    <section
      className={stop ? "card card-stop" : proposed || adjustment.retake ? "card card-highlight" : "card"}
      role={stop ? "alert" : undefined}
    >
      <h2 style={{ marginTop: 0 }}>How your plan is going</h2>

      <p>{adjustment.advice}</p>

      {adjustment.earlier !== null && adjustment.recent !== null && (
        <p className="muted small">
          Average pain {adjustment.earlier.toFixed(1)} earlier this week, {adjustment.recent.toFixed(1)} over your last
          three check-ins.
        </p>
      )}

      {adjustment.retake && (
        <Link className="btn btn-primary" href="/onboarding">
          Fill in the questionnaire again
        </Link>
      )}

      {proposed && (
        <>
          <ul className="change-list">
            {proposed.map((p) => {
              const ex = current.get(p.id);
              if (!ex) return null;

              return (
                <li key={p.id}>
                  <span>{ex.name}</span>
                  <span>
                    <span className="from">
                      {ex.sets} × {amountText(ex.unit, ex.reps, ex.holdSeconds)}
                    </span>{" "}
                    →{" "}
                    <span className="to">
                      {p.sets} × {amountText(p.unit, p.reps, p.holdSeconds)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          <button type="button" className="btn btn-primary" onClick={apply} disabled={busy}>
            {busy ? "Saving…" : "Apply these doses"}
          </button>
        </>
      )}

      {error && <ErrorMessage>{error}</ErrorMessage>}

      {history.length > 0 && (
        <div className="adjustment-history">
          <h3 className="small">Changes so far</h3>
          <ul className="change-list">
            {history.map((event) => (
              <li key={event.id}>
                <span>
                  {shortDate(event.createdAt)} · {event.trend === "better" ? "Made harder" : "Made easier"}
                  {event.undoneAt && <span className="muted"> · undone</span>}
                </span>

                {event.undoable && (
                  <button
                    type="button"
                    className="btn btn-small btn-pill"
                    onClick={() => change(() => undoAdjustment(token, plan.id))}
                    disabled={busy}
                  >
                    Undo
                  </button>
                )}

                <ul className="adjustment-doses muted small">
                  {event.changes.map((c) => (
                    <li key={c.id}>
                      {c.name}: {c.from.sets} × {amountText(c.unit, c.from.reps, c.from.holdSeconds)} → {c.to.sets} ×{" "}
                      {amountText(c.unit, c.to.reps, c.to.holdSeconds)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
