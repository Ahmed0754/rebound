// The model for workout reminders: each account's chosen slot, and the
// browsers to notify. See the migration for why it is two tables.

import { pool } from "./db.js";
import type { Slot, Subscription } from "../reminders.js";

export type Reminder = { slot: Slot; timeZone: string };

// Everything the scheduler needs to decide whether one is due.
export type ActiveReminder = Reminder & { userId: string; lastSentOn: string | null };

/** `userId`'s reminder, or null when they have none. */
export async function get(userId: string): Promise<Reminder | null> {
  const found = await pool.query<{ slot: Slot; time_zone: string }>(
    `select slot, time_zone from workout_reminders where user_id = $1`,
    [userId]
  );

  if (found.rows.length === 0) {
    return null;
  }

  return { slot: found.rows[0].slot, timeZone: found.rows[0].time_zone };
}

/**
 * Sets `userId`'s reminder and records this browser as one to send it to.
 *
 * Changing the slot clears `last_sent_on`, so moving from morning to evening
 * still gets an evening reminder today. Saving the same slot again keeps it,
 * so it can't cause a second one.
 */
export async function save(userId: string, slot: Slot, timeZone: string, subscription: Subscription): Promise<Reminder> {
  const client = await pool.connect();

  try {
    await client.query("begin");

    await client.query(
      `insert into workout_reminders (user_id, slot, time_zone)
       values ($1, $2, $3)
       on conflict (user_id) do update
          set slot = excluded.slot,
              time_zone = excluded.time_zone,
              last_sent_on = case when workout_reminders.slot = excluded.slot
                                  then workout_reminders.last_sent_on end,
              updated_at = now()`,
      [userId, slot, timeZone]
    );

    // One browser, one endpoint: whoever saved from it last gets its notifications.
    await client.query(
      `insert into push_subscriptions (endpoint, user_id, p256dh, auth)
       values ($1, $2, $3, $4)
       on conflict (endpoint) do update
          set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
      [subscription.endpoint, userId, subscription.p256dh, subscription.auth]
    );

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  return { slot, timeZone };
}

/** Turns `userId`'s reminders off, on every browser. */
export async function remove(userId: string): Promise<void> {
  await pool.query(`delete from workout_reminders where user_id = $1`, [userId]);
  await pool.query(`delete from push_subscriptions where user_id = $1`, [userId]);
}

/** Every reminder that is switched on. Small enough to read whole every minute. */
export async function listActive(): Promise<ActiveReminder[]> {
  const found = await pool.query<{ user_id: string; slot: Slot; time_zone: string; last_sent_on: string | null }>(
    // ::text, because pg turns a date into a Date at local midnight, which
    // is a different day in half the world.
    `select user_id, slot, time_zone, last_sent_on::text as last_sent_on from workout_reminders`
  );

  return found.rows.map((row) => ({
    userId: row.user_id,
    slot: row.slot,
    timeZone: row.time_zone,
    lastSentOn: row.last_sent_on,
  }));
}

/**
 * Marks `day`'s reminder as sent, and says whether this call was the one that
 * did it. Claimed before sending, so two runs can't both send it.
 */
export async function claim(userId: string, day: string): Promise<boolean> {
  const claimed = await pool.query(
    `update workout_reminders
        set last_sent_on = $2
      where user_id = $1 and last_sent_on is distinct from $2::date`,
    [userId, day]
  );

  return claimed.rowCount === 1;
}

/** The browsers `userId` gets reminders on. */
export async function listSubscriptions(userId: string): Promise<Subscription[]> {
  const found = await pool.query<Subscription>(
    `select endpoint, p256dh, auth from push_subscriptions where user_id = $1`,
    [userId]
  );

  return found.rows;
}

/** Forgets a browser, once its push service says the subscription is gone. */
export async function removeSubscription(endpoint: string): Promise<void> {
  await pool.query(`delete from push_subscriptions where endpoint = $1`, [endpoint]);
}
