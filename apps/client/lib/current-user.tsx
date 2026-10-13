"use client";

// The current account, shared by every page. Mounted once in app/layout.tsx.
//
// "Signed in" is just an id this browser remembers - there is no auth. On load
// the id is checked against the server, because the account may have been
// deleted since (from another tab, or by a teammate on the shared database).

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ApiError, getUser, messageOf, type User } from "@/lib/api";
import { KEYS, read, remove, write } from "@/lib/storage";

type State =
  | { status: "loading" }
  | { status: "none" }
  | { status: "ready"; user: User }
  // The server couldn't be asked. The stored id is kept: the account may be fine.
  | { status: "error"; message: string };

type CurrentUser = {
  state: State;
  select: (user: User) => void;
  clear: () => void;
};

const Context = createContext<CurrentUser | null>(null);

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const storedId = read("local", KEYS.userId);

    if (storedId === null) {
      setState({ status: "none" });
      return;
    }

    let cancelled = false;

    getUser(storedId)
      .then((user) => {
        if (!cancelled) setState({ status: "ready", user });
      })
      .catch((error) => {
        if (cancelled) return;

        // Deleted: forget it, so the next screen is the account picker.
        if (error instanceof ApiError && error.status === 404) {
          remove("local", KEYS.userId);
          setState({ status: "none" });
          return;
        }

        setState({ status: "error", message: messageOf(error) });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // A half-finished questionnaire belongs to whoever started it, so switching
  // or leaving an account throws the draft away.
  const select = useCallback((user: User) => {
    write("local", KEYS.userId, user.id);
    remove("session", KEYS.draft);
    setState({ status: "ready", user });
  }, []);

  const clear = useCallback(() => {
    remove("local", KEYS.userId);
    remove("session", KEYS.draft);
    setState({ status: "none" });
  }, []);

  return <Context.Provider value={{ state, select, clear }}>{children}</Context.Provider>;
}

export function useCurrentUser(): CurrentUser {
  const value = useContext(Context);

  if (value === null) {
    throw new Error("useCurrentUser must be used inside CurrentUserProvider");
  }

  return value;
}

// For pages that need an account: the user once known, and a redirect to
// /account when there is none. Null while loading or redirecting.
export function useRequiredUser(): { user: User | null; error: string | null } {
  const { state } = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "none") {
      router.replace("/account");
    }
  }, [state.status, router]);

  return {
    user: state.status === "ready" ? state.user : null,
    error: state.status === "error" ? state.message : null,
  };
}
