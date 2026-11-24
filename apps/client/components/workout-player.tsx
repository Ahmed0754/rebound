"use client";

//The workout player: one flashcard per exercise, its pictures on the front and
//its steps on the back. Each set is ticked off with one big button; after the
//last set of the last exercise the day's workout is recorded as done.
//
//Progress lives in this browser (lib/storage) until then, so leaving and
//coming back - or a refresh - picks up where it stopped. Only the finished
//workout is sent to the server, so there is no half-done row to go stale.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExerciseFigure } from "@/components/exercise-figure";
import { Check, Clock, Layers, Repeat } from "@/components/icons";
import { today } from "@/lib/days";
import { ErrorMessage } from "@/components/ui";
import { completeWorkout, messageOf, type Regime } from "@/lib/api";
import { dose, steps } from "@/lib/exercises";
import { KEYS, read, remove, write } from "@/lib/storage";

//`done` is the sets ticked off for each exercise, in the plan's order.
type Progress = { done: number[]; card: number };

type Finish = { status: "playing" } | { status: "saving" } | { status: "saved" } | { status: "error"; message: string };


//A saved progress that still fits this plan, or null. The doses may have been
//edited since, so a count past an exercise's sets is clamped, and a different
//number of exercises starts over.
function restore(stored: string | null, plan: Regime): Progress | null {
  if (stored === null) return null;

  try {
    const saved = JSON.parse(stored) as Progress;
    if (!Array.isArray(saved.done) || saved.done.length !== plan.regime.length) return null;

    const done = plan.regime.map((ex, i) => Math.min(Math.max(Math.floor(Number(saved.done[i]) || 0), 0), ex.sets));
    const card = Math.min(Math.max(Math.floor(Number(saved.card) || 0), 0), plan.regime.length - 1);
    return { done, card };
  } catch {
    return null;
  }
}

