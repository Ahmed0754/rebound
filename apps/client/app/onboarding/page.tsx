"use client";

//this is the questionnaire: four steps held in client state and submitted ONCE
//at the end. The server takes the whole thing in one request - there is no
//partial save - so the draft is kept in sessionStorage to survive a refresh.

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AccountError, BackLink, Choices, ErrorMessage, Loading } from "@/components/ui";
import { createOnboarding, listRegions, messageOf } from "@/lib/api";
import { useRequiredUser } from "@/lib/current-user";
import {
  ACTIVITY_LEVELS,
  AGE_BANDS,
  AGGRAVATORS,
  CONDITIONS,
  EMPTY_DRAFT,
  EQUIPMENT,
  GOALS,
  NOTE_LIMIT,
  ONSETS,
  RED_FLAGS,
  SESSION_MINUTES,
  STEPS,
  missingOn,
  regionLabel,
  toAnswers,
  toggle,
  toggleEquipment,
  type Draft,
  type RedFlag,
} from "@/lib/questionnaire";
import { KEYS, read, remove, write } from "@/lib/storage";

type Saved = { step: number; draft: Draft };

const PAIN_LEVELS = Array.from({ length: 11 }, (_, i) => i);

export default function OnboardingPage() {
  const { user, token, error: accountError } = useRequiredUser();
  const router = useRouter();

  const [regions, setRegions] = useState<string[] | null>(null);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  //Storage is read after mount, not during render: the server render has no
  //storage, and reading it there would mismatch on hydration. Nothing is
  //written back until it has been read, so the empty draft can't overwrite it.
  const [restored, setRestored] = useState(false);
  //Shown only after a Next/Submit with something missing, not while typing.
  const [missing, setMissing] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = read("session", KEYS.draft);

    if (stored !== null) {
      try {
        const saved = JSON.parse(stored) as Saved;
        setDraft({ ...EMPTY_DRAFT, ...saved.draft });
        setStep(Math.min(Math.max(saved.step, 0), STEPS.length - 1));
      } catch {
        remove("session", KEYS.draft);
      }
    }

    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) write("session", KEYS.draft, JSON.stringify({ step, draft } satisfies Saved));
  }, [restored, step, draft]);

  //Fetched, not hard-coded: the region list lives in the database.
  useEffect(() => {
    listRegions()
      .then(setRegions)
      .catch((e) => setError(messageOf(e)));
  }, []);

  function update(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patch }));
    setMissing(null);
  }

  function next() {
    const problem = missingOn(step, draft);
    if (problem) {
      setMissing(problem);
      return;
    }

    setMissing(null);
    setStep((s) => s + 1);
    window.scrollTo(0, 0);
  }

  function back() {
    setMissing(null);
    setStep((s) => s - 1);
    window.scrollTo(0, 0);
  }

  async function submit() {
    if (!user || !token || submitting) return;

    const answers = toAnswers(draft);

    if (answers === null) {
      //Only reachable if storage held a half-filled draft past its step;
      //send them to the first step that is incomplete.
      const first = STEPS.findIndex((_, i) => missingOn(i, draft) !== null);
      setStep(first);
      setMissing(missingOn(first, draft));
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await createOnboarding(token, answers, draft.freeText);

      remove("session", KEYS.draft);
      write("local", KEYS.lastOnboarding(user.id), result.id);
      router.push(`/onboarding/${result.id}`);
    } catch (e) {
      setError(messageOf(e));
      setSubmitting(false);
    }
  }

  if (accountError) {
    return (
      <main className="page">
        <AccountError message={accountError} />
      </main>
    );
  }

  if (!user || !restored) {
    return (
      <main className="page">
        <Loading />
      </main>
    );
  }

  const noteLength = draft.freeText.trim().length;
  const last = step === STEPS.length - 1;

  return (
    <main className="page">
      <BackLink href="/plans">My plans</BackLink>

      <div className="steps" aria-hidden>
        {STEPS.map((name, i) => (
          <span key={name} className={i <= step ? "done" : undefined} />
        ))}
      </div>

      <p className="muted small" style={{ margin: "0 0 4px" }}>
        Step {step + 1} of {STEPS.length}
      </p>
      <h1>{STEPS[step]}</h1>

      {step === 0 && (
        <>
          <p className="lead">Tell us where it hurts and what you want out of this.</p>

          <Field label="Where does it hurt?">
            {regions === null ? (
              <Loading label="Loading body areas…" />
            ) : (
              <Choices
                options={Object.fromEntries(regions.map((r) => [r, regionLabel(r)]))}
                selected={draft.region ? [draft.region] : []}
                onPick={(region) => update({ region })}
              />
            )}
          </Field>

          <Field label="What's your main goal?">
            <Choices
              options={GOALS}
              selected={draft.goal ? [draft.goal] : []}
              onPick={(goal) => update({ goal })}
            />
          </Field>

          <Field label="When did it start?">
            <Choices
              options={ONSETS}
              selected={draft.onset ? [draft.onset] : []}
              onPick={(onset) => update({ onset })}
            />
          </Field>

          <Field label="How bad is the pain right now?">
            <div className="pain-scale">
              {PAIN_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  className="choice"
                  aria-pressed={draft.painNow === level}
                  aria-label={`Pain ${level} out of 10`}
                  onClick={() => update({ painNow: level })}
                >
                  {level}
                </button>
              ))}
            </div>
            <div className="pain-ends">
              <span>No pain</span>
              <span>Worst imaginable</span>
            </div>
          </Field>
        </>
      )}

      {step === 1 && (
        <>
          <p className="lead">
            A few questions to check an exercise plan is right for you. Please answer each one honestly.
          </p>

          <section className="card">
            {(Object.entries(RED_FLAGS) as [RedFlag, string][]).map(([flag, question]) => (
              <div key={flag} className="question">
                <p>{question}</p>
                <Choices
                  options={{ yes: "Yes", no: "No" }}
                  selected={draft.redFlags[flag] === undefined ? [] : [draft.redFlags[flag] ? "yes" : "no"]}
                  onPick={(answer) => update({ redFlags: { ...draft.redFlags, [flag]: answer === "yes" } })}
                />
              </div>
            ))}
          </section>

          <Field label="Do you have any of these conditions?">
            <p className="muted small" style={{ margin: "-4px 0 8px" }}>
              Tick any that apply, or leave them all blank.
            </p>
            <Choices
              options={CONDITIONS}
              selected={draft.conditions}
              onPick={(c) => update({ conditions: toggle(draft.conditions, c) })}
            />
          </Field>
        </>
      )}

      {step === 2 && (
        <>
          <p className="lead">This helps us pitch the plan at the right level.</p>

          <Field label="How old are you?">
            <Choices
              options={AGE_BANDS}
              selected={draft.ageBand ? [draft.ageBand] : []}
              onPick={(ageBand) => update({ ageBand })}
            />
          </Field>

          <Field label="How active are you usually?">
            <Choices
              options={ACTIVITY_LEVELS}
              selected={draft.activityLevel ? [draft.activityLevel] : []}
              onPick={(activityLevel) => update({ activityLevel })}
            />
          </Field>

          <Field label="What equipment do you have?">
            <Choices
              options={EQUIPMENT}
              selected={draft.equipment}
              onPick={(e) => update({ equipment: toggleEquipment(draft.equipment, e) })}
            />
          </Field>

          <Field label="How long do you want each session to be?">
            <Choices
              options={SESSION_MINUTES}
              selected={draft.sessionMinutes ? [draft.sessionMinutes] : []}
              onPick={(sessionMinutes) => update({ sessionMinutes })}
            />
          </Field>

          <Field label="Does anything make it worse?">
            <p className="muted small" style={{ margin: "-4px 0 8px" }}>
              Tick any that apply, or leave them all blank.
            </p>
            <Choices
              options={AGGRAVATORS}
              selected={draft.aggravators}
              onPick={(a) => update({ aggravators: toggle(draft.aggravators, a) })}
            />
          </Field>
        </>
      )}

      {step === 3 && (
        <>
          <p className="lead">Optional. Add anything the questions didn&apos;t cover.</p>

          <label className="field">
            <span className="field-label">Your note</span>
            <textarea
              className="textarea"
              rows={5}
              value={draft.freeText}
              onChange={(e) => update({ freeText: e.target.value })}
              placeholder="Anything else we should know?"
              disabled={submitting}
            />
            <span
              className="small"
              style={{ color: noteLength > NOTE_LIMIT ? "var(--danger)" : "var(--faint)" }}
              aria-live="polite"
            >
              {noteLength}/{NOTE_LIMIT}
            </span>
          </label>
        </>
      )}

      {missing && <ErrorMessage>{missing}</ErrorMessage>}
      {error && <ErrorMessage>{error}</ErrorMessage>}

      {submitting && (
        <p className="muted" aria-live="polite">
          {draft.freeText.trim()
            ? "Reviewing your answers… this can take up to 40 seconds."
            : "Saving your answers…"}
        </p>
      )}

      <div className="row" style={{ marginTop: 24 }}>
        {step > 0 && (
          <button type="button" className="btn" onClick={back} disabled={submitting}>
            Back
          </button>
        )}
        {last ? (
          <button type="button" className="btn btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? "Submitting…" : "See my results"}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={next}>
            Next
          </button>
        )}
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
    </div>
  );
}
