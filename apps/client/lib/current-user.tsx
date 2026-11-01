"use client";

// The logged-in account, shared by every page. Mounted once in app/layout.tsx.
//
// Logged in means holding a session token from the server. On load the token
// is checked against the server, because it may have expired, been logged out
// from another tab, or belong to an account deleted since.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ApiError, getMe, logOut, messageOf, type Session, type User } from "@/lib/api";
import { KEYS, read, remove, write } from "@/lib/storage";

type State =
  | { status: "loading" }
  | { status: "none" }
  | { status: "ready"; user: User; token: string }
  // The server couldn't be asked. The stored token is kept: it may be fine.
  | { status: "error"; message: string };

type CurrentUser = {
  state: State;
  // After signing up or logging in.
  signIn: (session: Session) => void;
  // Ends the session on the server too. Also what to call after deleting the
  // account, when there is no session left to end - that failure is ignored.
  signOut: () => Promise<void>;
};

const Context = createContext<CurrentUser | null>(null);

// A half-finished questionnaire belongs to whoever started it, so logging in
// or out throws the draft away.
function forget() {
  remove("local", KEYS.token);
  remove("session", KEYS.draft);
}

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    // Left over from before passwords, when this id alone was a login.
    remove("local", KEYS.legacyUserId);

    const token = read("local", KEYS.token);

    if (token === null) {
      setState({ status: "none" });
      return;
    }

    let cancelled = false;

    getMe(token)
      .then((user) => {
        if (!cancelled) setState({ status: "ready", user, token });
      })
      .catch((error) => {
        if (cancelled) return;

        // Expired, logged out elsewhere, or the account is gone: log in again.
        if (error instanceof ApiError && error.status === 401) {
          forget();
          setState({ status: "none" });
          return;
        }

        setState({ status: "error", message: messageOf(error) });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(({ user, token }: Session) => {
    forget();
    write("local", KEYS.token, token);
    setState({ status: "ready", user, token });
  }, []);

  const signOut = useCallback(async () => {
    const token = read("local", KEYS.token);

    forget();
    setState({ status: "none" });

    // After forgetting it locally, so a dead server can't keep anyone logged in.
    if (token !== null) {
      await logOut(token).catch(() => undefined);
    }
  }, []);

  return <Context.Provider value={{ state, signIn, signOut }}>{children}</Context.Provider>;
}

export function useCurrentUser(): CurrentUser {
  const value = useContext(Context);

  if (value === null) {
    throw new Error("useCurrentUser must be used inside CurrentUserProvider");
  }

  return value;
}

// For pages that need an account: the user and token once known, and a
// redirect to /account when logged out. Null while loading or redirecting.
export function useRequiredUser(): { user: User | null; token: string | null; error: string | null } {
  const { state } = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "none") {
      router.replace("/account");
    }
  }, [state.status, router]);

  return {
    user: state.status === "ready" ? state.user : null,
    token: state.status === "ready" ? state.token : null,
    error: state.status === "error" ? state.message : null,
  };
}
