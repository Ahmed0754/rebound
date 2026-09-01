# Contributing

## Setup

Prerequisites: Node 22.x, pnpm 11.x (`npm install -g pnpm@11.21.0`), a Supabase
project, a Gemini API key.

```bash
pnpm install
cp .env.example .env          # then fill in DATABASE_URL and GEMINI_API_KEY
pnpm --filter @rebound/api run db:setup    # migrate + seed
```

Run both servers, in two terminals:

```bash
pnpm --filter @rebound/api run dev    # :4000
pnpm --filter web run dev             # :3000
```

**A clean clone cannot run without a live Supabase project and a Gemini key.**
That is a deliberate trade-off recorded in [`adr/0019`](./adr/0019-supabase-only-local-development.md),
and it is knowingly the same condition `TDD.md` calls the worst part of the v1
codebase for onboarding a second person. If it starts costing time, that ADR has
a revisit trigger.

## Verification gates

Everything CI runs, runnable locally:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @rebound/api run check:rls
```

Plus, for anything user-facing: **a real click-through in a browser.**
Typecheck-clean is not evidence. Every real bug in v1 was found by a human using
the app — the scroll trap, the missing back buttons, the day-boundary session
bug, the duplicate active regimes. Not one was caught by inspection or by types.

## Database changes

**Migrations only. Never edit a table by hand in the Supabase dashboard.**

```bash
pnpm --filter @rebound/api exec node-pg-migrate create my-change
# edit apps/api/migrations/<timestamp>_my-change.js
pnpm --filter @rebound/api run db:migrate
```

Two rules that are enforced, not suggested:

1. **Every new table needs a row in `apps/api/db/rls-policies.md`**, or
   `check:rls` fails the build. "RLS off" is never a valid decision for a table
   in the `public` schema — Supabase serves that schema over PostgREST, so
   RLS-disabled means readable with the project's anon key regardless of what
   application code does. Shared-library tables get RLS *enabled* with a
   permissive read-only policy.
2. **`DATA_MODEL.md` updates in the same commit as the migration.**

`check:rls` is verified to fail, not just to pass — v1 fixed seven exposed
tables and then let one regress undetected until a later audit.

## Traps in this repo

Real ones, each of which has already cost time here:

- **pnpm 11 blocks postinstall scripts by default.** A new dependency with a
  native build step silently does nothing and fails later with no obvious cause.
  Add it to `allowBuilds` in `pnpm-workspace.yaml`. **Check there first when
  something inexplicably doesn't work after adding a dependency.** Note that
  `onlyBuiltDependencies` is the pnpm 10 spelling: pnpm 11 still reports it via
  `pnpm config` but ignores it at install time, so it looks configured while
  doing nothing.

- **A `minimumReleaseAge` policy rejects packages published in the last ~24h.**
  Prefer pinning a slightly older version over adding an exclusion. Editing
  `package.json` alone is not enough if the lockfile is stale —
  `pnpm clean --lockfile && pnpm install`.

- **Every dependency is pinned exactly, no carets.** v1 ended up with three
  TypeScript majors and three `@types/node` majors in one workspace. Also,
  `prisma`'s npm `latest` tag pointed at a release candidate on 2026-09-01;
  unpinned installs picked up an RC CLI against a stable client.

- **The API's port variable is `API_PORT`, not `PORT`.** `dotenv-cli` injects the
  root `.env` into every app and Next.js claims `PORT` for itself, so the two
  servers fight over one port. Don't rename it back.

- **`.env` is read once, at process start.** Changing it needs a full restart,
  not a hot reload.

- **On Windows, killing a dev server's wrapper does not kill the server.**
  `tsx watch`'s own reload does not reliably free the port either, so a stale
  listener keeps serving old code while looking healthy. Check
  `netstat -ano | findstr :4000` and kill the PID directly before assuming a
  restart took effect.

- **You and your partner share one Supabase database.** There is no isolation. A
  destructive migration or a reseed affects the other person's work in real time.

## Decisions

**Any decision that changes an interface, a dependency, or a data shape gets an
ADR in [`adr/`](./adr), written before the work.**

v1's decisions were real and mostly good, but they lived in a session log and in
people's heads. When a colleague suggested REST over tRPC there was no record of
why tRPC had been chosen, so it was re-litigated from scratch and the entire API
layer was rewritten eight days into an eight-week build. An ADR is fifteen lines.

When reversing a decision, write a new ADR that supersedes the old one. Do not
edit the original — the reasoning that was overturned is the part worth keeping.

## Branch and review

- `main` is the working branch for now. No protection yet.
- Delete feature branches after merging. v1 accumulated ten stale branches
  despite having exactly this convention written down.
- **One drives, one reviews** on anything touching clinical rules, RLS policies,
  or the agent layer. Those are the three places where a silent bug is expensive.
- No `stage` tier. v1 set one up, never used it, and it went 49 commits stale.

## Keeping documents true

- **`ENG_PLAN.md` updates in the same commit as the work it describes.** It is
  the living state document: what works, what's next, what's risky.
- When a document and the code disagree, **the code wins** — and the document is
  wrong and should be fixed.
- Never claim something is verified by retyping output. Paste the real thing.
