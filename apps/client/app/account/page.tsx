"use client";

//this is the account page: log in or sign up. Once logged in, the account is
//managed from /profile, so a logged-in visitor is sent there.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorMessage, Loading } from "@/components/ui";
import { logIn, messageOf, signUp } from "@/lib/api";
import { useCurrentUser } from "@/lib/current-user";

type Mode = "log_in" | "sign_up";

export default function AccountPage() {
  const { state, signIn } = useCurrentUser();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("log_in");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  //Not while `busy`: that is a login this page just made, and `submit` is
  //already sending it on to the questionnaire or the plans.
  useEffect(() => {
    if (state.status === "ready" && !busy) {
      router.replace("/profile");
    }
  }, [state.status, busy, router]);

  async function submit() {
    setBusy(true);
    setError(null);

    try {
      //The server's message is shown as-is: it is more specific than anything
      //this page would say, and for a failed login it deliberately doesn't say
      //whether it was the username or the password.
      const session = mode === "sign_up" ? await signUp(username, password) : await logIn(username, password);

      signIn(session);
      //A new account has no plans yet, so it goes straight to the questionnaire.
      router.push(mode === "sign_up" ? "/onboarding" : "/plans");
    } catch (e) {
      setError(messageOf(e));
      setBusy(false);
    }
  }

  function switchTo(next: Mode) {
    setMode(next);
    setError(null);
  }

  //Ready too: that is the moment before a redirect lands.
  if (state.status === "loading" || state.status === "ready") {
    return (
      <main className="page">
        <Loading />
      </main>
    );
  }

  const signingUp = mode === "sign_up";

  return (
    <main className="page">
      <h1>{signingUp ? "Create an account" : "Log in"}</h1>

      {state.status === "error" && <ErrorMessage>{state.message}</ErrorMessage>}
      {error && <ErrorMessage>{error}</ErrorMessage>}

      <section className="card">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="field">
            <span className="field-label">Username</span>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              //Tells password managers whether to offer a saved password or generate a new one.
              autoComplete={signingUp ? "new-password" : "current-password"}
              minLength={signingUp ? 8 : undefined}
              required
            />
          </label>
          {signingUp && (
            <p className="muted small">
              Username: 3–30 characters, lowercase letters, numbers and underscores. Password: at least 8 characters.
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy || !username.trim() || !password}>
            {signingUp ? "Create account" : "Log in"}
          </button>
        </form>
      </section>

      <p className="muted">
        {signingUp ? "Already have an account? " : "New here? "}
        <button type="button" className="link-button" onClick={() => switchTo(signingUp ? "log_in" : "sign_up")}>
          {signingUp ? "Log in" : "Create an account"}
        </button>
      </p>
    </main>
  );
}
