"use client";

//The daily workout reminder: morning, noon, evening or none. Saved the moment
//one is tapped - that tap is also what lets the browser ask for permission -
//so it isn't part of the questionnaire's answers. Used on the questionnaire's
//last step and on the profile page.

import { useEffect, useState } from "react";
import { Choices, ErrorMessage, Loading } from "@/components/ui";
import { deleteReminder, getReminder, messageOf, saveReminder, sendTestReminder } from "@/lib/api";
import { REMINDER_LABELS, REMINDER_TIMES, pushSupported, subscribeThisBrowser, timeZone, type ReminderSlot } from "@/lib/push";

type Choice = ReminderSlot | "off";

const OPTIONS: Record<Choice, string> = { ...REMINDER_LABELS, off: "No reminders" };

type State =
  | { status: "loading" }
  | { status: "unsupported" }
  | { status: "off_on_server" }
  | { status: "ready"; publicKey: string; choice: Choice; zone: string | null };

export function ReminderPicker({ token, showTest = false }: { token: string; showTest?: boolean }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tested, setTested] = useState(false);

  useEffect(() => {
    if (!pushSupported()) {
      setState({ status: "unsupported" });
      return;
    }

    let cancelled = false;

    getReminder(token)
      .then(({ reminder, publicKey }) => {
        if (cancelled) return;
        setState(
          publicKey === null
            ? { status: "off_on_server" }
            : { status: "ready", publicKey, choice: reminder?.slot ?? "off", zone: reminder?.timeZone ?? null }
        );
      })
      .catch((e) => {
        if (!cancelled) setError(messageOf(e));
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function pick(choice: Choice) {
    if (state.status !== "ready" || busy) return;

    setBusy(true);
    setError(null);
    setTested(false);

    try {
      if (choice === "off") {
        await deleteReminder(token);
        setState({ ...state, choice, zone: null });
      } else {
        //First, while this is still the click: it asks for permission.
        const subscription = await subscribeThisBrowser(state.publicKey);
        const saved = await saveReminder(token, choice, timeZone(), subscription);
        setState({ ...state, choice, zone: saved.reminder?.timeZone ?? null });
      }
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setError(null);

    try {
      await sendTestReminder(token);
      setTested(true);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  if (state.status === "unsupported") {
    return <p className="muted small">This browser can&apos;t show notifications, so reminders aren&apos;t available here.</p>;
  }

  if (state.status === "off_on_server") {
    return <p className="muted small">Reminders aren&apos;t switched on for this server yet.</p>;
  }

  if (state.status === "loading") {
    return error ? <ErrorMessage>{error}</ErrorMessage> : <Loading />;
  }

  const on = state.choice !== "off";

  return (
    <>
      <Choices options={OPTIONS} selected={[state.choice]} onPick={pick} disabled={busy} />

      {on && !error && (
        <p className="success small">
          You&apos;ll get a notification every day at {REMINDER_TIMES[state.choice as ReminderSlot]}
          {state.zone && state.zone !== timeZone() ? ` (${state.zone} time)` : ""}, while Rebound&apos;s server is
          running.
        </p>
      )}

      {error && <ErrorMessage>{error}</ErrorMessage>}

      {showTest && on && (
        <div className="row">
          <button type="button" className="btn" onClick={test} disabled={busy}>
            Send a test notification
          </button>
          {tested && <span className="muted small">Sent - it should pop up in a few seconds.</span>}
        </div>
      )}
    </>
  );
}
