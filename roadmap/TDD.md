# Rebound.ai TDD

*Technical Design Document — architecture, stack, and system design. For product intent, see [`PRD.md`](./PRD.md). For the schema, see [`DATA_MODEL.md`](./DATA_MODEL.md). For the build agenda, see [`GAME_PLAN.md`](./GAME_PLAN.md). For current state, see [`ENG_PLAN.md`](./ENG_PLAN.md).*

> **⚠️ Read this first — current state, 2026-09-01.** This document describes the **target** architecture. It is not a description of the code. As of 2026-09-01 the repo holds a deliberately bare-bones vertical slice, and most of what follows is unbuilt. See the *Current implementation* section immediately below for what actually exists, and [`ENG_PLAN.md`](./ENG_PLAN.md) for the authoritative running state.

---

# Current implementation

**Decided 2026-09-01, on advisor guidance: start small.** The target below has not changed and remains the point of the project. What changed is the order — build the smallest working thing, then add complexity one deliberate piece at a time.

```
┌──────────────┐        ┌─────────────────────────┐       ┌──────────────┐
│ apps/web     │ HTTP   │ apps/api                │  pg   │  Supabase    │
│ Next.js      │ ─────▶ │ plain node:http         │ ────▶ │  Postgres    │
│ React 19     │  JSON  │ no framework, no ORM    │       │  (hosted)    │
│ :3000        │        │ :4000                   │       └──────────────┘
└──────────────┘        │   GET  /health          │
                        │   POST /regime  ────────┼──▶ Gemini (@google/genai)
                        └─────────────────────────┘
```

| Layer | Target (below) | Actually built |
|---|---|---|
| Client | Expo mobile app; web is marketing only | **Next.js web app, the only surface** |
| API | Containerized Hono/Fastify, REST + OpenAPI | **Plain `node:http`, no framework, no spec** |
| Contracts | Zod → generated `openapi.json`, CI drift check | none |
| Auth | Better Auth, self-hosted | **none — every request is anonymous** |
| Database | Postgres in Docker, managed in prod | **Supabase hosted Postgres only** |
| Data access | Prisma, committed migrations | **`pg` + hand-written `db/schema.sql`, no migrations** |
| Safety | `packages/clinical-rules` validates every regime | **none — Gemini freely picks sets and reps** |
| Packages | nine workspace packages | **two: `apps/api`, `apps/web`** |
| Local dev | `docker compose up`, no external accounts | **no Docker; requires live Supabase + Gemini key** |

**What this trade costs, stated plainly.** Dropping Docker and local Postgres reintroduces the condition this document calls *"the single worst part of the v1 codebase for onboarding a second person"* — a clone that cannot run without live external accounts. Dropping migrations reintroduces v1's `db push` problem. Dropping the safety layer is acceptable **only while the data is mock**. These are reasonable trades for a bare-bones slice and actively harmful to keep past it. Every one of them is recorded in `ENG_PLAN.md` under *Decisions made without an ADR — owed one*.

---

> **v2 note.** This is a rewrite. Every stack decision here is either newly made or newly re-confirmed, and each has an ADR in `adr/`. Where v1 made a different call, the reason for changing is stated — because v1's most expensive mistakes were decisions that got reversed after they'd been built on.

---

# Architecture at a glance

> **Target, not current.** See *Current implementation* above for what exists today.

```
┌─────────────┐         ┌──────────────────────────────────┐
│ apps/mobile │ ──────▶ │ apps/api  (containerized)        │
│   Expo      │  HTTPS  │  ├── handlers  (REST, OpenAPI)   │
│   the app   │         │  ├── auth      (Better Auth)     │
└─────────────┘         │  └── rate limit / CORS           │
                        └────────┬──────────────┬──────────┘
┌─────────────┐                  │              │
│ apps/web    │                  ▼              ▼
│  marketing  │         ┌────────────────┐  ┌──────────────┐
│  only       │         │ packages/      │  │ packages/db  │
└─────────────┘         │  agents        │  │  Prisma      │
                        │  (Gemini)      │  │  Postgres    │
┌─────────────┐         │       │        │  └──────────────┘
│ worker      │ ──────▶ │       ▼        │
│  scheduler  │         │ packages/      │
│ (container) │         │  clinical-rules│  ← pure, no deps
└─────────────┘         └────────────────┘
```