export function WorkoutPlayer({ token, plan }: { token: string; plan: Regime }) {
  const day = today();
  const key = KEYS.workout(plan.id, day);
  const exercises = plan.regime;

  const [progress, setProgress] = useState<Progress>({ done: exercises.map(() => 0), card: 0 });
  //Storage is read after mount, as on the questionnaire, so the server render
  //and the first client render agree.
  const [restored, setRestored] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [finish, setFinish] = useState<Finish>({ status: "playing" });

  useEffect(() => {
    const saved = restore(read("local", key), plan);
    if (saved) setProgress(saved);
    setRestored(true);
  }, [key, plan]);

  useEffect(() => {
    if (restored && finish.status === "playing") write("local", key, JSON.stringify(progress));
  }, [restored, finish.status, key, progress]);

  //The page behind the player shouldn't scroll under it.
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, []);

  const totalSets = exercises.reduce((sum, ex) => sum + ex.sets, 0);
  const setsDone = progress.done.reduce((sum, n) => sum + n, 0);
  const ex = exercises[progress.card];
  const doneHere = progress.done[progress.card];
  const exerciseDone = doneHere >= ex.sets;

  function goTo(card: number) {
    setProgress((p) => ({ ...p, card }));
    setFlipped(false);
  }

  async function save() {
    setFinish({ status: "saving" });

    try {
      await completeWorkout(token, plan.id, day);
      remove("local", key);
      setFinish({ status: "saved" });
    } catch (e) {
      //The sets stay ticked off, so trying again is one tap.
      setFinish({ status: "error", message: messageOf(e) });
    }
  }

  function completeSet() {
    if (exerciseDone) return;

    const done = progress.done.map((n, i) => (i === progress.card ? n + 1 : n));
    let card = progress.card;

    //This exercise is finished: move on to the next one that isn't.
    if (done[card] >= exercises[card].sets) {
      const next = exercises.findIndex((e, i) => i > card && done[i] < e.sets);
      const first = exercises.findIndex((e, i) => done[i] < e.sets);
      card = next !== -1 ? next : first !== -1 ? first : card;
    }

    setProgress({ done, card });
    setFlipped(false);

    if (done.every((n, i) => n >= exercises[i].sets)) {
      void save();
    }
  }

  function undoSet() {
    if (doneHere === 0) return;
    setProgress((p) => ({ ...p, done: p.done.map((n, i) => (i === p.card ? n - 1 : n)) }));
  }

  if (finish.status === "saved" || finish.status === "saving" || finish.status === "error") {
    return (
      <div className="player">
        <div className="player-inner player-finished">
          <span className="player-trophy" aria-hidden>
            <Check size={40} />
          </span>
          <h1>Workout complete</h1>
          <p className="lead">
            {exercises.length} exercise{exercises.length === 1 ? "" : "s"} · {totalSets} set{totalSets === 1 ? "" : "s"}.
            Nice work.
          </p>

          {finish.status === "saving" && <p className="muted" aria-live="polite">Saving…</p>}
          {finish.status === "error" && (
            <>
              <ErrorMessage>Couldn&apos;t mark it as done: {finish.message}</ErrorMessage>
              <button type="button" className="btn btn-primary btn-large" onClick={save}>
                Try again
              </button>
            </>
          )}

          {finish.status === "saved" && (
            <>
              <p className="success">Today&apos;s workout is marked as done. Don&apos;t forget to log how your pain is.</p>
              <div className="row player-finished-actions">
                <Link className="btn btn-primary btn-large" href={`/plans/${plan.id}#pain-tracker`}>
                  Log today&apos;s pain
                </Link>
                <Link className="btn btn-large" href={`/plans/${plan.id}`}>
                  Back to the plan
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="player" role="dialog" aria-modal="true" aria-label="Workout">
      <div className="player-inner">
        <div className="player-top">
          <Link className="btn btn-small btn-pill" href={`/plans/${plan.id}`} title="Your progress is kept">
            ✕ Exit
          </Link>
          <span className="muted small">
            Exercise {progress.card + 1} of {exercises.length} · {setsDone}/{totalSets} sets
          </span>
        </div>

        <div
          className="player-progress"
          role="progressbar"
          aria-label="Sets done"
          aria-valuemin={0}
          aria-valuemax={totalSets}
          aria-valuenow={setsDone}
        >
          <span style={{ width: `${(setsDone / totalSets) * 100}%` }} />
        </div>

        <div className="player-cards" aria-label="Exercises">
          {exercises.map((e, i) => (
            <button
              key={e.id}
              type="button"
              className={`player-dot${i === progress.card ? " current" : ""}${progress.done[i] >= e.sets ? " done" : ""}`}
              aria-label={`Exercise ${i + 1}: ${e.name}${progress.done[i] >= e.sets ? ", done" : ""}`}
              aria-current={i === progress.card ? "step" : undefined}
              onClick={() => goTo(i)}
            />
          ))}
        </div>

        <div className={`flashcard${flipped ? " flipped" : ""}`}>
          <div className="flashcard-inner">
            <section className="flashcard-face flashcard-front" inert={flipped} aria-hidden={flipped}>
              <h2 className="flashcard-title">{ex.name}</h2>
              <div className="photo-card-meta flashcard-meta">
                <span>
                  <Layers size={14} /> {ex.sets} set{ex.sets === 1 ? "" : "s"}
                </span>
                <span>
                  {ex.unit === "hold" ? <Clock size={14} /> : <Repeat size={14} />}{" "}
                  {ex.unit === "hold" ? `${ex.holdSeconds}s hold` : `${ex.reps} reps`}
                </span>
              </div>
              {/* Keyed so a failed picture on one card doesn't hide the next one's. */}
              <ExerciseFigure key={ex.id} exerciseId={ex.id} name={ex.name} />
              <button type="button" className="link-button flashcard-flip" onClick={() => setFlipped(true)}>
                How to do it →
              </button>
            </section>

            <section className="flashcard-face flashcard-back" inert={!flipped} aria-hidden={!flipped}>
              <h2 className="flashcard-title">{ex.name}</h2>
              <ol className="steps-list">
                {steps(ex.description).map((step, j) => (
                  <li key={j}>{step}</li>
                ))}
              </ol>
              {ex.rationale && <p className="rationale">{ex.rationale}</p>}
              <button type="button" className="link-button flashcard-flip" onClick={() => setFlipped(false)}>
                ← Back to the pictures
              </button>
            </section>
          </div>
        </div>

        <div className="player-sets" aria-label={`${doneHere} of ${ex.sets} sets done`}>
          {Array.from({ length: ex.sets }, (_, i) => (
            <span key={i} className={`set-pip${i < doneHere ? " done" : ""}`} aria-hidden>
              {i < doneHere ? <Check size={14} /> : i + 1}
            </span>
          ))}
        </div>

        {ex.unit === "hold" && !exerciseDone && ex.holdSeconds !== null && (
          <HoldTimer key={`${ex.id}-${doneHere}`} seconds={ex.holdSeconds} />
        )}

        <div className="player-actions">
          {exerciseDone ? (
            <p className="success" style={{ margin: 0 }}>
              All {ex.sets} sets done. Pick another exercise above.
            </p>
          ) : (
            <button type="button" className="btn btn-primary btn-large player-done" onClick={completeSet}>
              <Check size={18} /> Set {doneHere + 1} of {ex.sets} done
            </button>
          )}

          <div className="row player-nav">
            <button
              type="button"
              className="btn btn-small btn-pill"
              onClick={() => goTo(progress.card - 1)}
              disabled={progress.card === 0}
            >
              ← Previous
            </button>
            <button type="button" className="btn btn-small btn-pill" onClick={undoSet} disabled={doneHere === 0}>
              Undo a set
            </button>
            <button
              type="button"
              className="btn btn-small btn-pill"
              onClick={() => goTo(progress.card + 1)}
              disabled={progress.card === exercises.length - 1}
            >
              Next →
            </button>
          </div>
        </div>

        <p className="muted small player-dose">{dose(ex)}</p>
      </div>
    </div>
  );
}

//A countdown for one held set. Optional: the set is ticked off with the main
//button either way. Remounted (by its key) for each set and each exercise.
function HoldTimer({ seconds }: { seconds: number }) {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [endsAt]);

  const left = endsAt === null ? seconds : Math.max(0, Math.ceil((endsAt - now) / 1000));
  const over = endsAt !== null && left === 0;

  return (
    <div className="hold-timer" aria-live="polite">
      <span className={`hold-timer-count${over ? " over" : ""}`}>{over ? "Time!" : `${left}s`}</span>
      {endsAt === null ? (
        <button
          type="button"
          className="btn btn-small btn-pill"
          onClick={() => {
            setNow(Date.now());
            setEndsAt(Date.now() + seconds * 1000);
          }}
        >
          <Clock size={14} /> Start the {seconds}s timer
        </button>
      ) : (
        <button type="button" className="btn btn-small btn-pill" onClick={() => setEndsAt(null)}>
          Reset
        </button>
      )}
    </div>
  );
}
