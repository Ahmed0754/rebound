# Rebound

An AI coach that keeps athletes training instead of sidelined — no doctor's referral, no insurance, no waiting. Full product idea, safety rules, and long-term architecture are in [`documents/`](./documents).

## What this does right now

A user describes what hurts, and the app returns exercises with AI-assigned sets/reps.

- One screen — type a body part (e.g. "knee")
- One API endpoint — looks up matching exercises, asks Gemini to pick 3 and dose them
- Returns the 3 picks, rendered as cards

There's no auth, onboarding, daily check-ins, weekly plan adjustments, or safety-validation layer yet — Gemini's sets/reps are currently unvalidated. See [`documents/GAME_PLAN.md`](./documents/GAME_PLAN.md) for what's next.

## Tech stack

**API** (`apps/api`)
- Node.js `http` server (no framework)
- [`pg`](https://node-postgres.com/) — direct Postgres driver
- [`@google/genai`](https://github.com/googleapis/js-genai) — Gemini calls
- TypeScript, run via `tsx`

**Web** (`apps/web`)
- [Next.js](https://nextjs.org/) (App Router)
- React

**Database**
- Postgres, hosted on [Supabase](https://supabase.com)

**Tooling**
- pnpm workspaces (monorepo: `apps/api`, `apps/web`)
- GitHub Actions CI — typechecks both apps and builds web on every push/PR to `main`

## Setup

1. Create a free [Supabase](https://supabase.com) project.
2. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` — Supabase Dashboard → Connect → **Transaction pooler** (port 6543)
   - `GEMINI_API_KEY` — from [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
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
7. Open the URL Next.js prints, type a body part, click "Get exercises."
