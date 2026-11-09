"use client";

//this is one plan: its exercises, doses and rationales, with editing of the
//doses, deleting the whole plan, and the pain tracker.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ExerciseFigure } from "@/components/exercise-figure";
import { Clock, Layers, Repeat, Sliders } from "@/components/icons";
import { LimitsSidebar } from "@/components/limits";
import { PhotoCard } from "@/components/photo-card";
import { PainTracker } from "@/components/pain-tracker";
import { PlanAdjustment } from "@/components/plan-adjustment";
import { AccountError, BackLink, ErrorMessage, Loading } from "@/components/ui";
import { ApiError, deleteRegime, getRegimeById, messageOf, updateRegime, type Regime } from "@/lib/api";
import { useRequiredUser } from "@/lib/current-user";
import { imageUrls, steps } from "@/lib/exercises";
import { regionLabel } from "@/lib/questionnaire";

type Load = { status: "loading" } | { status: "missing" } | { status: "error"; message: string } | { status: "loaded"; plan: Regime };

//`amount` is reps or seconds, whichever the exercise is dosed in. Strings, not
//numbers, so clearing a box leaves it empty instead of snapping to 0 and
//fighting the next keystroke. They become numbers on save.
type Dose = { sets: string; amount: string };

//"17 Oct 2026, 2:35 PM": the date and time, without the seconds.
function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function PlanPage() {
  const { id } = useParams<{ id: string }>();
  const { user, token, error: accountError } = useRequiredUser();
  const router = useRouter();

  const [load, setLoad] = useState<Load>({ status: "loading" });
  //The draft while editing, keyed by exercise id; null when not editing. The
  //plan itself is left alone until the server confirms a save, so a failed
  //save can't leave the screen showing a plan the database doesn't have.
  const [doses, setDoses] = useState<Record<string, Dose> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  //Counts pain check-ins saved on this page, so the adjustment card refetches.
  const [checkInsSaved, setCheckInsSaved] = useState(0);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    //Another account's plan is a 404 from the server, the same as a missing one.
    getRegimeById(token, id)
      .then((plan) => {
        if (!cancelled) setLoad({ status: "loaded", plan });
      })
      .catch((e) => {
        if (cancelled) return;
        setLoad(e instanceof ApiError && e.status === 404 ? { status: "missing" } : { status: "error", message: messageOf(e) });
      });

    return () => {
      cancelled = true;
    };
  }, [token, id]);

  if (accountError) {
    return (
      <main className="page">
        <AccountError message={accountError} />
      </main>
    );
  }

  if (!user || load.status === "loading") {
    return (
      <main className="page">
        <Loading />
      </main>
    );
  }

  if (load.status === "missing" || load.status === "error") {
    return (
      <main className="page">
        <BackLink href="/plans">My plans</BackLink>
        {load.status === "missing" ? (
          <>
            <h1>Plan not found</h1>
            <p className="lead">It may have been deleted, or it belongs to a different account.</p>
          </>
        ) : (
          <ErrorMessage>{load.message}</ErrorMessage>
        )}
        <Link className="btn btn-primary" href="/plans">
          Back to my plans
        </Link>
      </main>
    );
  }

  const { plan } = load;

  function startEdit() {
    setDoses(
      Object.fromEntries(
        plan.regime.map((ex) => [
          ex.id,
          { sets: String(ex.sets), amount: String(ex.unit === "hold" ? ex.holdSeconds : ex.reps) },
        ])
      )
    );
    setError(null);
  }

  function cancelEdit() {
    setDoses(null);
    setError(null);
  }

  function setDose(exerciseId: string, field: keyof Dose, value: string) {
    setDoses((current) => (current ? { ...current, [exerciseId]: { ...current[exerciseId], [field]: value } } : current));
  }

  //Sends only the id and the two numbers, the amount in whichever field the
  //exercise's unit names. The bounds are the server's to enforce; its 400
  //message is shown and the editor stays open with the numbers to fix.
  async function save() {
    if (!doses || !token) return;

    setBusy(true);
    setError(null);

    try {
      const updated = await updateRegime(
        token,
        plan.id,
        plan.regime.map((ex) => ({
          id: ex.id,
          sets: Number(doses[ex.id].sets),
          reps: ex.unit === "reps" ? Number(doses[ex.id].amount) : null,
          holdSeconds: ex.unit === "hold" ? Number(doses[ex.id].amount) : null,
        }))
      );

      setLoad({ status: "loaded", plan: updated });
      setDoses(null);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!token || !window.confirm("Delete this plan? This can't be undone.")) return;

    setBusy(true);
    setError(null);

    try {
      await deleteRegime(token, plan.id);
      router.push("/plans");
    } catch (e) {
      //Left on screen: a failed delete means it's still in the database.
      setError(messageOf(e));
      setBusy(false);
    }
  }

  const editing = doses !== null;
  const count = plan.regime.length;

  return (
    <main className="page page-app">
      <BackLink href="/plans">My plans</BackLink>

      <div className={plan.limits ? "app-layout" : "app-layout no-side"}>
        {/* Older plans were saved before the server recorded their limits. */}
        {plan.limits && (
          <aside className="app-side" aria-label="The limits this plan was built inside">
            <LimitsSidebar limits={plan.limits} />
          </aside>
        )}

        <div className="app-main">
          <div className="app-head">
            <div>
              <h1>
                {count} exercise{count === 1 ? "" : "s"} for your {regionLabel(plan.muscle).toLowerCase()}
              </h1>
              <p className="muted small" style={{ margin: 0 }}>
                Made {when(plan.createdAt)}
                {plan.updatedAt !== plan.createdAt && <> · edited {when(plan.updatedAt)}</>}
              </p>
            </div>

            {!editing && (
              <div className="row">
                <button type="button" className="btn btn-small btn-pill" onClick={startEdit} disabled={busy}>
                  <Sliders size={15} /> Edit doses
                </button>
                <Link className="btn btn-small btn-pill" href={`/plans/${plan.id}/evaluation`}>
                  How it was judged
                </Link>
                <button type="button" className="btn btn-small btn-pill btn-danger" onClick={remove} disabled={busy}>
                  Delete
                </button>
              </div>
            )}
          </div>

          {error && <ErrorMessage>{error}</ErrorMessage>}

          {/* One list: plans have no morning/evening split yet. The first
              exercise gets the full row, like a featured card. */}
          <ol className="card-grid plain-list">
            {plan.regime.map((ex, i) => (
              <li key={ex.id} className={i === 0 ? "wide" : undefined}>
                <PhotoCard
                  tone={i}
                  wide={i === 0}
                  photo={imageUrls(ex.id)[1]}
                  chip={`Exercise ${i + 1}`}
                  title={ex.name}
                  meta={
                    editing ? (
                      <div className="row" style={{ gap: 8 }}>
                        <label className="row dose-edit">
                          <input
                            className="input-number"
                            type="number"
                            min={1}
                            max={20}
                            value={doses[ex.id]?.sets ?? ""}
                            onChange={(e) => setDose(ex.id, "sets", e.target.value)}
                            disabled={busy}
                          />
                          sets
                        </label>
                        <label className="row dose-edit">
                          <input
                            className="input-number"
                            type="number"
                            min={1}
                            max={ex.unit === "hold" ? 600 : 100}
                            value={doses[ex.id]?.amount ?? ""}
                            onChange={(e) => setDose(ex.id, "amount", e.target.value)}
                            disabled={busy}
                          />
                          {ex.unit === "hold" ? "sec hold" : "reps"}
                        </label>
                      </div>
                    ) : (
                      <>
                        <span>
                          <Layers size={14} /> {ex.sets} set{ex.sets === 1 ? "" : "s"}
                        </span>
                        <span>
                          {ex.unit === "hold" ? <Clock size={14} /> : <Repeat size={14} />}{" "}
                          {ex.unit === "hold" ? `${ex.holdSeconds}s hold` : `${ex.reps} reps`}
                        </span>
                      </>
                    )
                  }
                >
                  {/* The dose is what counts: the description below may give a
                      different range, so the dose is the one on the card. */}
                  {ex.rationale && <p className="rationale">{ex.rationale}</p>}
                  <details className="how-to">
                    <summary>How to do it</summary>
                    <ExerciseFigure exerciseId={ex.id} name={ex.name} />
                    <ol className="steps-list">
                      {steps(ex.description).map((step, j) => (
                        <li key={j}>{step}</li>
                      ))}
                    </ol>
                  </details>
                </PhotoCard>
              </li>
            ))}
          </ol>

          {editing && (
            <div className="row" style={{ marginBottom: 16 }}>
              <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </button>
              <button type="button" className="btn" onClick={cancelEdit} disabled={busy}>
                Cancel
              </button>
            </div>
          )}

          {/* Out of the way while the doses are being edited. */}
          {!editing && token && (
            <>
              <PlanAdjustment
                token={token}
                plan={plan}
                checkInsSaved={checkInsSaved}
                onApplied={(updated) => setLoad({ status: "loaded", plan: updated })}
              />
              <PainTracker token={token} planId={plan.id} onSaved={() => setCheckInsSaved((n) => n + 1)} />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
