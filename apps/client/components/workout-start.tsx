"use client";

//The way into the workout player: "Start workout", "Continue" when some sets
//are already ticked off today, or "Done today" once it's finished. Shown on
//the plan page and on the dashboard.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, Check } from "@/components/icons";
import { today } from "@/lib/days";
import { listWorkouts, type Regime } from "@/lib/api";
import { KEYS, read } from "@/lib/storage";

export function WorkoutStart({ token, plan }: { token: string; plan: Regime }) {
  //null until known. A failed fetch reads as "not done": the button still works.
  const [doneToday, setDoneToday] = useState<boolean | null>(null);
  const [setsSoFar, setSetsSoFar] = useState(0);

  const day = today();
  const totalSets = plan.regime.reduce((sum, ex) => sum + ex.sets, 0);

  useEffect(() => {
    let cancelled = false;

    listWorkouts(token, plan.id)
      .then((list) => {
        if (!cancelled) setDoneToday(list.some((w) => w.day === day));
      })
      .catch(() => {
        if (!cancelled) setDoneToday(false);
      });

    //How far today's workout got, if it was started in this browser.
    try {
      const saved = JSON.parse(read("local", KEYS.workout(plan.id, day)) ?? "null") as { done?: number[] } | null;
      setSetsSoFar(Array.isArray(saved?.done) ? saved.done.reduce((sum, n) => sum + (Number(n) || 0), 0) : 0);
    } catch {
      setSetsSoFar(0);
    }

    return () => {
      cancelled = true;
    };
  }, [token, plan.id, day]);

  const href = `/plans/${plan.id}/workout`;

  if (doneToday) {
    return (
      <section className="card workout-start done">
        <span className="feature-icon" aria-hidden>
          <Check size={22} />
        </span>
        <div className="workout-start-text">
          <h2>Today&apos;s workout is done</h2>
          <p className="muted small">Nice work. Remember to log your pain for today.</p>
        </div>
        <Link className="btn btn-small btn-pill" href={href}>
          Do it again
        </Link>
      </section>
    );
  }

  const started = setsSoFar > 0;

  return (
    <section className="card workout-start">
      <span className="feature-icon" aria-hidden>
        <Activity size={22} />
      </span>
      <div className="workout-start-text">
        <h2>{started ? "Pick up where you left off" : "Today's workout"}</h2>
        <p className="muted small">
          {started
            ? `${setsSoFar} of ${totalSets} sets done.`
            : `${plan.regime.length} exercise${plan.regime.length === 1 ? "" : "s"} · ${totalSets} sets. One card at a time - tap each set off as you go.`}
        </p>
      </div>
      <Link className="btn btn-primary btn-large" href={href}>
        {started ? "Continue" : "Start workout"} <ArrowRight size={18} />
      </Link>
    </section>
  );
}
