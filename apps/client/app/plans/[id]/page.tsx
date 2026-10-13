"use client";

//this is one plan: its exercises, doses and rationales, with editing of the
//doses and deleting the whole plan.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AccountError, BackLink, ErrorMessage, Loading } from "@/components/ui";
import { ApiError, deleteRegime, getRegimeById, messageOf, updateRegime, type Exercise, type Regime } from "@/lib/api";
import { useRequiredUser } from "@/lib/current-user";
import { regionLabel } from "@/lib/questionnaire";

type Load = { status: "loading" } | { status: "missing" } | { status: "error"; message: string } | { status: "loaded"; plan: Regime };

//`amount` is reps or seconds, whichever the exercise is dosed in. Strings, not
//numbers, so clearing a box leaves it empty instead of snapping to 0 and
//fighting the next keystroke. They become numbers on save.
type Dose = { sets: string; amount: string };

//"2 sets × 10 reps" or "2 sets × 20s hold". `reps` is null for a hold, so the
//unit decides which number to show.
function doseText(ex: Exercise): string {
  const sets = `${ex.sets} set${ex.sets === 1 ? "" : "s"}`;
  return ex.unit === "hold" ? `${sets} × ${ex.holdSeconds}s hold` : `${sets} × ${ex.reps} reps`;
}

export default function PlanPage() {
  const { id } = useParams<{ id: string }>();
  const { user, error: accountError } = useRequiredUser();
  const router = useRouter();

  const [load, setLoad] = useState<Load>({ status: "loading" });
  //The draft while editing, keyed by exercise id; null when not editing. The
  //plan itself is left alone until the server confirms a save, so a failed
  //save can't leave the screen showing a plan the database doesn't have.
  const [doses, setDoses] = useState<Record<string, Dose> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    getRegimeById(id)
      .then((plan) => {
        if (cancelled) return;
        //The server doesn't check ownership on this route yet, so the client
        //does: another account's plan is treated as not found.
        setLoad(plan.userId === user.id ? { status: "loaded", plan } : { status: "missing" });
      })
      .catch((e) => {
        if (cancelled) return;
        setLoad(e instanceof ApiError && e.status === 404 ? { status: "missing" } : { status: "error", message: messageOf(e) });
      });

    return () => {
      cancelled = true;
    };
  }, [user, id]);

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
    if (!doses) return;

    setBusy(true);
    setError(null);

    try {
      const updated = await updateRegime(
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
    if (!window.confirm("Delete this plan? This can't be undone.")) return;

    setBusy(true);
    setError(null);

    try {
      await deleteRegime(plan.id);
      router.push("/plans");
    } catch (e) {
      //Left on screen: a failed delete means it's still in the database.
      setError(messageOf(e));
      setBusy(false);
    }
  }

  const editing = doses !== null;

  return (
    <main className="page">
      <BackLink href="/plans">My plans</BackLink>

      <h1>{regionLabel(plan.muscle)} plan</h1>
      <p className="lead small">
        Made {new Date(plan.createdAt).toLocaleString()}
        {plan.updatedAt !== plan.createdAt && <> · edited {new Date(plan.updatedAt).toLocaleString()}</>}
      </p>

      {!editing && (
        <div className="row" style={{ marginBottom: 16 }}>
          <button type="button" className="btn btn-small" onClick={startEdit} disabled={busy}>
            Edit doses
          </button>
          <button type="button" className="btn btn-small btn-danger" onClick={remove} disabled={busy}>
            Delete plan
          </button>
        </div>
      )}

      {error && <ErrorMessage>{error}</ErrorMessage>}

      {/* One list: plans have no morning/evening split yet. */}
      <ol className="plain-list">
        {plan.regime.map((ex) => (
          <li key={ex.id} className="card" style={editing ? { borderColor: "var(--primary)" } : undefined}>
            <div className="exercise-name">{ex.name}</div>

            {editing ? (
              <div className="row" style={{ marginTop: 8 }}>
                <label className="row" style={{ gap: 6 }}>
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
                <label className="row" style={{ gap: 6 }}>
                  <input
                    className="input-number"
                    type="number"
                    min={1}
                    max={ex.unit === "hold" ? 600 : 100}
                    value={doses[ex.id]?.amount ?? ""}
                    onChange={(e) => setDose(ex.id, "amount", e.target.value)}
                    disabled={busy}
                  />
                  {ex.unit === "hold" ? "seconds hold" : "reps"}
                </label>
              </div>
            ) : (
              <>
                {/* The dose is what counts: the description below may give a
                    different range, so the dose comes first and stands out. */}
                <p className="dose">{doseText(ex)}</p>
                {ex.rationale && <p className="rationale">{ex.rationale}</p>}
              </>
            )}

            <details className="how-to">
              <summary>How to do it</summary>
              <p style={{ marginBottom: 0 }}>{ex.description}</p>
            </details>
          </li>
        ))}
      </ol>

      {editing && (
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
          <button type="button" className="btn" onClick={cancelEdit} disabled={busy}>
            Cancel
          </button>
        </div>
      )}
    </main>
  );
}
