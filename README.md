# Rebound v2 — Proof of Concept (M1)

This is a deliberately throwaway PoC — see `documents/GAME_PLAN.md`'s M1 section for what it does and doesn't include. It proves Docker, Postgres, the API container, and a live Gemini call all work together end to end.

## Prerequisites

- Docker Desktop (or Docker Engine + Compose) running
- Node.js v22.x
- pnpm v11.x (`npm install -g pnpm@11.21.0`)
- A Gemini API key from https://aistudio.google.com/apikey

## Setup

1. Clone the repo and enter it.

2. Copy the example env file and fill in your Gemini key:

   ```
   cp .env.example .env
   ```

   Edit `.env` and set `GEMINI_API_KEY` to a real key. Leave `DATABASE_URL`,
   `GEMINI_MODEL`, and `VITE_API_URL` as their defaults — they're already correct
   for this setup.

   `.env` must exist before any `docker compose` command. Compose validates every
   service before starting any of them, so a missing `.env` fails even
   `docker compose up postgres`, with a file-not-found error rather than anything
   that points at this step.

3. Install workspace dependencies:

   ```
   pnpm install
   ```

4. Bring up Postgres and the API, fully containerized:

   ```
   docker compose up --build
   ```

   Wait for the api service to log `api listening on http://localhost:3000`. This
   also runs the database migration and seeds ~30 mock exercises automatically —
   no separate command needed.

5. In a second terminal, start the web app:

   ```
   pnpm --filter web run dev
   ```

6. Open the URL Vite prints (typically http://localhost:5173), type a body part
   (e.g. "knee") into the input, click "Get exercises."

## What "working" looks like

Three exercises render, each with an AI-assigned sets/reps count — sourced from the
seeded mock catalogue, picked by a live Gemini call.

## Known rough edges

- Any new dependency with a native build step needs an entry in
  `pnpm-workspace.yaml`'s `allowBuilds`, or pnpm 11 silently blocks its postinstall
  and it fails later with no obvious cause. Check there first if something
  inexplicably doesn't work after adding a dependency. (Note: `onlyBuiltDependencies`
  is the pnpm 10 spelling — pnpm 11 still reports it via `pnpm config` but ignores it
  at install time, so it looks configured while doing nothing.)

- `DATABASE_URL` in `.env` points at `localhost`, which is correct for host-run
  commands such as `prisma migrate dev`. The API container overrides it via
  `environment:` in `docker-compose.yml`, because inside the compose network the
  database is reachable as `postgres`, not `localhost`. If you add another
  containerized service that talks to Postgres, it needs the same override.

- `GEMINI_MODEL` is pinned to an exact model id, not a floating alias like
  `gemini-flash-latest`. Google retires model ids: `gemini-2.5-flash` returns a 404
  ("no longer available to new users") even though it still appears in the
  `/v1beta/models` listing for a valid key. If you get a 404 from the Gemini call,
  the model id is the first thing to check — and check it with a real
  `generateContent` request, since the model listing is not an availability check.

- If you run the API via `pnpm --filter @rebound/api run dev` instead of Docker and
  edit `.env`, you need a full restart, not a hot reload — dotenv-cli only reads the
  file once, at process start.

- On Windows, restarting a host-run dev server can leave an orphaned process still
  holding a port; `tsx watch`'s own reload does not reliably kill the previous
  listener either. Check `netstat -ano | findstr :3000` before assuming a restart
  took effect, and kill the PID directly if one lingers.

- The API sends `Access-Control-Allow-Origin: *` (Hono's default `cors()`), which is
  what lets the Vite dev server on port 5173 call it. Fine for a local PoC, wrong for
  anything deployed.

- This PoC's Gemini call has no retry logic and only ID-based validation. Sets/reps
  assignments are not clinically reviewed and can vary meaningfully between identical
  requests (observed: the same static hold assigned 1, 5, and 30 reps across three
  runs of the same request). This is expected — it's exactly why the real product
  wraps the LLM in a deterministic safety layer instead of trusting its output
  directly. See `documents/GAME_PLAN.md`'s note on this PoC's deliberate mismatch with
  the real architecture.
