# Rebound.ai — Engineering Plan

*The **living state document**. What's done, what's next, what's risky, right now. For the full milestone agenda, see [`GAME_PLAN.md`](./GAME_PLAN.md). For architecture, see [`TDD.md`](./TDD.md).*

> **[v2] This document has a different job than v1's version had.** v1's `ENG_PLAN.md` was a retrospective log of completed milestones — useful history, but it drifted from reality because it was written after the fact. This one answers exactly three questions at any moment: **what works right now, what's being worked on, and what will bite us.**
>
> **Update it in the same commit as the work it describes.** v1's rule, learned the hard way: several sessions' worth of feature commits landed with no matching entry, and the gap had to be reconstructed from `git log` and `git show` afterward. Its own note: *"when committing real feature work, write the session section in the same pass, don't defer it."* The reconstruction was still incomplete — a whole architectural change (the skeleton-preset retrieval layer) existed in the code and in the TDD but appeared nowhere in the log.

---

**Last updated:** 2026-09-01
**Current state:** Bare-bones vertical slice running on the real stack. The M1 proof of concept has been **deleted**, deliberately.

---

## The current approach: bare bones first

**Decided 2026-09-01, on advisor guidance: start small.** The planning documents describe an elaborate target system — nine packages, self-hosted auth, RLS enforcement, an eval harness, a deterministic clinical-rules layer. That target has not changed and remains the point of the project. What changed is the **order**: rather than building the full skeleton up front, the repo now holds the smallest thing that works end to end, and complexity gets added one deliberate piece at a time.

Everything in `TDD.md`, `DATA_MODEL.md`, and `GAME_PLAN.md` that is not listed under *What works end to end* below is a **target, not a description of the code.** Read those documents as intent. Read this section as fact.

---

## Status

### What works end to end

Update this section only with things that have been **run and verified**, not things that have been written. v1's verification standard, carried forward:

> Every item that claims "done" was, at the time it was built, verified against the real database and the real model API — **not mocked** — plus a real click-through for anything user-facing.

**A single vertical slice, verified 2026-09-01:**

- `apps/web` (Next.js) renders one screen: an input asking *"what muscle hurts?"* and a result list. Verified by a real browser click-through, not code inspection.
- `apps/api` (plain Node `node:http`, no framework) serves `GET /health` and `POST /regime`.
- `POST /regime` queries the **live Supabase Postgres** for exercises matching a body region, makes a **real Gemini call** (structured JSON output via `responseSchema`), and validates every returned exercise id against the retrieved pool before responding. Verified against the live API, not mocked — HTTP 200 with three exercises and real Supabase UUIDs.
- `pnpm --filter @rebound/api run db:setup` applies `db/schema.sql` and seeds 30 mock exercises into Supabase. Re-runnable: it replaces rows rather than appending, so running it twice still leaves 30.
- Both apps typecheck; `apps/web` builds.

### The stack, as actually built

| Layer | What it is |
|---|---|
| Frontend | Next.js 16.3.3, App Router, React 19.2.8, `apps/web`, port 3000 |
| API | **Plain Node `node:http`. No framework** — no Hono, no Fastify, no Express. `apps/api`, port 4000 |
| Database | **Supabase Postgres**, accessed with `pg` (node-postgres). **No ORM.** |
| Schema | One hand-written `db/schema.sql`. **No migrations.** |
| LLM | Gemini via `@google/genai`, model id `gemini-3.7-flash` from `.env` |
| Config | One root `.env`, injected by `dotenv-cli` |
| CI | GitHub Actions: install → typecheck api → typecheck web → build web |

### What is deliberately absent

Not bugs. Not oversights. Each is a target the code has not reached yet:

- **No auth.** No users, no sessions, no ownership. Every request is anonymous.
- **No ORM and no migrations.** Schema changes mean editing `db/schema.sql` and re-running `db:setup`. This is fine for one table of mock data and will not survive real user data.
- **No Docker.** Dropped 2026-09-01. Local dev talks directly to hosted Supabase.
- **No `packages/*` at all** — no `clinical-rules`, no `contracts`, no `agents`, no `db`. The API is a single directory of plain files.
- **No safety layer.** Gemini freely picks sets and reps. Nothing validates the dose. This is exactly the arrangement `PRD.md` and `TDD.md` describe as irresponsible to ship, and it is knowingly the current state.
- **No tests.** The PoC briefly had two; they were deleted with it.
- **No mobile.** Next.js web is currently the only client surface.

### In progress

Nothing. The slice above is the whole of the working system.

---

## What's next

Deliberately small, one piece at a time. Nothing here is committed to an order yet — this list is candidates, not a plan:

- Real exercise data in place of the 30 generated mock rows.
- Tests, restored — at minimum the two the PoC had, against the real endpoint.
- A first deterministic guard on the LLM's output (a sets/reps sanity bound), as the seed of `packages/clinical-rules`.
- The stale-document problem this update is fixing: keep this file accurate in the same commit as the work.

---

