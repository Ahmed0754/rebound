"use client";

//this is the account page: create an account, pick an existing one, or
//delete the current one. Test accounts only - no password, no login.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorMessage, Loading } from "@/components/ui";
import { createUser, deleteUser, listUsers, messageOf, type User } from "@/lib/api";
import { useCurrentUser } from "@/lib/current-user";
import { KEYS, remove } from "@/lib/storage";

export default function AccountPage() {
  const { state, select, clear } = useCurrentUser();
  const router = useRouter();
  const current = state.status === "ready" ? state.user : null;

  //null until the first load lands, so "no accounts yet" isn't shown early.
  const [users, setUsers] = useState<User[] | null>(null);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch((e) => setError(messageOf(e)));
  }, []);

  //Picking an account goes home, which sends it on to its plans or to the
  //questionnaire.
  function choose(user: User) {
    select(user);
    router.push("/");
  }

  async function create() {
    const name = username.trim();
    if (!name) return;

    setBusy(true);
    setError(null);

    try {
      //The server's 400/409 message is shown as-is: it is more specific than
      //anything this page would say.
      choose(await createUser(name));
    } catch (e) {
      setError(messageOf(e));
      setBusy(false);
    }
  }

  //The database cascades this to every plan and questionnaire the account
  //owns, so it is confirmed first.
  async function removeCurrent() {
    if (!current) return;

    const ok = window.confirm(
      `Delete "${current.username}"? This also deletes all of its plans and questionnaires, and can't be undone.`
    );
    if (!ok) return;

    setBusy(true);
    setError(null);

    try {
      await deleteUser(current.id);
      remove("local", KEYS.lastOnboarding(current.id));
      clear();
      setUsers((list) => list?.filter((u) => u.id !== current.id) ?? null);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  const others = users?.filter((u) => u.id !== current?.id) ?? [];

  return (
    <main className="page">
      <h1>Account</h1>
      <p className="lead">These are test accounts: no password, and anyone can pick any of them.</p>

      {error && <ErrorMessage>{error}</ErrorMessage>}

      {current && (
        <section className="card">
          <h2>Current account</h2>
          <p style={{ marginTop: 0 }}>
            <strong>{current.username}</strong>
          </p>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => router.push("/")}>
              Continue
            </button>
            <button type="button" className="btn btn-danger" onClick={removeCurrent} disabled={busy}>
              Delete this account
            </button>
          </div>
        </section>
      )}

      <section className="card">
        <h2>Create an account</h2>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <input
            className="input"
            style={{ flex: 1, minWidth: 180 }}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            aria-label="Username"
            autoComplete="off"
          />
          <button type="submit" className="btn btn-primary" disabled={busy || !username.trim()}>
            Create
          </button>
        </form>
        <p className="muted small" style={{ marginBottom: 0 }}>
          3–30 characters: lowercase letters, numbers and underscores.
        </p>
      </section>

      <section className="card">
        <h2>{current ? "Switch to another account" : "Pick an existing account"}</h2>
        {users === null ? (
          <Loading />
        ) : others.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No other accounts yet.
          </p>
        ) : (
          <div className="choices">
            {others.map((u) => (
              <button key={u.id} type="button" className="choice" onClick={() => choose(u)} disabled={busy}>
                {u.username}
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
