// Sends one Web Push notification. The VAPID keys identify this server to the
// browsers' push services; without them reminders are simply off.
//
// Make a pair with `pnpm --filter @rebound/api push:keys` and put them in the
// root .env. Changing them orphans every existing subscription, so each
// browser has to pick its reminder again.

import { WebPushError, sendNotification, setVapidDetails } from "web-push";
import { removeSubscription } from "./models/reminders.js";
import type { Message, Subscription } from "./reminders.js";

const publicKey = process.env.VAPID_PUBLIC_KEY ?? "";
const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";
// Push services want a way to reach whoever runs the server: an https URL or a
// mailto: address.
const subject = process.env.VAPID_SUBJECT || "mailto:reminders@rebound.invalid";

let configured = false;

if (publicKey !== "" && privateKey !== "") {
  try {
    setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch (error) {
    // Bad keys turn reminders off; they shouldn't stop the rest of the API.
    console.error("workout reminders are off: the VAPID settings were rejected:", error);
  }
}

/** The key browsers subscribe with, or null when reminders are off. */
export function vapidPublicKey(): string | null {
  return configured ? publicKey : null;
}

export type Delivery = "sent" | "gone" | "failed";

/**
 * Sends `message` to one browser. A subscription its push service says is
 * gone (the person blocked notifications, or cleared site data) is deleted.
 */
export async function deliver(subscription: Subscription, message: Message): Promise<Delivery> {
  try {
    await sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(message),
      // An hour: a reminder held while the computer was asleep is worth
      // showing at 6:30, not at midnight.
      { TTL: 60 * 60, timeout: 10_000 }
    );

    return "sent";
  } catch (error) {
    if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
      await removeSubscription(subscription.endpoint);
      return "gone";
    }

    console.error("workout reminder not delivered:", error);
    return "failed";
  }
}