## Risks

Ordered by how much they'd hurt, not how likely they are.

### 1. The Supabase `exercises` table has no RLS decision — **new, unresolved**

Supabase exposes tables in the `public` schema through an auto-generated PostgREST API, and its default grants make a table without RLS readable with the project's anon key. `exercises` was created by `db/schema.sql` with **no RLS statement at all**.

The blast radius today is nil — it's 30 rows of generated mock data. The pattern is the problem, and `TDD.md` already names it: **v1 had seven tables exposed exactly this way**, caught by the vendor's linter rather than by review, and after they were fixed **one regressed and went undetected until a later audit**. The v2 answer was a CI gate (`check:rls`), which does not exist in this repo.

**This must be settled before any non-mock or user-owned data enters Supabase**, not after.

### 2. Database credential exposure

The Supabase database password was pasted into a chat transcript on 2026-09-01. It should be rotated (Supabase → Settings → Database → Reset database password) before the repo or its history is shared further.

Related: `.env` currently holds the **direct** connection string (`db.<ref>.supabase.co:5432`), not the transaction pooler (`:6543`). Direct connections are IPv6-only on newer free projects and are capped at a far lower connection count. It works from this machine today; it is a reasonable bet that it will not work from CI or from a different network.

### 3. Clinical sign-off — the largest single launch blocker

The risk-tiering thresholds and change ceilings are **invented defaults**. They have been cross-checked against literature, which is not the same as being signed off — see `PRD.md`'s "What these numbers actually rest on."

Long lead time. Not parallelizable with engineering. **Do not mistake "cross-checked against cited literature" for "signed off."**

### 4. Legal review not started

TOS, medical disclaimers, liability insurance, state health-data law, App Store health-data requirements, and the SaMD classification question. None are code-fixable. All have long lead times.

### 5. Effectiveness, not safety, is the unsolved problem

v1's evaluation is unambiguous about the shape of the failure:

- Mean regime quality **never exceeded 2.58/5**
- `sessionSlotCoherence` — the product's stated differentiator — scored **2/5 in 41 of 43 graded fixtures**
- Every deterministic safety check passed
- The two worst-scoring fixtures were the injury-specific ones — the actual product premise

**The safety half worked. The usefulness half didn't.** The diagnosis on record: *"The LLM is making exercise-selection decisions with almost no domain knowledge. It's choosing exercises the way a layperson with a database would."*

The current slice reproduces this in miniature and visibly: the same "Wall Sit" static hold has come back assigned **1, 5, 10, and 30 reps** across identical requests. A hold measured in reps is not a dosing error the model is close to getting right — it is evidence the model has no model of the exercise.

### 6. The judge has no cross-family check

Single-provider (Gemini) means the eval judge cannot be a different model family, which is what v1 used to avoid self-flattery. **Spot-check judge scores against human judgement before trusting any quality gate.** A floor gate against an untrustworthy judge manufactures false confidence, which is worse than no gate.

### 7. Unit economics unconfirmed

Cost per active user per week has never been modeled against the reference price. v1 swapped to a cheaper model for cost reasons *without running the calculation*. One real datapoint from v1: **$1.49 across 113 calls** in roughly two hours of heavy testing.

### 8. Exercise media licensing

The free vendor tier is demo-grade and explicitly disposable. The licensed tier is the launch-safe version, and it is real money that gates launch.

### 9. Two-person bus factor

Both founders are full-stack and pair on the work — good for shared context, bad for redundancy in the areas where a silent bug is expensive. Currently no `CONTRIBUTING.md` exists to carry the review rule.

---

## Standing operational notes

### The verification gates

What actually exists today:

```
pnpm --filter @rebound/api run typecheck
pnpm --filter web run typecheck
pnpm --filter web run build
```

Plus, for anything user-facing: **a real click-through in a browser.**

`pnpm lint`, `pnpm test`, and `pnpm check:rls` are referenced elsewhere in these documents. **None of them exist yet.** Do not cite them as passing.

**Typecheck-clean is not evidence.** Every real bug in v1 was found by a human using the app — the scroll trap, the missing back buttons, the day-boundary session bug, the duplicate active regimes, the CSP auth flakiness, the invisible admin permission error. Not one was caught by inspection or by the type system.

### Environment and tooling traps, learned in this repo

- **pnpm 11 blocks postinstall scripts by default.** A dependency with a native build step silently does nothing and fails later with no obvious cause. Add it to `allowBuilds` in `pnpm-workspace.yaml`. Note that `onlyBuiltDependencies` is the pnpm 10 spelling — pnpm 11 still reports it via `pnpm config` but **ignores it at install time**, so it looks configured while doing nothing.
- **pnpm enforces a `minimumReleaseAge` supply-chain policy here.** Packages published within roughly the last day are rejected. Prefer pinning a slightly older version over adding an exclusion. Changing a version in `package.json` is not enough — a stale lockfile still fails; `pnpm clean --lockfile && pnpm install` rebuilds it.
- **`prisma`'s npm `latest` tag pointed at a release candidate** (`8.0.0-rc.12`) as of 2026-09-01. Unpinned installs picked up an RC CLI against a stable client. Every dependency in this repo is pinned exactly, no carets, for this reason.
- **Do not name the API's port `PORT` in the root `.env`.** `dotenv-cli` injects the root file into every app, and Next.js reads `PORT` as its own — the two servers then fight over one port. It is `API_PORT`.
- **On Windows, killing a dev server's wrapper process does not kill the server.** `tsx watch`'s own reload does not reliably free the port either. A stale listener keeps serving old code while looking healthy. Check `netstat -ano | findstr :4000` before believing a restart took effect.

