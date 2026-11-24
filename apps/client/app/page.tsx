"use client";

//this is the home route. Logged out, it is the landing page: what Rebound is,
//how it works, and the way in. Logged in, it is the dashboard: today's
//check-in on the newest plan, and the way to everything else.

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Activity, ArrowRight, Check, Plus } from "@/components/icons";
import { PainTracker, painZone } from "@/components/pain-tracker";
import { PhotoCard, PlanMeta } from "@/components/photo-card";
import { ErrorMessage, Loading } from "@/components/ui";
import { WorkoutStart } from "@/components/workout-start";
import { listRegimes, messageOf, type Regime, type User } from "@/lib/api";
import { useCurrentUser } from "@/lib/current-user";
import { planDay } from "@/lib/days";
import { imageUrls } from "@/lib/exercises";
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
    text: "Your answers set limits on sets, reps and difficulty. AI picks exercises inside them.",
  },
  {
    title: "Track how it's going",
    text: "Check in each day. As your pain changes, your plan suggests easier or harder doses.",
  },
];

//The rules in the server's clinical.ts, in the words a person would use.
//Copied, not fetched: if a rule or a cap changes there, change it here too.
//null means the rule leaves that limit alone.
type RuleRow = {
  when: string;
  sets: number | null;
  reps: number | null;
  hold: number | null;
  count: number | null;
  allowed: string | null;
};

const BASELINE: RuleRow = { when: "Everyone starts at", sets: 4, reps: 15, hold: 30, count: 5, allowed: "Up to your training level" };

const RULES: RuleRow[] = [
  { when: "Pain is 7 or above", sets: 2, reps: 8, hold: 20, count: 3, allowed: "Stretching only" },
  { when: "Pain is 4 to 6", sets: 3, reps: 12, hold: null, count: null, allowed: null },
  { when: "It started less than a week ago", sets: 2, reps: null, hold: 20, count: 3, allowed: "Stretching only" },
  { when: "It started more than 6 weeks ago", sets: 3, reps: 12, hold: null, count: null, allowed: null },
  { when: "You are 50 or over", sets: 2, reps: 10, hold: null, count: null, allowed: "Beginner exercises" },
  { when: "You have a long-term condition", sets: 2, reps: 10, hold: null, count: null, allowed: "Beginner exercises" },
  { when: "You're mostly sitting at the moment", sets: 2, reps: null, hold: null, count: null, allowed: null },
  { when: "Your sessions are 5 minutes", sets: null, reps: null, hold: null, count: 2, allowed: null },
  { when: "Your sessions are 10 minutes or less", sets: null, reps: null, hold: null, count: 3, allowed: null },
];

//A made-up plan for the hero, shown as an example: six days of check-ins with
//the pain coming down.
const EXAMPLE_PAIN = [6, 6, 5, 4, 4, 3];

//One catalogue exercise per area, picked for a clear photo.
const REGIONS = [
  { name: "Lower back", id: "Cat_Stretch", example: "Cat stretch" },
  { name: "Knee", id: "Lying_Prone_Quadriceps", example: "Quad stretch" },
  { name: "Hip", id: "Kneeling_Hip_Flexor", example: "Hip flexor stretch" },
  { name: "Hamstring", id: "Seated_Floor_Hamstring_Stretch", example: "Seated stretch" },
  { name: "Shoulder", id: "Band_Pull_Apart", example: "Band pull-apart" },
  { name: "Calf", id: "Calf_Stretch_Hands_Against_Wall", example: "Wall calf stretch" },
  { name: "Neck", id: "Isometric_Neck_Exercise_-_Sides", example: "Isometric neck hold" },
  { name: "Ankle", id: "Ankle_Circles", example: "Ankle circles" },
];

const photo = (id: string, frame: 0 | 1 = 1) => imageUrls(id)[frame];

function Limit({ value, unit = "" }: { value: number | null; unit?: string }) {
  return value === null ? <td className="none">–</td> : <td className="num">{`${value}${unit}`}</td>;
}