**The load-bearing idea:** rules decide *who is eligible for what intensity*, the LLM decides *which exercises and which slot within those bounds*, and rules validate the result before a user sees it. Everything in this document exists to keep those three layers separable and independently testable.

---

# Repo layout

> **Target, not current.** The repo currently contains exactly two packages: `apps/api` and `apps/web`. None of `apps/mobile`, `apps/worker`, `packages/db`, `packages/contracts`, `packages/clinical-rules`, `packages/agents`, `packages/design-tokens`, or `adr/` exist.

```
apps/api               Standalone REST API service. Its own Dockerfile.
apps/mobile            Expo Router. THE product.
apps/web               Marketing, pricing, legal. Deployed separately.
apps/worker            Scheduler: Flow B cycle, day-4 check. Containerized.
packages/db            Prisma schema, migrations, seed scripts, vendored exercise data.
packages/contracts     Zod schemas → generated OpenAPI spec. Zero DB/LLM deps.
packages/clinical-rules Pure deterministic safety logic. Zero DB/LLM deps.
packages/agents        Gemini orchestration, Flow A/B, eval harness.
packages/design-tokens  Shared design tokens. Built in M12, not before.
adr/                   Architecture decision records.
```

**Two packages are deliberately dependency-free** and this is not an accident:

- `packages/clinical-rules` — so a physical therapist can read and review it without reading the app, and so it can be exhaustively unit-tested without infrastructure. This was the single strongest asset v1 produced.
- `packages/contracts` — because `packages/agents` builds LLM clients eagerly at module load, and the contracts package must be importable by anything without dragging that in.

---

# [v2] Backend: a standalone containerized API

> **Superseded 2026-09-01 (partly).** The API is standalone and separate from the web app, as described. It is **plain `node:http`, not Hono or Fastify**, and it is **not containerized** — Docker was dropped. The framework choice below is still open.

**Decision:** `apps/api` is its own Node service with its own Dockerfile, not route handlers inside the web app.

**Why the change.** v1 put the entire API inside Next.js route handlers alongside the marketing site. That made sense when web *was* the product. It doesn't now: mobile is the product, and the API is mobile's backend. Coupling it to a marketing site's deploy cycle is wrong, and route handlers don't containerize cleanly.

- Framework: Hono or Fastify. Either is fine; pick one, write the ADR, don't revisit.
- Handler composition: `withCors(withRateLimit(policy)(withAuth(handler)))`.
- Handlers are framework-agnostic functions taking `(ctx, input)`, so the HTTP layer stays thin and handlers stay unit-testable.
- **REST, contract-first.** Zod schemas in `packages/contracts` generate a committed `openapi.json`; a typed client is generated from it for mobile. CI fails on drift between the schemas and the committed spec.

> v1 chose tRPC, then rewrote the entire API layer to REST on day eight because a colleague suggested REST would serve the project better long-term. The rewrite was executed well — eight incremental phases, coexistence throughout — but it was a full API rewrite eight days into an eight-week build. **The API shape is settled here and is not revisited. Write the ADR so the reasoning survives.**

### Errors

Handlers return typed error shapes. **Internal exception text never reaches a client.** v1's error formatter returned `error.message` for every error, which meant raw Prisma and model-provider exception strings were returned by the job-status endpoint — and rendered directly into the onboarding UI.

### Rate limiting

