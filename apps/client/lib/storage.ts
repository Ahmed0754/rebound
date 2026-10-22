// Browser storage, wrapped so a private window, blocked site data or a full
// quota reads as "nothing stored" instead of throwing.

export const KEYS = {
  // The session token from logging in. Whoever holds it is logged in as that
  // account until it expires or they log out.
  token: "rebound.sessionToken",
  // From before passwords: an account id this browser trusted as-is. Only
  // read to delete it.
  legacyUserId: "rebound.userId",
  // The questionnaire in progress, so a refresh mid-way doesn't lose it.
  draft: "rebound.onboardingDraft",
  // The latest questionnaire each account submitted. There is no endpoint
  // that lists them, so this is the only way back to a past result.
  lastOnboarding: (userId: string) => `rebound.lastOnboarding.${userId}`,
};

type Area = "local" | "session";

function area(which: Area): Storage | null {
  try {
    return which === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function read(which: Area, key: string): string | null {
  try {
    return area(which)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function write(which: Area, key: string, value: string): void {
  try {
    area(which)?.setItem(key, value);
  } catch {
    // Storage is a convenience here; losing it only loses the convenience.
  }
}

export function remove(which: Area, key: string): void {
  try {
    area(which)?.removeItem(key);
  } catch {
    // As above.
  }
}
