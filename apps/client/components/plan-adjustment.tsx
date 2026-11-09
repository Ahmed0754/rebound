"use client";

// What the pain trend says to do with a plan, from the server, and a button
// to apply it. Nothing changes until the person applies it, and applying is
// the same save as editing the doses by hand.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ErrorMessage } from "@/components/ui";
import { getAdjustment, messageOf, updateRegime, type Adjustment, type Regime } from "@/lib/api";

function amountText(unit: "reps" | "hold", reps: number | null, holdSeconds: number | null): string {
  return unit === "hold" ? `${holdSeconds}s hold` : `${reps} reps`;
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Not worth an error on the page: the plan works without a suggestion.
    getAdjustment(token, plan.id)
      .then((result) => {
        if (!cancelled) setAdjustment(result);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [token, plan.id, plan.updatedAt, checkInsSaved]);

  if (adjustment === null) return null;

  const { proposed } = adjustment;
  const current = new Map(plan.regime.map((ex) => [ex.id, ex]));

  async function apply() {
    if (!proposed) return;

    setBusy(true);
    setError(null);

    try {
      onApplied(
        await updateRegime(
          token,
          plan.id,
          proposed.map(({ id, sets, reps, holdSeconds }) => ({ id, sets, reps, holdSeconds }))
        )
      );
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>How your plan is going</h2>

      <p>{adjustment.advice}</p>

      {adjustment.earlier !== null && adjustment.recent !== null && (
        <p className="muted small">
          Average pain {adjustment.earlier.toFixed(1)} before, {adjustment.recent.toFixed(1)} over your last three
          check-ins.
        </p>
      )}

      {adjustment.retake && (
        <Link className="btn btn-primary" href="/onboarding">
          Fill in the questionnaire again
        </Link>
      )}

      {proposed && (
        <>
          <ul className="small">
            {proposed.map((p) => {
              const ex = current.get(p.id);
              if (!ex) return null;

              return (
                <li key={p.id}>
                  {ex.name}: {ex.sets} × {amountText(ex.unit, ex.reps, ex.holdSeconds)} → {p.sets} ×{" "}
                  {amountText(p.unit, p.reps, p.holdSeconds)}
                </li>
              );
            })}
          </ul>

          <button type="button" className="btn btn-primary" onClick={apply} disabled={busy}>
            {busy ? "Saving…" : "Apply these doses"}
          </button>
          {error && <ErrorMessage>{error}</ErrorMessage>}
        </>
      )}
    </section>
  );
}
