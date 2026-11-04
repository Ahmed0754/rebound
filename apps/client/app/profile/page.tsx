"use client";

//this is the profile page: the logged-in account, a summary of its plans, and
//everything that manages the account - password, logging out, deleting it.
///account is only for logging in; once logged in, this is where it lives.

import { useEffect, useState } from "react";
import Link from "next/link";
import { AccountError, ErrorMessage, Loading } from "@/components/ui";
import {
  changePassword,
  deleteMe,
  listRegimes,
  logOutEverywhere,
  messageOf,
  type Regime,
} from "@/lib/api";
import { useCurrentUser, useRequiredUser } from "@/lib/current-user";
import { regionLabel } from "@/lib/questionnaire";
import { KEYS, remove } from "@/lib/storage";

export default function ProfilePage() {
  const { user, token, error: accountError } = useRequiredUser();
  const { signOut } = useCurrentUser();

  const [plans, setPlans] = useState<Regime[] | null>(null);
  const [plansError, setPlansError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    listRegimes(token)
      .then((list) => {
        if (!cancelled) setPlans(list);
      })
      .catch((e) => {
        if (!cancelled) setPlansError(messageOf(e));
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  //Every session goes, this one included, so this device logs out locally too.
  async function logOutAll() {
    if (!token) return;
    if (!window.confirm("Log out on every device, including this one?")) return;

    setBusy(true);
    setError(null);

    try {
      await logOutEverywhere(token);
      await signOut();
    } catch (e) {
      setError(messageOf(e));
      setBusy(false);
    }
  }

  //The database cascades this to every plan and questionnaire the account
  //owns, so it is confirmed first.
  async function removeAccount() {
    if (!user || !token) return;

    const ok = window.confirm(
      `Delete "${user.username}"? This also deletes all of its plans and questionnaires, and can't be undone.`
    );
    if (!ok) return;

    setBusy(true);
    setError(null);

    try {
      await deleteMe(token);
      remove("local", KEYS.lastOnboarding(user.id));
      await signOut();
    } catch (e) {
      setError(messageOf(e));
      setBusy(false);
    }
  }

  if (accountError) {
    return (
      <main className="page">
        <AccountError message={accountError} />
      </main>
    );
  }

  if (!user || !token) {
    return (
      <main className="page">
        <Loading />
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Profile</h1>

      {error && <ErrorMessage>{error}</ErrorMessage>}

      <section className="card">
        <div className="exercise-name">{user.username}</div>
        <div className="muted small">
          Member since {new Date(user.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Your plans</h2>
        {plansError && <ErrorMessage>{plansError}</ErrorMessage>}
        {!plansError && plans === null && <Loading />}
        {plans !== null && <PlansSummary plans={plans} />}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Change password</h2>
        <PasswordForm token={token} />
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Logging out</h2>
        <p className="muted small">
          Logging out everywhere ends every session this account has, on every device, including this one.
        </p>
        <div className="row">
          <button type="button" className="btn" onClick={signOut} disabled={busy}>
            Log out
          </button>
          <button type="button" className="btn" onClick={logOutAll} disabled={busy}>
            Log out everywhere
          </button>
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Delete account</h2>
        <p className="muted small">Deletes this account and all of its plans and questionnaires. There is no undo.</p>
        <button type="button" className="btn btn-danger" onClick={removeAccount} disabled={busy}>
          Delete this account
        </button>
      </section>
    </main>
  );
}

//How many plans, for which body areas, and the newest one. The list comes
//back newest first.
function PlansSummary({ plans }: { plans: Regime[] }) {
  if (plans.length === 0) {
    return (
      <>
        <p className="muted">You don&apos;t have any plans yet.</p>
        <Link className="btn btn-primary" href="/onboarding">
          Answer a few questions to get one
        </Link>
      </>
    );
  }

  const regions = [...new Set(plans.map((plan) => regionLabel(plan.muscle)))];
  const latest = plans[0];

  return (
    <>
      <p style={{ marginTop: 0 }}>
        {plans.length} plan{plans.length === 1 ? "" : "s"} · {regions.join(", ")}
      </p>
      <p className="small">
        Latest:{" "}
        <Link href={`/plans/${latest.id}`}>
          {regionLabel(latest.muscle)}, made {new Date(latest.createdAt).toLocaleDateString()}
        </Link>
      </p>
      <Link className="btn" href="/plans">
        See all plans
      </Link>
    </>
  );
}

//Changing the password logs out every other device on the server; this one
//stays logged in, so there is nothing to update here afterwards.
function PasswordForm({ token }: { token: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setError(null);
    setDone(false);

    //Checked here only because the server never sees the confirmation.
    if (next !== confirm) {
      setError("The new passwords don't match.");
      return;
    }

    setBusy(true);

    try {
      await changePassword(token, current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="field">
        <span className="field-label">Current password</span>
        <input
          className="input"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      <label className="field">
        <span className="field-label">New password</span>
        <input
          className="input"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      <label className="field">
        <span className="field-label">New password again</span>
        <input
          className="input"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      <button type="submit" className="btn btn-primary" disabled={busy || !current || !next || !confirm}>
        {busy ? "Changing…" : "Change password"}
      </button>

      {/*Under the button, where the eye already is after pressing it.*/}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {done && (
        <p className="success" role="status">
          ✓ Password changed. Any other devices were logged out.
        </p>
      )}
    </form>
  );
}