Postgres-backed, not Redis: a single `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, atomic under concurrency, no extra infrastructure. Policies: onboarding tightest, ordinary mutations moderate, reads loose, unauthenticated tightest of all and IP-keyed.

Two things to fix from v1: it **failed open** on database error, which under real connection exhaustion let traffic through rather than shedding it; and a load test at 20 concurrent requests exhausted the connection pooler's client limit. Decide the fail-open-versus-fail-closed policy deliberately and write it down.

---

# [v2] Local development: Docker

> **Superseded 2026-09-01.** Docker was removed from the project. Local development talks directly to hosted Supabase, which means a clean clone **does** require external accounts — the exact failure mode this section was written to prevent. Re-read this section before adding the second developer.

**Decision:** `docker compose up` gives a complete, working stack. No external accounts required.

```yaml
services:
  postgres:   # postgres:17, volume-persisted, seeded
  api:        # apps/api, hot-reload in dev
  worker:     # scheduler; can be scaled to 0 locally
```

The mobile app runs outside the container (Expo needs the host's network and a real device or emulator) and points at the API over LAN.

**Why this is a first-class requirement, not a nicety.** v1 could not be run locally at all. It required a live hosted database, a live auth provider, and live model API keys before anything would start — and the model provider's API key was absent from every `.env.example` and from the build's environment allowlist, so a new developer cloning the repo would have hit a silent failure with no useful error. That is the single worst part of the v1 codebase for onboarding a second person, and it is exactly the situation now.

**Done-when for the environment:** a co-founder on macOS clones, follows `CONTRIBUTING.md`, and reaches a running API and a passing test suite with no accounts and no messages.

### Environment variables

- **One root `.env`.** v1 had four, all pointing at the same real credentials, with different scripts requiring different ones.
- **One `.env.example`, complete and accurate.** Verified by a startup check that fails loudly and readably on a missing variable.
- **Never put real secrets in `.env.example`.** This happened twice in v1 and had to be cleaned up both times.

---

# [v2] Auth: Better Auth, self-hosted

> **Not built as of 2026-09-01.** There is no auth of any kind. No users, no sessions, no ownership. Everything below is target.

**Decision:** Better Auth, tables in our own Postgres.

**Why the change from a hosted provider:**

1. **It runs inside Docker.** No external account needed for local development — which is the entire point of the section above.
2. **We own the user table.** v1 used the auth provider's user id directly as its primary key, coupling the whole schema to a vendor.
3. **It removes a launch blocker.** v1 shipped its beta on the provider's *Development* instance and never cut over to Production, because that was blocked on having a custom domain. Every security setting — email verification, password strength, lockout, bot protection — had been confirmed on Development only, and Dev and Prod settings were independent.
4. **It removes an entire class of CSP bug.** Three separate CSP failures in v1 traced to the hosted auth provider's scripts, workers, and CAPTCHA hosts. One of them — a missing `worker-src` directive blocking the session-refresh worker — presented as *intermittent unauthorized errors on mutations while queries kept succeeding*, and took a long time to diagnose.

**What we take on:** session security, email verification, and password reset are now ours. This is a real cost and the ADR should say so.

Mobile holds a bearer token; the API validates it. Session refresh is handled in the app's API provider layer.

---

# Database

> **Superseded 2026-09-01.** Supabase hosted Postgres, accessed with `pg`. **No Prisma, no ORM, no migrations** — one hand-written `db/schema.sql`, applied by a re-runnable setup script. The three-client RLS design below is entirely unbuilt, and the `exercises` table currently has **no RLS decision at all** — see `ENG_PLAN.md` risk #1.

- **Postgres.** Local in Docker, managed in production.
- **Prisma** as the ORM.
- **[v2] Migrations, committed, from the first commit.** v1 used `prisma db push` exclusively for its entire lifetime. There was no migration history — schema evolution was git-diff archaeology, and one schema change was applied to the live database with `--accept-data-loss` as an irreversible operation.

### Row-Level Security — two-tier trust model

Carried forward from v1 essentially unchanged. This design was correct.

- **Privileged connection** — owns the tables, RLS never applies. Used by the agents package and the worker.
- **Restricted connection** — a limited role, used only inside the authenticated request path, in a transaction that sets the current user id via a parameterized `set_config()`.
- **Admin-narrowed client** — a further-restricted view of the privileged client, typed *and* runtime-enforced to only the non-user-owned models, and blocking raw query methods. It runs outside a transaction deliberately, because a real admin-triggered generation call routinely exceeds the ORM's interactive-transaction timeout. v1 learned this the hard way: wrapping an admin procedure's whole body in a transaction produced `P2028 Transaction already closed` on every real LLM call.

### Policy shape

- One row-ownership policy per user-owned table.
- Child tables reached via an `EXISTS` subquery against the parent.
- **Shared-library tables (exercises, presets) get RLS enabled with a permissive read-only policy** — not "RLS off." This matters if the production host auto-generates an API over the database, as some do: RLS-disabled then means *publicly readable regardless of what your application code does.* v1 had **seven tables** exposed this way, caught by the vendor's own linter rather than by review.
- Admin and system tables get RLS enabled with **zero** policies — default deny.

### The coverage check

`pnpm check:rls` parses every model in the schema against every `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` in the policy SQL, and fails CI on any table without an explicit decision. It needs no database, so it always runs.

This exists because after v1 fixed the seven exposed tables, **one table regressed to no-RLS and went undetected** until a later audit. Vigilance failed; a parser didn't.

**Plus a real cross-user isolation test** — one user attempting to read another's rows through the restricted connection. **[v2] It must fail in CI if it cannot run.** v1's version self-skipped when database credentials were absent, the credentials were never added as CI secrets, and CI therefore reported green for the entire project while having proven nothing about isolation.

---

# [v2] Exercise data: AscendAPI only, vendored

**Decision:** one source, committed to git as a normalized snapshot.

```
packages/db/data/exercises.json     ← committed, the source of truth for seeding
packages/db/scripts/fetch-catalog.ts ← run occasionally, regenerates the snapshot
packages/db/scripts/seed.ts          ← reads the local file only. Never hits a network.
```

**What this replaces.** v1 had two sources that were never designed to interoperate:

- One supplied the *text data* the model reasoned over — public domain, permanently usable, but thin and with no images.
- The other supplied the *GIFs* users need to actually perform a movement — a free vendor tier, explicitly disposable.

They shared no identifiers, so they were joined with **Jaccard similarity over normalized word sets**, with a supporting muscle-overlap signal. It was carefully built and it still only covered **486 of 873 exercises**. The remaining 44% fell back to static images from the other source — which were then **blocked by CSP in production**, because that host was never added to the image allowlist.

Worse, the GIF backfill was a *live-data mutation, not tracked by git.* A fresh database clone had zero GIFs unless someone remembered to run the script.

**What the single vendored source buys:**

- Seeding is **offline, deterministic, and identical** on both machines and in CI
- No fuzzy matching, no coverage gap, no lossy category/level/equipment remapping
- No rate limits during setup — which matters, because this vendor's free tier sits behind a Cloudflare burst limiter far tighter than its documented 1,000 req/hr. v1 lost **two scripting attempts** to it before landing on bulk pagination with a delay.
- Upgrading to the licensed tier is a snapshot swap, not a re-architecture

**Fetch script rules:** paginate at 25 with a ~2s delay; never fan out per-exercise; handle 429 and 503 with backoff. It is run rarely and deliberately, never as part of setup.

### Schema notes

- `media` is a **typed column**, not an untyped JSON blob blind-cast at the API boundary
- One shared media-rendering helper. v1 duplicated the same defensive parser byte-for-byte across two apps.
- `frequency` is an **enum**. v1's was free text and its own baseline captures contain `"DAILY"`, `"daily"`, `"3X_WEEK"`, `"3X_PER_WEEK"`, `"2x/week"`, `"3-4x/week"`, and `"7x/week"` — all from one field.

### Enrichment

Two derived fields the retrieval layer depends on:

- **`movementPattern`** — ~12–15 canonical patterns (horizontal and vertical push and pull, hip hinge, squat, lunge, rotation, anti-rotation, spinal flexion and extension, scapular retraction and protraction, ankle dorsi- and plantarflexion). Batch-classified by LLM using a **stronger model than the production default**, with an exact-ID echo-back requirement, and a human spot-check of 50–100 rows.
- **`progressionGroup`** — progression chains (`wall pushup → incline → standard → decline → weighted`). Derived deterministically where possible.

**Both are AI-generated metadata with a human spot-check, not PT-authored content.** That distinction matters for the clinical conversation and should not blur.

---

# [v2] LLM layer: Gemini only

**Decision:** Gemini is the sole provider. The model id is a configuration value, swappable without code changes.

**Why single-provider, deliberately.** v1 ran two SDKs and a translation adapter that normalized one provider's API into the other's shape. The adapter was clever and it carried a genuine, dangerous bug: **it dropped the system prompt entirely** on the production path. Every piece of grounding and prompt-engineering work would have been silently dead on arrival in production. It was caught by inspection, not by any test.

One provider, no adapter, no translation layer, no class of bug where a prompt silently doesn't arrive.

**Why this is written down at all:** v1 swapped from Claude to Gemini for cost reasons *without a decision record*, and its own TDD flagged that the swap "hasn't gone through the same explicit 'resolved' write-up the original decision got." This is that write-up. The choice is cost-driven and it is deliberate.

### Structure

```
packages/agents/
  client.ts        Model config, one place. REGIME_MODEL, CLASSIFIER_MODEL, JUDGE_MODEL.
  models.ts        Selectable models + per-token pricing. Feeds cost logging.
  call-logger.ts   Wraps EVERY call. One log row per call, success or failure.
  prompts/         [v2] Prompts as versioned files, not inline template literals.
  flow-a.ts        Initial generation.
  flow-b.ts        Recursive adjustment.
  tools/           search-exercises, submit-regime, submit-adjustment, classifiers.
  eval/            Rubric, judge, runner.
