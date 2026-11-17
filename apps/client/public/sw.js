/* global self, URL */

// The service worker for workout reminders. Its only job is to show the
// notifications the API server pushes, and to open the app when one is
// clicked. No caching and no fetch handler: the app works exactly as it did.
// Registered by lib/push.ts.

self.addEventListener("push", (event) => {
  let message = {};

  try {
    message = event.data ? event.data.json() : {};
  } catch {
    // A push with a body that isn't JSON still gets a notification.
  }

  event.waitUntil(
    self.registration.showNotification(message.title || "Time for your workout", {
      body: message.body || "Your Rebound exercises are ready.",
      // One at a time: a new reminder replaces an unread one.
      tag: "rebound-workout",
      data: { url: message.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = tabs.find((tab) => new URL(tab.url).origin === self.location.origin);

      if (open) {
        await open.focus();
        return;
      }

      await self.clients.openWindow(url);
    })()
  );
});
