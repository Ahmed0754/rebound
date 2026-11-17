// The controller for workout reminders: read, set and turn off the logged-in
// account's daily reminder, and send a test one. Mounted at /api/reminders.

import { Router } from "express";
import { get, listSubscriptions, remove, save } from "../models/reminders.js";
import { deliver, vapidPublicKey } from "../push.js";
import { SLOTS, isSlot, isTimeZone, parseSubscription } from "../reminders.js";
import { requireUser, userIdOf } from "../require-user.js";

const router = Router();

router.use(requireUser);

// The reminder, and the key a browser needs to subscribe. A null key means
// this server has reminders off, so the client shouldn't offer them.
router.get("/", async (_req, res) => {
  res.send({ reminder: await get(userIdOf(res)), publicKey: vapidPublicKey() });
});

router.put("/", async (req, res) => {
  if (vapidPublicKey() === null) {
    res.status(503).send({ error: "reminders aren't set up on this server" });
    return;
  }

  const { slot, timeZone, subscription } = (req.body ?? {}) as Record<string, unknown>;

  if (!isSlot(slot)) {
    res.status(400).send({ error: `slot must be one of: ${SLOTS.join(", ")}` });
    return;
  }

  if (!isTimeZone(timeZone)) {
    res.status(400).send({ error: "timeZone must be an IANA time zone, like America/Chicago" });
    return;
  }

  const parsed = parseSubscription(subscription);

  if (parsed === null) {
    res.status(400).send({ error: "subscription must be a push subscription with an https endpoint and its keys" });
    return;
  }

  res.send({ reminder: await save(userIdOf(res), slot, timeZone, parsed), publicKey: vapidPublicKey() });
});

router.delete("/", async (_req, res) => {
  await remove(userIdOf(res));
  res.sendStatus(204);
});

// Sends a reminder right now, to check notifications reach this account.
// Doesn't count as the day's reminder.
router.post("/test", async (_req, res) => {
  const userId = userIdOf(res);
  const reminder = await get(userId);
  const subscriptions = await listSubscriptions(userId);

  if (reminder === null || subscriptions.length === 0) {
    res.status(409).send({ error: "turn on a reminder first" });
    return;
  }

  const results = await Promise.all(
    subscriptions.map((subscription) =>
      deliver(subscription, {
        title: "Test reminder",
        body: "This is how your workout reminder will look.",
        url: "/",
      })
    )
  );

  const sent = results.filter((result) => result === "sent").length;

  if (sent === 0) {
    res.status(502).send({ error: "the notification wasn't delivered - try turning reminders off and on again" });
    return;
  }

  res.send({ sent });
});

export default router;