function RuleCells({ rule }: { rule: RuleRow }) {
  return (
    <>
      <th scope="row">{rule.when}</th>
      <Limit value={rule.sets} />
      <Limit value={rule.reps} />
      <Limit value={rule.hold} unit="s" />
      <Limit value={rule.count} />
      {rule.allowed === null ? <td className="none">–</td> : <td>{rule.allowed}</td>}
    </>
  );
}

function Landing() {
  const first = EXAMPLE_PAIN[0];
  const last = EXAMPLE_PAIN[EXAMPLE_PAIN.length - 1];

  return (
    <main className="landing">
      <div className="hero">
        <img
          className="hero-photo"
          src={photo("Kneeling_Hip_Flexor")}
          alt="Someone in a kneeling hip flexor stretch on a mat"
        />
        <section className="section hero-inner">
          <div className="hero-copy">
            <h1>Exercises for the part that hurts.</h1>
            <p className="lead">
              Answer a two-minute questionnaire. Get two to five exercises sized to your pain, your goal and the
              equipment you own. Check in each day, and the plan suggests easier or harder doses as your pain changes.
            </p>
            <div className="row">
              <Link className="btn btn-primary btn-large" href="/account?mode=sign_up">
                Build my plan <ArrowRight size={18} />
              </Link>
              <Link className="btn btn-large btn-on-photo" href="/account">
                Log in
              </Link>
            </div>
          </div>

          <aside className="plan-card" aria-label="An example plan">
            <div className="plan-card-head">
              <span className="plan-card-title">Knee plan</span>
              <span>Day 6 · example</span>
            </div>
            <dl className="plan-card-stats">
              <div>
                <dt>Pain</dt>
                <dd>
                  {first}→{last}
                </dd>
              </div>
              <div>
                <dt>Exercises</dt>
                <dd>3</dd>
              </div>
              <div>
                <dt>Session</dt>
                <dd>
                  10<small>min</small>
                </dd>
              </div>
            </dl>
            <div aria-hidden="true">
              <div className="pain-bars">
                {EXAMPLE_PAIN.map((pain, i) => (
                  <span key={i} className={painZone(pain)} style={{ "--pain": pain } as CSSProperties} />
                ))}
              </div>
              <div className="pain-bars-x">
                {EXAMPLE_PAIN.map((pain, i) => (
                  <span key={i}>{pain}</span>
                ))}
              </div>
            </div>
            <p className="plan-card-note">Daily pain on the 0–10 scale, days 1 to 6.</p>
          </aside>
        </section>
      </div>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>How a plan is made</h2>
            <p>Four steps, about two minutes. Safety is checked before the AI is involved, and again after.</p>
          </div>
        </div>
        <ol className="plan-steps">
          {HOW_IT_WORKS.map((step, i) => (
            <li key={step.title}>
              <span className="plan-step-num" aria-hidden="true">
                {i + 1}
              </span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section showcase" style={{ paddingTop: 0 }}>
        <div className="showcase-photos">
          <figure>
            <img src={photo("Butt_Lift_Bridge", 0)} alt="Glute bridge, starting position: lying on the back, knees bent" loading="lazy" />
            <figcaption>Start</figcaption>
          </figure>
          <figure>
            <img src={photo("Butt_Lift_Bridge", 1)} alt="Glute bridge, finishing position: hips lifted off the mat" loading="lazy" />
            <figcaption>Finish</figcaption>
          </figure>
        </div>
        <div>
          <h2>Know exactly what to do</h2>
          <p>Every exercise in your plan comes with what you need to do it right at home.</p>
          <ul className="check-list">
            <li>
              <Check size={18} /> Start and finish photos for each move
            </li>
            <li>
              <Check size={18} /> Numbered steps, and the exact sets, reps or hold time
            </li>
            <li>
              <Check size={18} /> One line on why it suits you and your goal
            </li>
            <li>
              <Check size={18} /> A daily check-in that adjusts the plan as your pain changes
            </li>
          </ul>
        </div>
      </section>

      <div className="band-alt">
        <section className="section">
          <div className="section-head">
            <div>
              <h2>The rulebook</h2>
              <p>
                Your answers set the limits before any exercise is chosen. They can only lower the starting numbers,
                and the AI picks exercises inside whatever is left.
              </p>
            </div>
            <span className="eyebrow">{RULES.length} rules</span>
          </div>

          <div className="table-scroll">
            <table className="rulebook">
              <thead>
                <tr>
                  <th scope="col">If</th>
                  <th scope="col">Most sets</th>
                  <th scope="col">Most reps</th>
                  <th scope="col">Longest hold</th>
                  <th scope="col">Exercises</th>
                  <th scope="col">Allowed</th>
                </tr>
              </thead>
              <tbody>
                <tr className="baseline">
                  <RuleCells rule={BASELINE} />
                </tr>
                {RULES.map((rule) => (
                  <tr key={rule.when}>
                    <RuleCells rule={rule} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">When more than one rule applies, the lowest number wins.</p>

          <div className="safety-notes">
            <div>
              <h3>Before the rules</h3>
              <p>
                Warning signs like numbness, fever or a recent fall stop the questionnaire. You&apos;re pointed to a
                doctor instead of getting a plan.
              </p>
            </div>
            <div>
              <h3>After the AI</h3>
              <p>
                Every plan is checked against these limits before it&apos;s saved. One that breaks a limit or says to
                push through pain is never shown.
              </p>
            </div>
          </div>
          <p className="sources">Sources: AAOS · APTA · ACSM</p>
        </section>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Start with where it hurts.</h2>
          <span className="eyebrow">10 areas · 700+ exercises</span>
        </div>
        <ul className="card-grid region-grid plain-list">
          {REGIONS.map((region) => (
            <li key={region.name}>
              <PhotoCard
                href="/account?mode=sign_up"
                photo={photo(region.id)}
                chip={region.example}
                title={region.name}
              />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

// -------------------------------------------------------------- Dashboard

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

  //The plan and how far into it, once that's known.
  const heading =
    current !== null
      ? `${regionLabel(current.muscle)} plan, day ${planDay(current.createdAt)}`
      : plans !== null
        ? `Welcome, ${user.username}`
        : "Today";

  return (
    <main className="page">
      <div className="dash-hero">
        <div>
          <span className="eyebrow">
            {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
          </span>
          <h1>{heading}</h1>
        </div>
        <Link className="btn btn-small" href="/onboarding">
          <Plus size={16} /> New plan
        </Link>
      </div>

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {!error && plans === null && <Loading />}

      {plans !== null && current === null && (
        <section className="card empty-state">
          <span className="feature-icon">
            <Activity size={26} />
          </span>
          <h2>Build your first plan</h2>
          <p className="muted" style={{ maxWidth: 420, margin: "0 auto 20px" }}>
            Answer a few short questions about what hurts and what you have to train with. It takes about two
            minutes.
          </p>
          <Link className="btn btn-primary btn-large" href="/onboarding">
            Start the questionnaire <ArrowRight size={18} />
          </Link>
        </section>
      )}

      {current !== null && (
        <>
          <div style={{ marginBottom: 16 }}>
            <PhotoCard
              wide
              href={`/plans/${current.id}`}
              photo={current.regime[0] ? imageUrls(current.regime[0].id)[1] : null}
              chip="Your current plan"
              title={`${regionLabel(current.muscle)} plan`}
              meta={<PlanMeta plan={current} />}
            />
          </div>

          {current.regime.length > 0 && <WorkoutStart token={token} plan={current} />}

          <PainTracker token={token} planId={current.id} />

          {others.length > 0 && (
            <section>
              <div className="section-title">
                <h2>Earlier plans</h2>
                <Link className="small" href="/plans">
                  See all
                </Link>
              </div>
              <ul className="card-grid plain-list">
                {others.map((plan) => (
                  <li key={plan.id}>
                    <PhotoCard
                      href={`/plans/${plan.id}`}
                      photo={plan.regime[0] ? imageUrls(plan.regime[0].id)[1] : null}
                      title={regionLabel(plan.muscle)}
                      meta={<PlanMeta plan={plan} />}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
