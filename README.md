# Rebound.ai

A bare-bones vertical slice: ask which body part hurts, get three exercises with sets and reps, picked by Gemini from a catalogue in Supabase.

This is deliberately the smallest thing that works end to end. See [`documents/ENG_PLAN.md`](./documents/ENG_PLAN.md) for what exists and what doesn't, and [`documents/GAME_PLAN.md`](./documents/GAME_PLAN.md) for where it's going.

## Stack

| | |
|---|---|
| `apps/web` | Next.js 16, React 19, App Router — port **3000** |
| `apps/api` | Plain Node `node:http`, no framework — port **4000** |
| Database | Supabase Postgres, via `pg`. No ORM, no migrations. |
| LLM | Gemini, via `@google/genai` |

## Prerequisites

- Node.js v22.x
- pnpm v11.x (`npm install -g pnpm@11.21.0`)
- A Supabase project — https://supabase.com
- A Gemini API key — https://aistudio.google.com/apikey

## Setup

1. **Install dependencies.**

   ```bash
   pnpm install
   ```

2. **Create your env file.**

   ```bash
   cp .env.example .env
   ```

   Fill in two values:

   - `DATABASE_URL` — Supabase dashboard → **Connect** → **Transaction pooler** (port `6543`). Replace `[YOUR-PASSWORD]` with your database password; URL-encode it if it contains `@ : / ? # &`.
   - `GEMINI_API_KEY` — from AI Studio.

   Leave `GEMINI_MODEL`, `API_PORT`, and `NEXT_PUBLIC_API_URL` at their defaults.

3. **Create and seed the database table.**

   ```bash
   pnpm --filter @rebound/api run db:setup
   ```

   Applies `apps/api/db/schema.sql` and seeds 30 mock exercises across 10 body
   regions. Re-runnable — it replaces rows rather than appending, so you always
   end at exactly 30.

4. **Run both servers**, in two terminals:

   ```bash
   pnpm --filter @rebound/api run dev    # API on :4000
   pnpm --filter web run dev             # web on :3000
   ```

5. Open http://localhost:3000, type `knee`, click **Get exercises**.

## What "working" looks like

Three exercises render, each with an AI-assigned sets/reps count. Seeded body
regions: `knee`, `shoulder`, `lower_back`, `hamstring`, `ankle`, `hip`, `neck`,
`wrist`, `elbow`, `calf`. Anything else returns a 404 and shows an error.

Hitting the API directly:

```bash
curl http://localhost:4000/health

curl -X POST http://localhost:4000/regime \
  -H "Content-Type: application/json" \
  -d '{"muscle":"knee"}'
```

Watch the API terminal while you click — it logs `raw picks from Gemini:` with
the ids and sets/reps the model returned, *before* validation. That's how you
tell "the model returned nothing" apart from "the model returned ids that don't
exist."

## Known rough edges

- **Every dependency is pinned exactly, no carets.** pnpm here enforces a
  `minimumReleaseAge` policy, so a package published in the last ~24h is
  rejected — pin a slightly older version rather than adding an exclusion.
  Changing `package.json` alone isn't enough if the lockfile is stale:
  `pnpm clean --lockfile && pnpm install`.

- **pnpm 11 blocks postinstall scripts by default.** A new dependency with a
  native build step silently does nothing and fails later with no obvious
  cause. Add it to `allowBuilds` in `pnpm-workspace.yaml` and check there first
  when something inexplicably doesn't work.

- **The API's port variable is `API_PORT`, not `PORT`.** `dotenv-cli` injects
  the root `.env` into every app and Next.js claims `PORT` for itself, so the
  two servers fight over one port. Don't rename it back.

- **`.env` changes need a full restart**, not a hot reload — `dotenv-cli` reads
  the file once, at process start.

- **On Windows, a killed dev server can leave an orphaned process holding its
  port**, still serving old code while looking healthy. Check
  `netstat -ano | findstr :4000` before assuming a restart took effect.

- **Gemini's sets/reps are not reviewed and vary run to run.** The same static
  hold has come back assigned 1, 5, 10, and 30 reps across identical requests.
  Expected: there is no safety layer yet. The real product wraps the LLM in
  deterministic bounds instead of trusting its output — see
  [`documents/PRD.md`](./documents/PRD.md).

- **The `exercises` table has no RLS policy.** Supabase exposes `public` schema
  tables through PostgREST, so it is reachable with the project anon key.
  Harmless for mock data; must be settled before any real or user-owned data
  lands. See `ENG_PLAN.md` risk #1.
