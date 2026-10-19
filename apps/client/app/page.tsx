"use client";

//this is the home route: what Rebound is, how it works, and the way in.

import Link from "next/link";
import { useCurrentUser } from "@/lib/current-user";

const HOW_IT_WORKS = [
  "Answer four short steps: where it hurts, how bad it is, and what you have to train with.",
  "A safety check comes first. Any warning sign means no plan, and you're pointed to a professional instead.",
  "Your answers set limits on sets, reps and difficulty. AI picks exercises inside them, and every number is checked before you see it.",
];

export default function Home() {
  const { state } = useCurrentUser();

  return (
    <main className="page">
      <h1>Rebound</h1>
      <p className="lead">A short, personal exercise plan for the part that hurts, built from a two-minute questionnaire.</p>

      <div className="row" style={{ marginBottom: 24 }}>
        {state.status === "ready" ? (
          <>
            <Link className="btn btn-primary" href="/plans">
              Continue as {state.user.username}
            </Link>
            <Link className="btn" href="/onboarding">
              New plan
            </Link>
          </>
        ) : (
          <Link className="btn btn-primary" href="/account">
            Get started
          </Link>
        )}
      </div>

      <section className="card">
        <h2>How it works</h2>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          {HOW_IT_WORKS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <p className="muted small">
        Rebound is a student project, not medical advice. Its safety thresholds have not yet been reviewed by a
        clinician. If something feels seriously wrong, see a doctor.
      </p>
    </main>
  );
}
