"use client";

//this is the home route. Logged out, it is the landing page: what Rebound is,
//how it works, and the way in. Logged in, it is the dashboard: today's
//check-in on the newest plan, and the way to everything else.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, Book, Check, Clock, Plus, Shield, Sliders } from "@/components/icons";
import { PainTracker } from "@/components/pain-tracker";
import { PhotoCard, PlanMeta } from "@/components/photo-card";
import { ErrorMessage, Loading } from "@/components/ui";
import { listRegimes, messageOf, type Regime, type User } from "@/lib/api";
import { useCurrentUser } from "@/lib/current-user";
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

const SAFETY = [
  {
    icon: <Shield />,
    title: "Screened before anything is built",
    text: "Warning signs like numbness, fever or a recent fall stop the questionnaire and point you to a doctor.",
  },
  {
    icon: <Sliders />,
    title: "Limits set by rules, not by AI",
    text: "Nine rules read your answers and cap sets, reps, hold times and difficulty. The AI can only choose inside them.",
  },
  {
    icon: <Book />,
    title: "Checked against published guidance",
    text: "Every plan is checked before it's saved. One that breaks a limit or says to push through pain is never shown.",
  },
];

//A made-up plan drawn with the app's own pieces and real catalogue photos, so
//the hero shows what you get.
const PREVIEW = [
  { id: "Butt_Lift_Bridge", name: "Glute bridge", dose: "3 sets × 12 reps", done: true },
  { id: "Seated_Floor_Hamstring_Stretch", name: "Hamstring stretch", dose: "2 sets × 30s hold", done: true },
  { id: "Kneeling_Hip_Flexor", name: "Kneeling hip flexor", dose: "2 sets × 20s hold", done: false },
];

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

//Each one is counted from the code: the rules and warning signs in the
//server's clinical.ts, the areas the questionnaire offers, the catalogue.
const STATS = [
  { value: "700+", label: "exercises with photos" },
  { value: "10", label: "body areas covered" },
  { value: "9", label: "safety rules on every plan" },
  { value: "2 min", label: "to answer the questions" },
];

const photo = (id: string, frame: 0 | 1 = 1) => imageUrls(id)[frame];

function Landing() {
  return (
    <main className="landing">
      <div className="hero-band">
        <section className="section hero">
          <div>
            <span className="pill">
              <span className="pill-dot" /> Personal recovery plans
            </span>
            <h1>
              Exercises for <em>the part that hurts.</em>
            </h1>
            <p className="lead">
              Answer a two-minute questionnaire and get a short exercise plan built around your pain, your goal and the
              equipment you have. Then check in daily to see if it&apos;s helping.
            </p>
            <div className="row">
              <Link className="btn btn-primary btn-large" href="/account?mode=sign_up">
                Build my plan <ArrowRight size={18} />
              </Link>
              <Link className="btn btn-large" href="/account">
                Log in
              </Link>
            </div>
            <div className="trust-row">
              <span>
                <Check size={16} /> Free
              </span>
              <span>
                <Clock size={16} /> Two minutes
              </span>
              <span>
                <Shield size={16} /> Every plan safety-checked
              </span>
            </div>
          </div>

          <div className="preview">
            <img className="hero-photo" src={photo("Childs_Pose")} alt="Someone doing a child's pose stretch on a mat" />

            <div className="preview-card" aria-hidden="true">
              <div className="preview-head">
                <div>
                  <div className="eyebrow" style={{ marginBottom: 0 }}>
                    Today
                  </div>
                  <div className="preview-title">Knee plan</div>
                </div>
                <span className="trend-chip">2 of 3 done</span>
              </div>
              {PREVIEW.map((item) => (
                <div key={item.name} className="preview-item">
                  <img className="preview-thumb" src={photo(item.id, 0)} alt="" />
                  <div>
                    <div className="preview-name">{item.name}</div>
                    <div className="preview-dose">{item.dose}</div>
                  </div>
                  <span className={item.done ? "preview-check on" : "preview-check"}>
                    {item.done && <Check size={13} />}
                  </span>
                </div>
              ))}
            </div>

            <div className="preview-float" aria-hidden="true">
              <div className="preview-float-top">
                Pain this week <span className="trend-chip">↓ 3</span>
              </div>
              <svg viewBox="0 0 220 64">
                <path className="spark-fill" d="M4 12 L40 18 L76 16 L112 30 L148 38 L184 46 L216 50 L216 64 L4 64 Z" />
                <path className="spark-line" d="M4 12 L40 18 L76 16 L112 30 L148 38 L184 46 L216 50" />
                <circle className="spark-dot" cx="216" cy="50" r="5" />
              </svg>
            </div>
          </div>
        </section>
      </div>

      <section className="section" style={{ paddingTop: 0, paddingBottom: 0 }}>
        <div className="stats-strip">
          {STATS.map((stat) => (
            <div key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <span className="eyebrow">Where does it hurt?</span>
          <h2>A plan for the part that&apos;s bothering you</h2>
          <p>Pick an area in the questionnaire and get exercises chosen for it, from stretches to gentle strength work.</p>
        </div>
        <ul className="card-grid region-grid plain-list">
          {REGIONS.map((region, i) => (
            <li key={region.name}>
              <PhotoCard
                tone={i}
                href="/account?mode=sign_up"
                photo={photo(region.id)}
                chip={`e.g. ${region.example}`}
                title={region.name}
              />
            </li>
          ))}
        </ul>
      </section>

      <div className="band-alt">
        <section className="section">
          <div className="section-head">
            <span className="eyebrow">How it works</span>
            <h2>From &ldquo;it hurts&rdquo; to a plan in four steps</h2>
            <p>No long sign-up, no generic workout. Just the exercises that fit you.</p>
          </div>
          <ol className="steps-grid">
            {HOW_IT_WORKS.map((step, i) => (
              <li key={step.title} className="step-card">
                <div className="step-num">{i + 1}</div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="section showcase">
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
          <span className="eyebrow">Easy to follow</span>
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
        <section className="section split">
          <div>
            <span className="eyebrow">Built around safety</span>
            <h2>AI picks the exercises. Rules decide what&apos;s safe.</h2>
            <p>
              Rebound never lets a model decide how much is too much. Your answers set hard limits first, and every plan
              is checked against them before you see it.
            </p>
            <div className="source-tags">
              <span className="source-tag">AAOS</span>
              <span className="source-tag">APTA</span>
              <span className="source-tag">ACSM</span>
            </div>
          </div>
          <ul className="feature-rows">
            {SAFETY.map((item) => (
              <li key={item.title} className="feature-row">
                <span className="feature-icon">{item.icon}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="section">
        <div className="cta-band">
          <h2>Ready to get moving again?</h2>
          <p>Two minutes of questions. A plan that fits you, and a daily check-in to keep it honest.</p>
          <Link className="btn btn-large" href="/account?mode=sign_up">
            Build my plan <ArrowRight size={18} />
          </Link>
        </div>
      </section>
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
      <div className="dash-hero">
        <div>
          <span className="eyebrow">
            {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
          </span>
          <h1>
            {greeting()}, {user.username}
          </h1>
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
          <h2>Let&apos;s build your first plan</h2>
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
              tone={0}
              wide
              href={`/plans/${current.id}`}
              photo={current.regime[0] ? imageUrls(current.regime[0].id)[1] : null}
              chip="Your current plan"
              title={`${regionLabel(current.muscle)} plan`}
              meta={<PlanMeta plan={current} />}
            />
          </div>

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
                {others.map((plan, i) => (
                  <li key={plan.id}>
                    <PhotoCard
                      tone={i + 1}
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
