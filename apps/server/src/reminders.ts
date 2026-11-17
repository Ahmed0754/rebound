// Daily workout reminders: the rules, with no database and no network, so
// they can be tested on their own. The model is models/reminders.ts, the
// sender push.ts, the timer reminder-scheduler.ts.

/** Each slot's hour on the person's own clock. */
export const SLOT_HOURS = { morning: 6, noon: 12, evening: 18 } as const;

export type Slot = keyof typeof SLOT_HOURS;

export const SLOTS = Object.keys(SLOT_HOURS) as Slot[];

/** Where a browser said to send its notifications, as `PushSubscription.toJSON()` gives it. */
export type Subscription = { endpoint: string; p256dh: string; auth: string };

/** What the notification says. The service worker in the client shows it as-is. */
export type Message = { title: string; body: string; url: string };

const MESSAGES: Record<Slot, Message> = {
  morning: { title: "Time for your workout", body: "Good morning! Your Rebound exercises are ready.", url: "/" },
  noon: { title: "Time for your workout", body: "A few minutes over lunch keeps your recovery on track.", url: "/" },
  evening: { title: "Time for your workout", body: "Still time today: your Rebound exercises are ready.", url: "/" },
};

export function messageFor(slot: Slot): Message {
  return MESSAGES[slot];
}

export function isSlot(value: unknown): value is Slot {
  return typeof value === "string" && (SLOTS as string[]).includes(value);
}

/** An IANA zone this runtime knows, like "America/Chicago". */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value === "" || value.length > 64) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The date ("2026-11-17") and hour (0-23) it is right now in `timeZone`. */
export function localClock(now: Date, timeZone: string): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";

  return { day: `${part("year")}-${part("month")}-${part("day")}`, hour: Number(part("hour")) };
}

/**
 * The person's date to send today's reminder for, or null when none is due.
 *
 * Due for the whole of the slot's hour, not just its first minute, so a server
 * started at 6:20 still sends the 6:00 one. Not after that hour: a morning
 * reminder that turns up at lunch is noise.
 */
export function dueOn(
  reminder: { slot: Slot; timeZone: string; lastSentOn: string | null },
  now: Date
): string | null {
  const { day, hour } = localClock(now, reminder.timeZone);

  if (hour !== SLOT_HOURS[reminder.slot] || reminder.lastSentOn === day) {
    return null;
  }

  return day;
}

// Base64url, as browsers encode the subscription keys. Padding is tolerated.
const KEY = /^[A-Za-z0-9_-]+={0,2}$/;

/**
 * A subscription out of a request body, or null.
 *
 * The server posts to `endpoint`, so it has to be https; anything else (an
 * http URL on the local network, say) is refused rather than called.
 */
export function parseSubscription(value: unknown): Subscription | null {
  const input = (value ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const { endpoint } = input;
  const p256dh = input.keys?.p256dh;
  const auth = input.keys?.auth;

  if (typeof endpoint !== "string" || endpoint.length > 2048) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") {
    return null;
  }

  for (const key of [p256dh, auth]) {
    if (typeof key !== "string" || key.length > 200 || !KEY.test(key)) {
      return null;
    }
  }

  return { endpoint, p256dh: p256dh as string, auth: auth as string };
}
