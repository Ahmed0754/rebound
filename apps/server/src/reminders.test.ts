import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const USER_ID = "33333333-3333-3333-3333-333333333333";
const TOKEN = "token-for-user";
const AUTH = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

const SUBSCRIPTION = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
};
const STORED = { endpoint: SUBSCRIPTION.endpoint, ...SUBSCRIPTION.keys };

// No database and no push service: the model and the sender are stand-ins.
vi.mock("./models/reminders.js", () => ({
  get: vi.fn(async () => null),
  save: vi.fn(async (_userId: string, slot: string, timeZone: string) => ({ slot, timeZone })),
  remove: vi.fn(async () => undefined),
  listActive: vi.fn(async () => []),
  claim: vi.fn(async () => true),
  listSubscriptions: vi.fn(async () => []),
  removeSubscription: vi.fn(async () => undefined),
}));

vi.mock("./push.js", () => ({
  vapidPublicKey: vi.fn(() => "public-key"),
  deliver: vi.fn(async () => "sent"),
}));

vi.mock("./models/sessions.js", () => ({
  create: vi.fn(async () => "new-token"),
  userIdFor: vi.fn(async (token: string) => (token === TOKEN ? USER_ID : null)),
  remove: vi.fn(async () => undefined),
  removeAll: vi.fn(async () => undefined),
}));

const reminders = await import("./models/reminders.js");
const push = await import("./push.js");
const { dueOn, isTimeZone, localClock, parseSubscription } = await import("./reminders.js");
const { sendDueReminders } = await import("./reminder-scheduler.js");
const { app } = await import("./app.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the reminder clock", () => {
  it("reads the hour and date in the person's own zone", () => {
    // 23:30 UTC on Nov 17 is still the 17th in Chicago, and already the 18th in Tokyo.
    const now = new Date("2026-11-17T23:30:00Z");

    expect(localClock(now, "America/Chicago")).toEqual({ day: "2026-11-17", hour: 17 });
    expect(localClock(now, "Asia/Tokyo")).toEqual({ day: "2026-11-18", hour: 8 });
    expect(localClock(new Date("2026-11-17T00:10:00Z"), "UTC")).toEqual({ day: "2026-11-17", hour: 0 });
  });

  it("is due for the whole of the slot's hour, once a day", () => {
    const evening = { slot: "evening" as const, timeZone: "America/Chicago", lastSentOn: null };

    // Chicago is UTC-6 in November.
    expect(dueOn(evening, new Date("2026-11-17T00:00:00Z"))).toBe("2026-11-16");
    expect(dueOn(evening, new Date("2026-11-17T00:59:00Z"))).toBe("2026-11-16");
    expect(dueOn(evening, new Date("2026-11-16T23:59:00Z"))).toBeNull();
    expect(dueOn(evening, new Date("2026-11-17T01:00:00Z"))).toBeNull();
    expect(dueOn({ ...evening, lastSentOn: "2026-11-16" }, new Date("2026-11-17T00:30:00Z"))).toBeNull();
  });

  it("puts morning at 6, noon at 12", () => {
    const at = (iso: string, slot: "morning" | "noon") => dueOn({ slot, timeZone: "UTC", lastSentOn: null }, new Date(iso));

    expect(at("2026-11-17T06:00:00Z", "morning")).toBe("2026-11-17");
    expect(at("2026-11-17T05:59:00Z", "morning")).toBeNull();
    expect(at("2026-11-17T12:15:00Z", "noon")).toBe("2026-11-17");
  });

  it("knows real time zones from made-up ones", () => {
    expect(isTimeZone("Europe/London")).toBe(true);
    expect(isTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(isTimeZone("")).toBe(false);
    expect(isTimeZone(42)).toBe(false);
  });
});

describe("parseSubscription", () => {
  it("takes what PushSubscription.toJSON() gives", () => {
    expect(parseSubscription(SUBSCRIPTION)).toEqual(STORED);
  });

  it("refuses an endpoint that isn't https, since the server would call it", () => {
    expect(parseSubscription({ ...SUBSCRIPTION, endpoint: "http://192.168.1.1/admin" })).toBeNull();
    expect(parseSubscription({ ...SUBSCRIPTION, endpoint: "not a url" })).toBeNull();
  });

  it("refuses missing or malformed keys", () => {
    expect(parseSubscription({ endpoint: SUBSCRIPTION.endpoint })).toBeNull();
    expect(parseSubscription({ ...SUBSCRIPTION, keys: { p256dh: "has spaces", auth: "x" } })).toBeNull();
    expect(parseSubscription(null)).toBeNull();
  });
});

describe("sendDueReminders", () => {
  const due = { userId: USER_ID, slot: "morning" as const, timeZone: "UTC", lastSentOn: null };
  const sixAm = new Date("2026-11-17T06:05:00Z");

  it("claims the day, then sends to every browser", async () => {
    vi.mocked(reminders.listActive).mockResolvedValueOnce([due]);
    vi.mocked(reminders.listSubscriptions).mockResolvedValueOnce([STORED, { ...STORED, endpoint: "https://other" }]);

    expect(await sendDueReminders(sixAm)).toBe(2);
    expect(reminders.claim).toHaveBeenCalledWith(USER_ID, "2026-11-17");
    expect(vi.mocked(push.deliver).mock.calls[0][1]).toMatchObject({ title: "Time for your workout", url: "/" });
  });

  it("sends nothing outside the slot's hour", async () => {
    vi.mocked(reminders.listActive).mockResolvedValueOnce([due]);

    expect(await sendDueReminders(new Date("2026-11-17T09:00:00Z"))).toBe(0);
    expect(reminders.claim).not.toHaveBeenCalled();
  });

  it("sends nothing when another run already claimed the day", async () => {
    vi.mocked(reminders.listActive).mockResolvedValueOnce([due]);
    vi.mocked(reminders.claim).mockResolvedValueOnce(false);

    expect(await sendDueReminders(sixAm)).toBe(0);
    expect(push.deliver).not.toHaveBeenCalled();
  });

  it("carries on past one account that fails", async () => {
    const other = { ...due, userId: "44444444-4444-4444-4444-444444444444" };
    vi.mocked(reminders.listActive).mockResolvedValueOnce([due, other]);
    vi.mocked(reminders.claim).mockRejectedValueOnce(new Error("database blip"));
    vi.mocked(reminders.listSubscriptions).mockResolvedValueOnce([STORED]);
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);

    expect(await sendDueReminders(sixAm)).toBe(1);
  });
});

