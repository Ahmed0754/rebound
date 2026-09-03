# Rebound

An AI coach that keeps athletes training instead of sidelined — no doctor's referral, no insurance, no waiting.

## What this does

This is a small toy version proving one idea end to end: you tell it what body part hurts, and it returns a few exercises for it, with an AI-assigned number of sets and reps for each. One screen, one API endpoint, one database table.

## How to run it locally

1. Create a free [Supabase](https://supabase.com) project (this is just Postgres, hosted for free).
2. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` — Supabase Dashboard → Connect → **Transaction pooler** (port 6543)
   - `GEMINI_API_KEY` — free key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
3. Install dependencies:
   ```
   pnpm install
   ```
4. Create and seed the database:
   ```
   pnpm --filter @rebound/api run db:setup
   ```
5. Start the API:
   ```
   pnpm --filter @rebound/api run dev
   ```
6. In a second terminal, start the web app:
   ```
   pnpm --filter web run dev
   ```
7. Open the URL Next.js prints (`http://localhost:3000`), type a body part like "knee", click "Get exercises."

## The database

One table, `exercises`:

| Column | What it holds |
|---|---|
| `id` | Unique id for the row |
| `name` | Exercise name, e.g. "Wall Sit" |
| `body_region` | What it's for, e.g. "knee" — this is what gets matched against your search |
| `description` | Plain-language instructions |
| `created_at` | When the row was added |

It's seeded with 30 hand-written exercises across 9 body regions. When you search "knee," the API pulls every row where `body_region` matches, hands that list to Gemini, and asks it to pick 3 and assign sets/reps.

## Team responsibilities

*(fill in names/roles)*

**Backend / API** —

**Frontend / UI** —

**Shared decisions** —

## Roadmap

The full product idea — auth, daily check-ins, weekly AI plan adjustments, a safety-validation layer, and the database structure to support all of it — is planned out but **not built into this app yet**. That planning, plus the more advanced database work we prototyped and then intentionally set aside to stay in scope for this week, lives on the [`future-work`](../../tree/future-work) branch and in [`/roadmap`](./roadmap) — not wired into the app above.