### Things CI must never do quietly

- **Skip a test for missing credentials.** v1's cross-user RLS isolation test self-skipped when database secrets were absent. Those secrets were never added, so **CI reported green for the entire project without ever having proven isolation.**
- **Omit lint.** v1 had a lint task CI never invoked and four standing errors nobody fixed.
- **Pass an eval whose failures were excluded from the mean.**

### Branch and review model

- `main` is the working branch today. There is no protection and no PR requirement yet.
- The intended model — `feature/<name>` → `dev` → `main`, `main` protected, one drives one reviews on clinical rules / RLS / agents — is a target, not current practice.
- **Delete feature branches after merging.** v1 accumulated ten stale branches despite having exactly this convention written down.
- **No `stage` tier.** v1 set one up and never used it; it went 49 commits stale and was dropped. Don't build process tiers you won't use.

### Documentation rules

- **When this document and the code disagree, the code wins** — and this document is wrong and should be fixed. v1's equivalent doc carried the right warning: *"Treat any narrative claim in it as provisional until checked against the actual code, git log, and running system."*
- **This file updates in the same commit** as the work it describes.
- `DATA_MODEL.md` updates in the same commit as the schema change.
- **ADR for any decision** that changes an interface, a dependency, or a data shape. The `adr/` directory does not exist yet; several decisions listed below are already owed one.

---

## Decisions made without an ADR — owed one

Recorded here so they are not re-litigated from scratch the way v1's API layer was:

| Decision | Date | Supersedes |
|---|---|---|
| Bare-bones first; build the target architecture incrementally | 2026-09-01 | `GAME_PLAN.md`'s M2→M3 "foundation up front" ordering |
| Next.js web is the only client surface for now | 2026-09-01 | "Mobile-first (Expo), web is marketing only" |
| Supabase hosted Postgres | 2026-09-01 | "`docker compose up` → Postgres + API, no external accounts" |
| No Docker | 2026-09-01 | Containerized API + local Postgres |
| No ORM; `pg` and hand-written SQL | 2026-09-01 | "Prisma migrations, committed, from the first commit" |
| Plain `node:http`; no web framework | 2026-09-01 | "Hono or Fastify. Either is fine; pick one" |
| Auth deferred entirely | 2026-09-01 | Better Auth, self-hosted |

**Three of these give up something v1 paid for.** Dropping Docker and hosted-DB-only development reintroduces the exact condition `TDD.md` calls *"the single worst part of the v1 codebase for onboarding a second person"* — a clone that cannot run without live external accounts. Dropping migrations reintroduces v1's `db push` history problem. Dropping the safety layer is fine only while the data is mock. These are acceptable trades for a bare-bones slice and **actively harmful to keep past it.**

---

## Deferred, deliberately

Recorded so they get decided rather than rediscovered:

- **Expo / mobile.** Not started. v1's worst local-setup pain point (Expo Go + LAN networking) remains completely unvalidated.
- **Server push notifications.** Local on-device notifications are the v1 design and they work.
- **Caching and connection pooling.** v1's performance work was, in its own words, "fully unstarted." Fine for now; know that it's a known zero.
- **Vector/embedding retrieval.** Skeleton retrieval is a structured filter and that's correct at this scale. **No vector database is warranted at any point on the current roadmap.**
- **Multi-goal tracking.** The target schema allows it; the product doesn't implement it.
- **Camera-based form tracking.** Out of scope entirely.

---

## Features abandoned in v1 — do not re-attempt without a new reason

| Feature | What it cost | Why it's here |
|---|---|---|
| **Sunset/geolocation evening scheduling** | Fully built and verified against real coordinates, then deleted two days later. Required an irreversible destructive schema change against the live database. | Complexity without payoff. **Build the boring version of scheduling.** |
| **Global swipe-to-navigate gesture** | Four native rebuild cycles at ~15 minutes each, root cause never confirmed, fully reverted. | The actual user problem — getting stuck on a screen — was solved by **a back button.** |

---

## A practice worth keeping

From v1, and it paid off measurably: **draft a migration or refactor plan on a cheaper model, then review that plan against the real source on a stronger one before executing.** On the one occasion this was done, the review pass **found six real errors in the first draft, two of which would have caused genuine production bugs** — one referenced a call site that didn't exist, another missed a silent-failure risk.
