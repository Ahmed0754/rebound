"use client";

//this is the home route. Logged out, it is the landing page: what Rebound is,
//how it works, and the way in. Logged in, it is the dashboard: today's
//check-in on the newest plan, and the way to everything else.

import { useEffect, useState } from "react";
import Link from "next/link";
import { PainTracker } from "@/components/pain-tracker";
import { ErrorMessage, Loading } from "@/components/ui";
import { listRegimes, messageOf, type Regime, type User } from "@/lib/api";
import { useCurrentUser } from "@/lib/current-user";
import { regionLabel } from "@/lib/questionnaire";

export default function Home() {
  const { state } = useCurrentUser();

  if (state.status === "loading") {
    return (
      <main className="page">
        <Loading />
      </main>
    );
  }

  if (state.status === "ready") {
    return <Dashboard user={state.user} token={state.token} />;
  }

  //Logged out, or the server couldn't confirm the account: /account says which.
  return <Landing />;
}

// ---------------------------------------------------------------- Landing

const HOW_IT_WORKS = [
  {
    title: "Tell us what hurts",
    text: "Four short steps: where it hurts, how bad it is, and what you have to train with.",
  },
  {
    title: "Safety comes first",
    text: "Any warning sign means no plan. You're pointed to a professional instead.",
  },
  {
    title: "Get a plan with limits",
    text: "Your answers set limits on sets, reps and difficulty. AI picks exercises inside them, and every number is checked before you see it.",
  },
  {
    title: "Track how it's going",
    text: "Check in each day with your pain level and whether you did the exercises, and watch the trend.",
  },
];

function Landing() {
  return (
    <main className="page">
      <section className="hero">
        <h1>Exercises for the part that hurts.</h1>
        <p className="lead">
          A short, personal recovery plan built from a two-minute questionnaire, with a daily check-in to see if
          it&apos;s helping.
        </p>
        <div className="row">
          <Link className="btn btn-primary" href="/account">
            Get started
          </Link>
          <Link className="btn" href="/account">
            Log in
          </Link>
        </div>
      </section>

      <h2>How it works</h2>
      <ol className="feature-list">
        {HOW_IT_WORKS.map((step) => (
          <li key={step.title} className="card">
            <h3>{step.title}</h3>
            <p className="muted" style={{ margin: 0 }}>
              {step.text}
            </p>
          </li>
        ))}
      </ol>

      <p className="muted small">
        Rebound is a student project, not medical advice. Its safety thresholds have not yet been reviewed by a
        clinician. If something feels seriously wrong, see a doctor.
      </p>
    </main>
  );
}

// -------------------------------------------------------------- Dashboard

//"Good morning" by the person's own clock.
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function Dashboard({ user, token }: { user: User; token: string }) {
  const [plans, setPlans] = useState<Regime[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    listRegimes(token)
      .then((list) => {
        if (!cancelled) setPlans(list);
      })
      .catch((e) => {
        if (!cancelled) setError(messageOf(e));
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  //The newest plan is the one being followed; the server lists newest first.
  const current = plans?.[0] ?? null;
  const others = plans?.slice(1, 4) ?? [];

  return (
    <main className="page">
      <h1>
        {greeting()}, {user.username}
      </h1>
      <p className="lead">
        {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
      </p>

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {!error && plans === null && <Loading />}

      {plans !== null && current === null && (
        <section className="card">
          <h2>Let&apos;s build your first plan</h2>
          <p className="muted">
            Answer a few short questions about what hurts and what you have to train with. It takes about two
            minutes.
          </p>
          <Link className="btn btn-primary" href="/onboarding">
            Start the questionnaire
          </Link>
        </section>
      )}

      {current !== null && (
        <>
          <section className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <div className="muted small">Your current plan</div>
                <div className="exercise-name">{regionLabel(current.muscle)}</div>
                <div className="muted small">
                  {current.regime.length} exercise{current.regime.length === 1 ? "" : "s"} · made{" "}
                  {new Date(current.createdAt).toLocaleDateString()}
                </div>
              </div>
              <Link className="btn btn-primary" href={`/plans/${current.id}`}>
                Open plan
              </Link>
            </div>
          </section>

          <PainTracker token={token} planId={current.id} />

          {others.length > 0 && (
            <section>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                <h2 style={{ margin: 0 }}>Earlier plans</h2>
                <Link className="small muted" href="/plans">
                  See all
                </Link>
              </div>
              <ul className="plain-list">
                {others.map((plan) => (
                  <li key={plan.id}>
                    <Link className="card plan-link" href={`/plans/${plan.id}`}>
                      <div className="exercise-name">{regionLabel(plan.muscle)}</div>
                      <div className="muted small">
                        {plan.regime.length} exercise{plan.regime.length === 1 ? "" : "s"} · made{" "}
                        {new Date(plan.createdAt).toLocaleDateString()}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="small">
            Something else hurting? <Link href="/onboarding">Start a new plan</Link>
          </p>
        </>
      )}
    </main>
  );
}
