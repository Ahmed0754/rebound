# Rebound

An AI coach that keeps athletes training instead of sidelined — no doctor's referral, no insurance, no waiting.

## What this does

This is a small toy version proving one idea end to end: you tell it what body part hurts, and it returns a few exercises for it, with an AI-assigned number of sets and reps for each. One screen, one API endpoint, one database table.

Step by step:

1. You open a webpage with one input box.
2. You type a body part that hurts — like "knee."
3. It sends that to a backend server.
4. The server looks in a database for exercises tagged for that body part (30 exercises pre-loaded, across 10 body regions: knee, shoulder, lower back, hamstring, ankle, hip, neck, wrist, elbow, calf).
5. It hands that list of matching exercises to Google's Gemini AI and asks it: pick exactly 3 of these, and decide how many sets and reps of each.
6. Gemini sends back its picks.
7. The server sends those 3 exercises back to the webpage, which displays them as cards — name, description, and sets × reps.

**What it deliberately does *not* do:** no login/accounts, no saving your history, no daily check-ins, no adjusting a plan over time, and no safety checks on what the AI recommends — if Gemini says "do 30 reps," the app just shows 30 reps, no validation. That's intentional for a toy version — a safety-checking layer is the obvious next step, but it is not built yet.

![How the request flows: the web app sends a muscle name to the API, the API queries Postgres for matching exercises and Gemini for a 3-exercise regime, then returns it to the browser.](./diagrams/request-flow.svg)

## The full vision (not built yet)

The toy above proves one small piece works. The actual product it's a first step toward is bigger:

Rebound is meant to be a **mobile app** that keeps athletes training through nagging injuries instead of sidelined by them — no PT referral, no insurance, no waiting. The core idea is a twice-daily habit loop, like a workout version of a Duolingo streak:

- **Onboarding, once**: a quick safety screen (any red-flag symptoms route straight to "see a doctor," no AI plan generated), then the AI builds a starting plan based on your goal and what hurts.
- **Two short sessions a day, every day** — a morning session (bundled with a 10-second check-in: pain score, how it's feeling) and an evening session. Missing one doesn't break your streak; missing both does.
- **Every 7 days, the AI reviews your trend** and rewrites the plan — harder if you're improving, held steady if you're plateauing, backed off if you're getting worse.
- **A safety layer runs underneath all of it, in real time** — not just weekly. A pain spike or a "this made it worse" flag triggers an immediate rollback to your last safe plan and a "stop and consult a professional" message, without waiting for the weekly review.

The whole bet is that most people don't need a clinician managing every decision — they need a plan that actually pays attention to them and adjusts, at a price and speed a clinician-staffed app can't match. That's also exactly why the safety layer matters more here than in a normal fitness app: there's no human backstop, so the rules bounding what the AI is allowed to prescribe have to be solid before this could responsibly have real users. That safety layer is planned but **not implemented** — it's one of the biggest pieces of what's left. Full planning docs for this live on the [`future-work`](../../tree/future-work) branch.

## Team responsibilities

**Backend / API — Shahid Khan** (`apps/api`)
The Node HTTP server and its two routes (`/health`, `/regime`), including input
validation and error responses; the Postgres query that finds exercises for a
body region; the Gemini call in `regime.ts` and the response schema it enforces;
the migration that creates the `exercises` table and the seed script that fills
it; the tests in `server.test.ts`.

**Frontend / UI — Syed Ahmed Ali** (`apps/web`)
The Next.js page: the input box and submit button, the `fetch` to `/regime`,
loading and error states, and the cards that render each returned exercise with
its sets and reps.

**Shared decisions — both**
The request-flow diagram; the JSON shape `/regime` returns, since it is the
contract between the two halves; the columns on the `exercises` table; and the
scope of this toy version — what we deliberately left out.

## Tech stack

**API** (`apps/api`)
- Node.js `http` server — no framework, just plain Node
- [`pg`](https://node-postgres.com/) — direct Postgres driver
- [`@google/genai`](https://github.com/googleapis/js-genai) — Gemini calls
- TypeScript, run via `tsx`

**Web** (`apps/web`)
- [Next.js](https://nextjs.org/) (App Router)
- React

**Database**
- Postgres, hosted for free on [Supabase](https://supabase.com)
- One migration tool, [`node-pg-migrate`](https://github.com/salsita/node-pg-migrate), for the one table this app uses

**Tooling**
- [pnpm](https://pnpm.io/) workspaces — monorepo with `apps/api` and `apps/web`
- [Vitest](https://vitest.dev/) — the 10 tests in `server.test.ts`
- ESLint

## The database

One table, `exercises`:

| Column | What it holds |
|---|---|
| `id` | Unique id for the row |
| `name` | Exercise name, e.g. "Wall Sit" |
| `body_region` | What it's for, e.g. "knee" — this is what gets matched against your search |
| `description` | Plain-language instructions |
| `created_at` | When the row was added |

It's seeded with 30 hand-written exercises across 10 body regions. When you search "knee," the API pulls every row where `body_region` matches, hands that list to Gemini, and asks it to pick 3 and assign sets/reps.

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
