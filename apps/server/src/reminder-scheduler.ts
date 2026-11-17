// The timer that sends workout reminders. It runs inside the API process,
// started by index.ts (not app.ts, so the tests don't start it): reminders go
// out while the server is running, and not otherwise.

import { claim, listActive, listSubscriptions } from "./models/reminders.js";
import { deliver, vapidPublicKey } from "./push.js";
import { dueOn, messageFor } from "./reminders.js";

const EVERY_MS = 60_000;

/** Sends every reminder due at `now`. Returns how many notifications went out. */
export async function sendDueReminders(now: Date = new Date()): Promise<number> {
  let sent = 0;

  for (const reminder of await listActive()) {
    try {
      const day = dueOn(reminder, now);

      if (day === null || !(await claim(reminder.userId, day))) {
        continue;
      }

      for (const subscription of await listSubscriptions(reminder.userId)) {
        if ((await deliver(subscription, messageFor(reminder.slot))) === "sent") {
          sent += 1;
        }
      }
    } catch (error) {
      // One account's problem shouldn't cost everyone else their reminder.
      console.error(`workout reminder for ${reminder.userId} failed:`, error);
    }
  }

  return sent;
}

export function startReminderScheduler(): void {
  if (vapidPublicKey() === null) {
    console.log("workout reminders are off: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env");
    return;
  }

  let running = false;

  const run = async () => {
    // A slow run is skipped over rather than overlapped.
    if (running) return;
    running = true;

    try {
      const sent = await sendDueReminders();
      if (sent > 0) console.log(`sent ${sent} workout reminder${sent === 1 ? "" : "s"}`);
    } catch (error) {
      console.error("workout reminders:", error);
    } finally {
      running = false;
    }
  };

  void run();
  setInterval(run, EVERY_MS);
  console.log("workout reminders on: checking every minute");
}
