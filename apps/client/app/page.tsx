"use client";

//this is the home route: what Rebound is, how it keeps someone safe, and the
//way in. It used to be a bare redirect, which made the account picker the
//first thing anyone saw.

import Link from "next/link";
import { ExerciseFigure } from "@/components/exercise-figure";
import { useCurrentUser } from "@/lib/current-user";

const HOW_IT_WORKS = [
  {
    title: "Tell us what's going on",
    body: "Four short steps: where it hurts, how bad it is, what you've got to train with, and anything else worth knowing.",
  },
  {
    title: "Safety check first",
    body: "Seven warning-sign questions, and your note is screened too. Any warning sign means no plan: you're pointed to a professional instead.",
  },
  {
    title: "A plan inside your limits",
    body: "Your answers set hard limits on sets, reps and difficulty. AI picks exercises that fit, and software checks every number before you see it.",
  },
];

const FACTS: [string, string][] = [
  ["7", "warning signs checked before any plan"],
  ["9", "rules that can only tighten your limits"],
  ["700+", "exercises, filtered down to what fits you"],
];

export default function Home() {
  const { state } = useCurrentUser();
  const signedIn = state.status === "ready";

  return (
    <main className="landing">
      <section className="hero">
        <div>
          <p className="eyebrow">Train through it, safely</p>
          <h1 className="hero-title">Keep training while you recover.</h1>
          <p className="hero-lead">
            Rebound turns a two-minute questionnaire into a short, personal exercise plan for the part that hurts —
            with safety rules the AI can&apos;t override.
          </p>
          <div className="row">
            {signedIn ? (
              <>
                <Link className="btn btn-primary btn-large" href="/plans">
                  Continue as {state.user.username}
                </Link>
                <Link className="btn btn-large" href="/onboarding">
                  New plan
                </Link>
              </>
            ) : (
              <>
                <Link className="btn btn-primary btn-large" href="/account">
                  Get started
                </Link>
                <a className="btn btn-large" href="#how">
                  How it works
                </a>
              </>
            )}
          </div>
        </div>

        {/* An illustration of what a plan looks like, labelled as one. */}
        <div className="card hero-card" aria-label="Example exercise from a plan">
          <p className="eyebrow" style={{ marginBottom: 8 }}>
            Example
          </p>
          <div className="exercise-name">Calf Stretch, Hands Against Wall</div>
          <p className="dose">2 sets × 20s hold</p>
          <p className="rationale">A gentle stretch that eases tightness without loading a sore calf.</p>
          <ExerciseFigure exerciseId="Calf_Stretch_Hands_Against_Wall" name="Calf stretch" />
          <p className="badge">Within your limits</p>
        </div>
      </section>

      <section id="how" className="landing-section">
        <h2 className="section-title">How it works</h2>
        <ol className="how-steps">
          {HOW_IT_WORKS.map((step, i) => (
            <li key={step.title} className="card">
              <span className="step-number">{i + 1}</span>
              <h3>{step.title}</h3>
              <p className="muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-section">
        <h2 className="section-title">Safety isn&apos;t left to the AI</h2>
        <dl className="facts">
          {FACTS.map(([figure, label]) => (
            <div key={label} className="fact">
              <dt>{figure}</dt>
              <dd>{label}</dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="landing-footer">
        Rebound is a student project, not medical advice. Its safety thresholds are evidence-informed starting points
        and have not yet been reviewed by a clinician. If something feels seriously wrong, see a doctor.
      </footer>
    </main>
  );
}
