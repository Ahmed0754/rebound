// Dates as the person sees them: their own calendar day, not UTC.

// Today in the person's own timezone, "2026-11-02". Not toISOString(), which
// is UTC and is already tomorrow on an evening in the Americas. `offset` moves
// it that many days: -1 is yesterday.
export function today(offset = 0): string {
  const now = new Date();
  now.setDate(now.getDate() + offset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Which day of a plan today is, counting the day it was made as day 1.
export function planDay(createdAt: string): number {
  const start = new Date(createdAt);
  start.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  // Rounded, because a clock change makes one day an hour short or long.
  return Math.round((now.getTime() - start.getTime()) / 86_400_000) + 1;
}
