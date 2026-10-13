"use client";

//this is the outcome of one saved questionnaire, read from the server by id so
//it survives a refresh. One page with three screens, chosen by `outcome` -
//never by the HTTP status, and never by anything the client works out itself.
//The "ready" screen also builds the plan.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AccountError, BackLink, ErrorMessage, Loading } from "@/components/ui";
import {
  ApiError,
  createRegimeFromOnboarding,
  getOnboarding,
  messageOf,
  type OnboardingResult,
  type Screening,
} from "@/lib/api";
import { useRequiredUser } from "@/lib/current-user";
import { RED_FLAGS, type RedFlag } from "@/lib/questionnaire";

type Load = { status: "loading" } | { status: "missing" } | { status: "error"; message: string } | { status: "loaded"; result: OnboardingResult };

export default function OutcomePage() {
  const { id } = useParams<{ id: string }>();
  const { user, error: accountError } = useRequiredUser();
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    getOnboarding(user.id, id)
      .then((result) => {
        if (!cancelled) setLoad({ status: "loaded", result });
      })
      .catch((e) => {
        if (cancelled) return;
        //Unknown, or another account's: the server answers both with a 404.
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

  if (load.status === "missing") {
    return (
      <main className="page">
        <h1>We couldn&apos;t find those results</h1>
        <p className="lead">They may belong to a different account, or have been deleted.</p>
        <Link className="btn btn-primary" href="/onboarding">
          Start a new questionnaire
        </Link>
      </main>
    );
  }

  if (load.status === "error") {
    return (
      <main className="page">
        <ErrorMessage>{load.message}</ErrorMessage>
        <Link className="btn" href="/plans">
          Back to my plans
        </Link>
      </main>
    );
  }

  const { result } = load;

  //Each outcome is its own screen. Crisis is never folded into see-a-doctor:
  //they are different situations and need different help.
  if (result.outcome === "crisis") return <CrisisScreen />;
  if (result.outcome === "see_a_doctor") return <SeeADoctorScreen result={result} />;
  return <ReadyScreen result={result} userId={user.id} />;
}

// Crisis support first, and nothing about exercise or doctors.
//
// TODO before shipping: confirm these numbers, the wording and which countries
// they cover, and get sign-off on it. 988 and Crisis Text Line are US services
// (named in USERFLOW.md); findahelpline.com covers other countries.
function CrisisScreen() {
  return (
    <main className="page">
      <section className="card crisis">
        <h1>You don&apos;t have to go through this alone</h1>
        <p>
          It sounds like things are really hard right now. Talking to someone can help, and support is available
          any time, day or night.
        </p>

        <ul className="stack" style={{ paddingLeft: 20 }}>
          <li>
            <strong>Call or text 988</strong> — the Suicide &amp; Crisis Lifeline (US). Free and confidential, 24/7.
          </li>
          <li>
            <strong>Text HOME to 741741</strong> — Crisis Text Line (US).
          </li>
          <li>
            Outside the US, find a helpline near you at{" "}
            <a href="https://findahelpline.com" target="_blank" rel="noreferrer">
              findahelpline.com
            </a>
            .
          </li>
          <li>
            If you are in immediate danger, call <strong>911</strong> or your local emergency number.
          </li>
        </ul>
      </section>

      <Link className="btn" href="/">
        Back to home
      </Link>
    </main>
  );
}

function SeeADoctorScreen({ result }: { result: Extract<OnboardingResult, { outcome: "see_a_doctor" }> }) {
  const flags = result.redFlags.filter((f): f is RedFlag => f in RED_FLAGS);

  return (
    <main className="page">
      <BackLink href="/plans">My plans</BackLink>
      <h1>Please see a doctor or physio first</h1>
      <p className="lead">
        From your answers, an exercise plan isn&apos;t safe to give you without a professional checking you first.
        This isn&apos;t a diagnosis, just a precaution.
      </p>

      {flags.length > 0 && (
        <section className="card">
          <h2>What you told us</h2>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {flags.map((f) => (
              <li key={f}>
                {RED_FLAGS[f]} <strong>Yes</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.noteQuote && (
        <section className="card">
          <h2>From your note</h2>
          <p style={{ margin: 0 }}>“{result.noteQuote}”</p>
        </section>
      )}

      <p className="muted">
        Once you&apos;ve been checked and given the all-clear, you can come back and fill in the questionnaire again.
      </p>

      <div className="row">
        <Link className="btn btn-primary" href="/onboarding">
          Answer again
        </Link>
        <Link className="btn" href="/plans">
          My plans
        </Link>
      </div>
    </main>
  );
}

// Status lines for the wait. Purely cosmetic: they cycle on a timer and say
// nothing about how far the server has actually got.
const BUILDING_STEPS = ["Reviewing your goals…", "Choosing exercises that fit…", "Drafting your plan…", "Almost there…"];

type Build =
  | { status: "idle" }
  | { status: "building" }
  //409: no plan can come from these answers. Retrying won't help.
  | { status: "refused"; message: string }
  //503 or anything unexpected: nothing was saved, and trying again may work.
  | { status: "failed"; message: string }
  //404: the questionnaire went away (or isn't this account's).
  | { status: "missing" };

function ReadyScreen({
  result,
  userId,
}: {
  result: Extract<OnboardingResult, { outcome: "ready" }>;
  userId: string;
}) {
  const router = useRouter();
  const [build, setBuild] = useState<Build>({ status: "idle" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (build.status !== "building") return;

    setTick(0);
    const timer = window.setInterval(() => setTick((t) => Math.min(t + 1, BUILDING_STEPS.length - 1)), 5000);
    return () => window.clearInterval(timer);
  }, [build.status]);

  //Only ever from a click, never from an effect on load: React strict mode runs
  //effects twice in development, and that would build two plans. The button
  //is disabled while this runs for the same reason.
  async function buildPlan() {
    if (build.status === "building") return;

    setBuild({ status: "building" });

    try {
      const plan = await createRegimeFromOnboarding(userId, result.id);
      router.push(`/plans/${plan.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setBuild({ status: "refused", message: e.message });
      } else if (e instanceof ApiError && e.status === 404) {
        setBuild({ status: "missing" });
      } else if (e instanceof ApiError && e.status === 503) {
        setBuild({ status: "failed", message: "We couldn't build your plan right now. Nothing was saved." });
      } else {
        setBuild({ status: "failed", message: messageOf(e) });
      }
    }
  }

  return (
    <main className="page">
      <BackLink href="/plans">My plans</BackLink>
      <h1>You&apos;re ready for a plan</h1>
      <p className="lead">We&apos;ll keep it within these limits, based on your answers.</p>

      <ScreeningNote screening={result.screening} />

      <section className="card">
        <h2>What we&apos;re taking into account</h2>
        {result.limits.reasons.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nothing in your answers needs extra caution.
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {result.limits.reasons.map((reason) => (
              <li key={reason}>Because {reason}.</li>
            ))}
          </ul>
        )}
      </section>

      {build.status === "building" && (
        <p className="muted" aria-live="polite">
          {BUILDING_STEPS[tick]} This can take up to 40 seconds.
        </p>
      )}

      {build.status === "refused" && (
        <>
          <ErrorMessage>{build.message}</ErrorMessage>
          <p className="muted">Try answering the questionnaire again with different options, such as more equipment.</p>
          <Link className="btn btn-primary" href="/onboarding">
            Edit my answers
          </Link>
        </>
      )}

      {build.status === "missing" && (
        <>
          <ErrorMessage>We couldn&apos;t find these answers any more.</ErrorMessage>
          <Link className="btn btn-primary" href="/onboarding">
            Start a new questionnaire
          </Link>
        </>
      )}

      {build.status === "failed" && <ErrorMessage>{build.message}</ErrorMessage>}

      {(build.status === "idle" || build.status === "building" || build.status === "failed") && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={buildPlan}
          disabled={build.status === "building"}
        >
          {build.status === "building" ? "Building…" : build.status === "failed" ? "Try again" : "Build my plan"}
        </button>
      )}
    </main>
  );
}

// Only "unavailable" needs a word: the note couldn't be checked, so it went
// through unscreened (ADR 0021). Gentle, and it doesn't block anything.
function ScreeningNote({ screening }: { screening: Screening }) {
  if (screening !== "unavailable") return null;

  return (
    <p className="notice">We couldn&apos;t review your note, so your plan is based on your answers to the questions.</p>
  );
}