```

**[v2] Prompts live in `prompts/`, versioned.** v1 kept every prompt as an inline template literal inside the flow files, with no versioning and no registry. That is also why a rubric change mid-eval-run was invisible in the resulting reports.

### Call logging

Every call — production and admin-triggered — is wrapped by one logging function that writes a row on **success and failure**: flow, source, model, group id and sequence index (so a multi-turn tool loop can be reconstructed), token counts, latency, cost, stop reason, and the full request and response payloads.

This is the only LLM observability that exists and it earns its place: it's what makes the unit-economics calculation possible.

### Hard rules for the agent layer

These are not style preferences. Each maps to a v1 production bug.

1. **Tool output from the model is parsed and validated before use.** v1 called `.map()` on raw tool input and hard-crashed on a genuine model response.
2. **Every tool-use loop has a maximum turn count.** v1's loops were `while (true)`, bounded only by a self-correction counter — a model that kept searching and never submitted would loop forever.
3. **Generous max output tokens.** A full 10–12 exercise regime plus reasoning needs real headroom. v1 hit truncation at a smaller default.
4. **The prompt-assembly layer is unit-tested.** Assert the system prompt is actually present in the assembled request. See the dropped-system-prompt bug above.
5. **Every call site threads the full user context.** v1 loaded the user's available equipment and then silently dropped it on the Flow B path and the admin test path, so equipment filtering never applied there.
6. **Free text is passed as delimited user content**, never concatenated into system instructions, and length-bounded at every call site that reads it.
7. **Self-correction budget inside the loop.** An invalid exercise ID or a malformed tool-call shape feeds an error back into the same turn rather than crashing — capped, then falling through to the outer retry.

### Flow A

Red-flag screen (rules) → free-text classifier (cheap model) → risk tiering (rules) → **skeleton retrieval** → LLM fills slots by exercise ID → structural validation → clinical validation → retry with the rejection reason as context → preset fallback, re-validated before persisting.

**Skeleton retrieval is a structured filter, not RAG.** It narrows hand-authored protocol skeletons by goal × risk tier, then keyword-matches body-region tags against free text. There is no vector database and no embedding index. For a library this size that would be premature — and if embedding-based retrieval is wanted later to handle synonymy ("overhead reach" versus "shoulder flexion drill"), embeddings for a few thousand rows load into memory at startup. No vector database is warranted at any point on the current roadmap.

> **⚠ Under reversal, 2026-09-01.** The Flow A pipeline in `USERFLOW.md` §1a Phase 5 introduces a **retrieval corpus of clinical literature** with hybrid BM25 + dense search, reciprocal rank fusion, and a `RetrievalEvent` table. Read carefully, that is not quite a contradiction of the paragraph above: *skeleton selection* stays a structured filter (Phase 4 is unchanged), and what is new is a second corpus this decision never contemplated. But the sentence above says *no vector database at any point*, and the new design needs one. **This requires an ADR that states what changed, before the work starts** — not a quiet edit to this paragraph afterwards. Until that ADR exists, treat both as open.


Flow A runs as an async job with client polling. The job's error field is **never returned to the client**.

### Flow B

Trailing-window session logs → LLM proposes hold / progress / rollback plus re-slotting → clinical validation *with* the delta check → one retry with the rejection reason → persist a new regime version and an adjustment event.

### Escalation monitor

Runs inline on **every** session-log write. **Rules only. Never calls an LLM.** This is what makes the real-time safety backstop structurally immune to provider outages, and it is the reason it lives in `packages/clinical-rules` rather than in `packages/agents`.

Given the literature finding in `PRD.md` — that the real injury-risk signal is single-session spikes rather than weekly percentages — this component is arguably the clinically load-bearing one. Treat it accordingly.

---

# [v2] Eval harness — built before Flow A

**Decision:** the eval harness is a first-class subsystem, built *before* the pipeline it measures, and gating CI.

v1 built it on day 10, after the pipeline was written. Mean regime quality never exceeded **2.58/5**.

### Rubric

LLM-judged dimensions (movement-pattern coverage, dose calibration, session-slot coherence, muscle-group balance, difficulty appropriateness) plus deterministic binary checks computed in code (equipment compliance, structural completeness).

v1's design note here is correct and worth preserving verbatim: *asking an LLM to re-derive something a `filter()` already answers exactly just adds cost and flakiness without adding signal.*

### Three harness bugs to fix by construction

1. **The mean must not be computed over successes only.** One v1 report reads `meanOverall: 2.60, fixtureCount: 9` — while **7 of the 9 fixtures failed to generate at all.** Read side by side with the others it looks like the best result ever recorded. It is the worst. Failures count, or the report refuses to print a mean.
2. **Persist the error.** v1's failures were `{fixtureId, generationStatus: "ERROR", score: null}` with no diagnostic at all.
3. **Stamp the rubric version in every report.** A dimension was renamed and rewritten mid-run in v1, so a score jump from 2.24 to 2.53 was partly a rubric change, not a model improvement — and nothing in the output said so.

Also: that same report showed `deterministicFailures: 0` alongside seven generation errors, because the counter only inspected scored results. **No counter may silently exclude the failure case.**

### The judge, under a single provider

v1 deliberately used a **different model family** for judging than for generating, to avoid same-family self-flattery. Single-provider forfeits that mitigation. Compensations, all required before the M8 quality gate is trusted:

- The judge uses a **stronger Gemini model** than the generator.
- Judge scores are **spot-checked against human judgement** on a fixture sample at least once.
- If judge–human agreement is poor, the gate is revisited. **A floor gate against an untrustworthy judge is worse than no gate**, because it manufactures false confidence.

### CI gate

Any PR touching `packages/agents` or `packages/agents/prompts` runs the eval and fails on a score regression.

### Golden dataset

Start at 20–30 fixtures, grow toward 100. v1 had 9, and its two worst-scoring fixtures were the injury-specific ones — which is to say, the actual product premise.

---

# Mobile

> **Not started as of 2026-09-01.** No Expo, no mobile app. Expo Go + LAN networking remains completely unvalidated.

- **Expo + Expo Router.** Bottom tabs from the start: Today · Progress · Plan · Account.
- **Expo Go until a native module forces a dev build.** Fast iteration, and the co-founder needs no Apple Developer account.
- **Zero new native dependencies without a real reason.** Every one costs a rebuild cycle. v1's global swipe-navigation feature burned **four EAS rebuild cycles** chasing a root cause that was never confirmed, and was then fully reverted — the underlying user problem (getting stuck on a screen) was solved by a back button.
- **Two local on-device notifications per day.** Not server push. Recomputed on app open.

### Navigation invariants

v1's real-device testing found users **physically stuck** three separate times. These are invariants, not guidelines:

- Every screen has a way back. No exceptions.
- Every terminal screen has a forward action.
- Scroll containers use `flexGrow`, never `flex`, on content style.
- Safe-area insets are actually applied.

### Accessibility

Text scaling (~1.3×) and a 44px minimum tap target everywhere. Elderly users are an explicit audience; this is a baseline, not a polish item.

---

# Web

> **Superseded 2026-09-01.** `apps/web` is Next.js and is currently **the product**, not marketing. It is the only client surface.

Marketing, pricing, and legal only. Next.js, deployed independently of the API. It shares design tokens with mobile — **tokens, not components.** Sharing components across React and React Native was considered in v1 and correctly rejected.

---

# Testing

| Layer | Approach |
|---|---|
| `clinical-rules` | Exhaustive unit tests. This is the safety layer. |
| `contracts` | Schema round-trip tests; CI drift check on the generated spec. |
| `api` handlers | Unit tests against a test database in Docker. **[v2] v1 had zero.** |
| `agents` | Prompt-assembly tests, tool-parsing tests, plus the eval harness. **[v2] v1 had zero.** |
| `db` | Cross-user RLS isolation, genuinely running in CI. |
| mobile | Component tests for the session player and check-in. |
| e2e | A real click-through on a real device before anything ships. |

**The standard, carried verbatim from v1:** verified against the real database and real model API — not mocked — including real cross-user isolation tests and real forced-failure tests (invalid API keys, to genuinely exercise the fallback paths).

**And the finding that standard came from:** every real bug in v1 was found by a human using the app. Not by inspection, not by typechecking. The scroll trap, the missing back buttons, the day-boundary session bug, the duplicate active regimes, the CSP auth flakiness, the invisible admin permission error. **Typecheck-clean was never evidence of anything.**

---

# CI

> **Partly built as of 2026-09-01.** CI runs install → typecheck (api) → typecheck (web) → build (web). There is **no lint, no test, no RLS check, and no eval gate** — those commands do not exist in the repo.

Install → generate → **lint** → typecheck → test → RLS coverage → OpenAPI drift.

- **Lint runs.** v1 had a lint task CI never invoked and four standing errors nobody fixed.
- **One TypeScript version.** v1 had three different majors across seven workspaces.
- **No test may silently skip.** Missing credentials fail the build.
- Eval gate on agent-touching PRs.

---

# Deployment

> **Not started as of 2026-09-01.** Nothing is deployed. Note that dropping Docker removes the portability this section relies on.

**[v2] Deferred by design.** Because the API is a container and the database is plain Postgres with real migrations, the production choice can be made at `GAME_PLAN.md` M14 with real requirements rather than assumed at the start. Avoid vendor-specific code until then.

What must be true whenever it is decided:

- **Automated deploy on merge.** v1 deployed manually with a CLI for its entire lifetime.
- **Error monitoring wired in.** v1 named it in its stack decision and never wired it up — it had *no error monitoring at all*, for the whole build.
- Backups configured, and a restore actually tested.
- The scheduler runs as a container, so background work is reproducible locally rather than depending on a hosting provider's cron.

### If the host auto-exposes the database over an API

Some managed Postgres providers generate a REST API over every table in the public schema. Under that model, **RLS-disabled means publicly readable**, regardless of your application code. The `check:rls` gate covers this. Keep it regardless of where you land.

---

# Security

- **CSP with a per-request nonce** on the web app. `unsafe-eval` in development only.
- **Any new external host on any page requires a matching CSP entry in the same commit.** Three separate CSP misses shipped silently in v1: a missing `worker-src` (which presented as intermittent auth failures), missing CAPTCHA hosts, and a missing image host (which silently blocked every exercise GIF). There is no automated check for this yet. There should be.
- One near-miss worth recording: adding `strict-dynamic` would have broken **every sign-in**, because the auth provider's script loaded without a nonce and `strict-dynamic` tells browsers to ignore the host allowlist. It was caught by diffing the actual response body against the header — not by reading the spec.
- Static security headers: frame-deny, nosniff, referrer policy, permissions policy, HSTS.
- Internal error text never crosses the API boundary.
- Free-text input length-bounded and delimited.

---

# Known gaps to close deliberately

Carried from v1 so they are decided rather than inherited:

- **Workout session rows must exist for future days.** v1 created them once, for the current day only, at activation. Crossing midnight silently disabled "mark complete" with no feedback. It was patched with a lazy self-heal, but the gap remained and it blocks any server-side push notification.
- **Flow B's due-user query** anchored to the most recent adjustment event of *any* type. v1 called this "reasonable, not spec-perfect." Decide it properly.
- **Cancellation reason codes must persist to the database.** v1 validated and logged them without storing them, so the churn guardrail metric had no data behind it.
- **Rate limiter fail-open policy** — decide explicitly.
- **Caching and connection pooling** — unaddressed in v1. Performance work was, in its own words, "fully unstarted."

---

# Two invariants that must be tests, not prose

Added 2026-09-01 with the Flow A pipeline design (`USERFLOW.md` §1a). Both are the kind of rule a future contributor breaks while trying to make something better, and neither fails loudly when broken:

1. **The constraint envelope is immutable once computed.** Built in Phase 3 from tier ceiling, `ABSOLUTE_BOUNDS`, equipment, and difficulty cap; passed down the whole pipeline. Nothing downstream — not retrieval, not the model, not a slot fallback — may widen it.

2. **The validator receives the draft and the tier, and nothing else.** It never sees retrieved context. Retrieved literature may inform which exercise is selected and how the page words a justification; it may never loosen a bound. The likely breakage is someone threading retrieved text into the validator to produce better rejection messages.

Both should be enforced by a test that fails when the signature widens, not only by a sentence in a document. `packages/clinical-rules` is dependency-free precisely so this is cheap.

---

# Decision log

The `adr/` directory exists as of 2026-09-01. Entries 0002–0012 are decisions taken before it existed and are **not yet written up**; 0001 and 0013–0019 are. The list, for orientation:

| ADR | Decision |
|---|---|
| 0002 | Mobile-first; web is marketing only |
| 0003 | Standalone containerized API service |
| 0004 | Docker Compose for local development |
| 0005 | Better Auth, self-hosted |
| 0006 | AscendAPI as sole exercise source, vendored |
| 0007 | Gemini as sole LLM provider |
| 0008 | REST, contract-first, OpenAPI-generated client |
| 0009 | Prisma migrations from the first commit |
| 0010 | Two-tier RLS trust model |
| 0011 | Eval harness before Flow A, CI-gated |
| 0012 | Production hosting deferred to M14 |
| 0013 | Clinical-literature retrieval corpus — **Proposed**, gated on the Phase E prototype |
| 0014 | `withSession` — client-supplied session id as the RLS subject. **Accepted**, supersedes 0005 |
| 0015 | Fail closed on classifier unavailability — **Proposed**, blocked on a review queue |
| 0016 | Sourced clinical justification in the UI — **Proposed**, gated on legal review |
| 0017 | Raw SQL + node-pg-migrate; no ORM. **Accepted**, supersedes 0009 |
| 0018 | Next.js web is the only client for now. **Accepted**, supersedes 0002 |
| 0019 | Local development runs against hosted Supabase. **Accepted**, supersedes 0004 |

**The habit matters more than any individual record.** v1's decisions were mostly good and lived nowhere durable, so one of them was re-litigated from scratch and cost a full API rewrite eight days in. An ADR is fifteen lines.
