// The browser half of workout reminders: asking for permission, registering
// the service worker in public/sw.js, and subscribing this browser to the
// API server's push messages.

export type ReminderSlot = "morning" | "noon" | "evening";

// The hours are the server's (SLOT_HOURS in apps/server/src/reminders.ts); these are only the words.
export const REMINDER_TIMES: Record<ReminderSlot, string> = { morning: "6 am", noon: "12 pm", evening: "6 pm" };

export const REMINDER_LABELS: Record<ReminderSlot, string> = {
  morning: `Morning · ${REMINDER_TIMES.morning}`,
  noon: `Noon · ${REMINDER_TIMES.noon}`,
  evening: `Evening · ${REMINDER_TIMES.evening}`,
};

/** Whether this browser can get push notifications at all. */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** The zone the person's clock is in, like "America/Chicago". */
export function timeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Subscribes this browser, asking for permission first, and returns what the
 * server needs to send to it. Throws a message fit to show when permission
 * is refused.
 *
 * Call it straight from a click: some browsers only show the permission
 * prompt in response to one.
 */
export async function subscribeThisBrowser(publicKey: string): Promise<PushSubscriptionJSON> {
  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked for this site. Allow them in your browser's site settings, then pick again."
        : "Choose “Allow” when your browser asks, to get reminders."
    );
  }

  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  const registration = await navigator.serviceWorker.ready;
  const key = fromBase64Url(publicKey);

  let subscription = await registration.pushManager.getSubscription();

  // A subscription made for a different server key can't receive this
  // server's messages, so it is replaced.
  if (subscription !== null && !sameBytes(subscription.options.applicationServerKey, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }

  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });

  return subscription.toJSON();
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }

  return bytes;
}

function sameBytes(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (a === null || a.byteLength !== b.length) return false;
  const view = new Uint8Array(a);
  return view.every((byte, i) => byte === b[i]);
}