describe("/api/reminders", () => {
  let base: string;
  let server: Server;

  beforeAll(async () => {
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, () => resolve(listening));
    });
    base = `http://localhost:${(server.address() as AddressInfo).port}/api/reminders`;
  });

  afterAll(() => {
    server.close();
  });

  const put = (body: unknown) => fetch(base, { method: "PUT", headers: AUTH, body: JSON.stringify(body) });

  it("needs a login", async () => {
    expect((await fetch(base)).status).toBe(401);
  });

  it("returns the reminder and the key to subscribe with", async () => {
    vi.mocked(reminders.get).mockResolvedValueOnce({ slot: "noon", timeZone: "UTC" });

    const res = await fetch(base, { headers: AUTH });
    expect(await res.json()).toEqual({ reminder: { slot: "noon", timeZone: "UTC" }, publicKey: "public-key" });
  });

  it("saves a slot with this browser's subscription", async () => {
    const res = await put({ slot: "evening", timeZone: "America/Chicago", subscription: SUBSCRIPTION });

    expect(res.status).toBe(200);
    expect(reminders.save).toHaveBeenCalledWith(USER_ID, "evening", "America/Chicago", STORED);
  });

  it("400s for a bad slot, zone or subscription, and saves nothing", async () => {
    const good = { slot: "evening", timeZone: "UTC", subscription: SUBSCRIPTION };

    expect((await put({ ...good, slot: "midnight" })).status).toBe(400);
    expect((await put({ ...good, timeZone: "Nowhere/Special" })).status).toBe(400);
    expect((await put({ ...good, subscription: { endpoint: "http://localhost:5432" } })).status).toBe(400);
    expect(reminders.save).not.toHaveBeenCalled();
  });

  it("503s when the server has no VAPID keys", async () => {
    vi.mocked(push.vapidPublicKey).mockReturnValueOnce(null);

    expect((await put({ slot: "noon", timeZone: "UTC", subscription: SUBSCRIPTION })).status).toBe(503);
  });

  it("turns reminders off", async () => {
    const res = await fetch(base, { method: "DELETE", headers: AUTH });

    expect(res.status).toBe(204);
    expect(reminders.remove).toHaveBeenCalledWith(USER_ID);
  });

  it("sends a test without counting it as the day's reminder", async () => {
    vi.mocked(reminders.get).mockResolvedValueOnce({ slot: "noon", timeZone: "UTC" });
    vi.mocked(reminders.listSubscriptions).mockResolvedValueOnce([STORED]);

    const res = await fetch(`${base}/test`, { method: "POST", headers: AUTH });

    expect(await res.json()).toEqual({ sent: 1 });
    expect(reminders.claim).not.toHaveBeenCalled();
  });

  it("409s a test with no reminder set, and 502s one nothing received", async () => {
    expect((await fetch(`${base}/test`, { method: "POST", headers: AUTH })).status).toBe(409);

    vi.mocked(reminders.get).mockResolvedValueOnce({ slot: "noon", timeZone: "UTC" });
    vi.mocked(reminders.listSubscriptions).mockResolvedValueOnce([STORED]);
    vi.mocked(push.deliver).mockResolvedValueOnce("gone");

    expect((await fetch(`${base}/test`, { method: "POST", headers: AUTH })).status).toBe(502);
  });
});
