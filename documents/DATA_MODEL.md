# Rebound.ai Data Model

*The authoritative schema reference. For product intent, see [`PRD.md`](./PRD.md). For architecture, see [`TDD.md`](./TDD.md).*

> **When this document drifts from the actual schema, the schema wins.** Update this file in the same commit as the schema change.

> **⚠️ Current state, 2026-09-01.** Everything below is the **target** model and is almost entirely unbuilt. There is no Prisma, no `packages/db`, and no migrations. The live Supabase database contains **exactly one table**, defined by hand in `apps/api/db/schema.sql`:
>
> ```sql
> create table if not exists exercises (
>   id          uuid primary key default gen_random_uuid(),
>   name        text        not null,
>   body_region text        not null,
>   description text        not null,
>   created_at  timestamptz not null default now()
> );
> create index if not exists exercises_body_region_idx on exercises (body_region);
> ```
>
> It holds 30 generated mock rows across 10 body regions, applied and reseeded by `pnpm --filter @rebound/api run db:setup`. Note it is **not** the `Exercise` entity described below — no AscendAPI fields, no media, no muscle tags, no risk metadata. It is a placeholder shaped for a demo.
>
> **It also has no RLS decision.** Supabase exposes `public` schema tables through PostgREST, and a table without RLS is reachable with the project anon key. That is harmless for mock data and is the exact pattern that exposed seven tables in v1 — see the *RLS decisions* section below, which remains correct and unimplemented.

> **v2 note.** Rewritten. The core entity design from v1 was sound and is carried forward. What changed: identity is ours, the exercise table is single-source, `media` and `frequency` are properly typed, and **every table gets an explicit RLS decision enforced by CI**.

---

# Conventions

- **Migrations, always.** Every schema change is a committed Prisma migration. **[v2]** v1 used `prisma db push` for its entire lifetime and had no migration history at all.
- **Every new table requires an explicit RLS decision** recorded in `packages/db/sql/rls-policies.sql`, or `pnpm check:rls` fails the build. This is enforced, not a reminder — see the note under *RLS decisions* below for why.
- **Update this document in the same commit** as the migration it describes.
- Prisma treats an explicit `undefined` as "don't touch," not "set null." This is relied on deliberately in onboarding upserts.

---

# Entity map

```
User ──┬── Regime (versioned) ──── RegimeExercise ──── Exercise
       │        │
       │        └── AdjustmentEvent (from → to version)
       │
       ├── WorkoutSession ──── WorkoutSessionExercise ──── Exercise
       ├── SessionLog
       └── RegimeGenerationJob

Preset ──┬── PresetExercise ──── Exercise      (kind: FALLBACK)
         └── PresetSlot                        (kind: SKELETON)

LlmCall · TestFixture · TestRun · Scenario · RateLimit   (system tables)
```

---

# User-owned entities

## User

**[v2] The primary key is ours.** v1 used the hosted auth provider's user id directly as the primary key, with no identity-mapping table — which coupled the entire schema to a vendor. With self-hosted auth, the user row is a first-class entity we own.

| Field | Notes |
|---|---|
| `id` | Our own identifier |
| `email` | Unique |
| `goalType` | Enum. Drives the mobility/strength indicator's shape and skeleton retrieval. |
| `riskTier` | Enum. **The only lever controlling change ceilings.** |
| `conditionFlags[]` | Autoimmune, chronic, post-surgical, etc. |
| `targetMovements[]` | Array for forward compatibility; the product enforces a single primary movement at the UI and API layer. |
| `availableEquipment[]` | Hard filter in exercise search. **Must be threaded through every call site** — see below. |
| `wakeTimeMinutes` | Minutes past midnight. Falls back to 7:00am. |
| `eveningTimeMinutes` | Falls back to 6:00pm. |
| `manualHold`, `manualHoldReason` | Admin-set. **Checked by both the escalation monitor and the scheduler.** |
| `role` | User / admin |
| `signupCohort` | Beta / prod |
| `subscriptionActive` | Trial and subscription state |

Auth tables (sessions, verification tokens, credentials) are managed by Better Auth and live alongside this table. They are user-owned for RLS purposes.

> **v1 bug — `availableEquipment` was silently dropped** on the Flow B path and the admin test path, even though it was loaded. Equipment filtering never applied there. Any field that gates content must be threaded through *every* path, and that should be asserted in a test rather than assumed.

## Regime (versioned)

The object the agent modifies over time.

| Field | Notes |
|---|---|
| `versionNumber` | **Unique per `(userId, versionNumber)`** |
| `status` | DRAFT / ACTIVE / SUPERSEDED / ENDED |
| `createdBy` | AGENT / USER_EDITED / PRESET_FALLBACK |
| `endReason` | Nullable |
| `parentRegimeId` | Self-FK. Supports history and rollback. |
| `sourcePresetId` | Which skeleton or fallback preset it came from, if any |

> **Two v1 production bugs live here.** Both are cheap to prevent and were expensive to find.
>
> 1. **`versionNumber` was hardcoded to `1`.** A second onboarding collided with the uniqueness constraint and **silently failed all three retries.** Always compute from existing rows.
> 2. **Activation never superseded the prior active regime**, leaving *two* `ACTIVE` rows for one user — while three separate call sites did an unordered `findFirst` assuming exactly one. Superseding must be part of the same transaction as activation.

## RegimeExercise

`sets`, `reps`, `durationSeconds`, `frequency`, `sessionSlot` (MORNING / EVENING), `orderIndex`.

> **[v2] `frequency` is an enum.** v1's was free text, and its own baseline captures contain `"DAILY"`, `"daily"`, `"3X_WEEK"`, `"3X_PER_WEEK"`, `"2x/week"`, `"3-4x/week"`, and `"7x/week"` — all produced by the same field, all needing to be parsed by downstream scheduling.

## WorkoutSession

One per slot per day. Tracks exercise completion; this is what streaks compute from. Distinct from `SessionLog`.

**Unique on `(userId, regimeVersionId, date, slot)`** — the regime version is in the constraint deliberately.

> **v1 bugs.** The constraint originally omitted `regimeVersionId`, so a same-day regime change silently skipped creating fresh rows and left *the new regime's exercises paired with the old regime's completion timestamps.*
>
> Separately, rows were only ever created for "today," once, at activation. **Cross a midnight boundary and "mark session complete" silently disabled with zero user feedback.** A lazy self-heal patched the symptom; the underlying gap — nothing pre-creates future rows — remained, and it blocks any server-side push notification. **[v2] Decide this properly.**

## WorkoutSessionExercise

`{ exerciseId, completed }`.

## SessionLog

One per day — the check-in bundled with the morning session.

| Field | Notes |
|---|---|
| `painScore` | 0–10 |
| `mobilityStrengthIndicator` | Typed per goal type |
| `perceivedExertion` | Nullable |
| `flag` | "This made it worse." Feeds the adverse-event guardrail **and** the escalation monitor. |
| `completed` | |

> **v1 bug — once-daily logging was never actually enforced.** The uniqueness constraint used a timestamp field that defaulted to the submission instant, so it could never collide. **[v2] Key the constraint on a date, not a timestamp.**

Every write to this table triggers the escalation monitor inline. That is a rules-only path and it must **never** call an LLM.

## AdjustmentEvent

The agent's audit trail — and the source of a guardrail metric, which is why it's a first-class table rather than a log line.

| Field | Notes |
|---|---|
| `fromRegimeVersionId` / `toRegimeVersionId` | |
| `triggerType` | `SCHEDULED_ADJUSTMENT` / `ESCALATION_ROLLBACK` |
| `trailingWindowUsed` | Days |
| `rationale` | Also carries system causes, e.g. "held due to API outage" |
| `wasReversed` | Set retroactively. **This is the reversal-rate guardrail metric.** |

An event counts as reversed once a later rollback lands the active regime back at its *starting* version or earlier.

> **v1 bug — `markReversedEvents` marked the rollback event as reversing itself**, because its own source version outranked the target. When retro-marking rows from the same code path that created the trigger row, **exclude the new row's own id.** This was caught by a boundary-condition test, not by inspection — which is an argument for writing that kind of test.

An escalation rollback **must** be logged here even though it bypasses the scheduled loop. Otherwise the reversal-rate metric silently undercounts exactly the rollbacks that matter most.

## RegimeGenerationJob

Backs Flow A's async-job-plus-polling pattern.

`status` (PENDING / COMPLETE / FAILED), `retryCount`, `resultRegimeId`, `fallbackPresetId`, `error`.

> **`error` is never returned to the client.** v1's error formatter leaked raw exception text for every error, and this field — containing raw ORM and model-provider exception strings — was returned by the job-status endpoint and **rendered directly into the onboarding UI**.

**Constraint note:** `userId` is a required FK, so the user row must be created *before* the job. Onboarding's user upsert runs synchronously ahead of job creation.

---

# Shared library entities

## [v2] Exercise — single source, AscendAPI-native

| Field | Notes |
|---|---|
| `externalId` | Unique. The AscendAPI id. Makes re-seeding idempotent. |
| `name` | |
| `category` | MOBILITY / STRENGTH / STRETCH |
| `targetMuscleGroups[]` | AscendAPI's vocabulary, used natively — no remapping |
| `difficultyLevel` | |
| `equipment` | Nullable. **Null ≠ bodyweight-only** — they are distinct states. |
| `media` | **[v2] Typed column**, not untyped JSON |
| `movementPattern` | Derived. ~12–15 canonical patterns. |
| `progressionGroup` | Derived. Progression chains. |
| `contraindications[]` | **Empty for every row.** No PT-annotated content exists yet. |
| `source` | |

### What changed and why

v1 had **two sources that shared no identifiers**: one for the text data the model reasoned over, one for the GIFs. They were joined by **Jaccard similarity over normalized word sets**, with a supporting muscle-overlap signal and tuned thresholds. It was careful work — the design principle in its comments, *"a wrong-exercise GIF is worse than a missing one,"* was right — and it still only covered **486 of 873 exercises**. The other 44% fell back to static images from the other source, which were then **blocked by CSP in production** because that host was never allowlisted.

The backfill was also a **live-data mutation not tracked by git**. A fresh database clone had zero GIFs unless someone remembered to re-run the script.

**[v2] One source. Vendored to `packages/db/data/exercises.json` and committed.** Seeding reads the local file and never touches the network — offline, deterministic, and identical on both machines and in CI. Upgrading to the licensed tier is a snapshot swap.

Three v1 seed-layer problems disappear with it:

- **Category lossiness** — the old source shipped 7 categories mapped into 3, with cardio and plyometrics shoved into MOBILITY by default. A judgment call baked into a seed script.
- **Silent field drops** — `equipment` was declared nowhere on the source type and **silently dropped on every upsert** until late in the build. Every exercise had null equipment; equipment filtering could not have worked at all.
- **Vocabulary coupling** — the muscle-synonym layer hardcoded the *old* source's 17 muscle terms, which meant consolidating sources required rewriting it.

### Enrichment provenance

`movementPattern` and `progressionGroup` are **AI-generated with a human spot-check of 50–100 rows**, not PT-authored. Keep that distinction sharp: it matters for the clinical conversation, and `contraindications` being empty is the reason the Clinical Risk Framing guardrails are the only safety layer.

## Preset

Two kinds, doing genuinely different jobs:

- **`FALLBACK`** — a concrete, complete regime. The zero-LLM path when Flow A exhausts its retries. **Re-validated before persisting**, never trusted blindly because it's hand-authored.
- **`SKELETON`** — a slotted protocol *shape* that Flow A retrieves and fills. This is what grounds the model in a hand-authored, literature-cited structure rather than free invention.

Keys: `riskTier`, `goalType`, `bodyRegionTags[]`. The tags are keyword-matched against free-text target movement and symptoms — deliberately not a structured FK, since target movement is unconstrained free text.

## PresetSlot (skeleton only)

| Field | Notes |
|---|---|
| `label` | e.g. "Primary shoulder mobility drill" |
| `exerciseCategory` | |
| `muscleGroupTags[]` | Passed into exercise search when filling the slot |
| `maxDifficulty` | |
| `suggestedSets` / `Reps` / `DurationSeconds` / `Frequency` | |
| `rationale` | **Literature grounding for why this slot exists — an audit trail back to a named source.** |

That `rationale` field is what makes a skeleton reviewable by a clinician. Populate it properly.

---

# System entities

Not user-owned. RLS enabled with **zero policies** — default deny.

## LlmCall

One row per API call, including each tool-use round-trip. Written on **success and failure**.

`flow`, `source` (PRODUCTION / ADMIN_TEST), `model`, `groupId` + `sequenceIndex` (to reconstruct a multi-turn loop), token counts, latency, `costUsd`, `stopReason`, full `requestJson` and `responseJson`.

This is the only LLM observability that exists, and it is what makes the unit-economics calculation possible. One real v1 datapoint: **$1.49 across 113 calls** in roughly two hours of heavy testing.

> Note: a decimal column serializes to a numeric *string* through JSON responses, not a number. v1 hit this.

## TestFixture · TestRun · Scenario

Back the admin experimentation dashboard and the eval harness. `Scenario` drives multi-cycle synthetic trajectory simulation — **this is the mechanism that produces the held-out test set a clinical advisor reviews**, so it is a launch-gate dependency, not just a developer tool.

## RateLimit

Fixed-window counters keyed `"<scope>:<identity>"`. Postgres-backed rather than Redis: one atomic `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, no extra infrastructure.

---

# RLS decisions

**Every table appears in exactly one of these three buckets. `pnpm check:rls` enforces it in CI.**

| Bucket | Tables | Policy |
|---|---|---|
| **User-owned** | User, auth tables, Regime, RegimeExercise, WorkoutSession, WorkoutSessionExercise, SessionLog, AdjustmentEvent, RegimeGenerationJob | Row-ownership policy on `app.user_id`. Child tables via `EXISTS` against the parent. |
| **Shared library** | Exercise, Preset, PresetExercise, PresetSlot | RLS **enabled**, permissive SELECT-only |
| **System** | LlmCall, TestFixture, TestRun, Scenario, RateLimit | RLS enabled, **zero policies** — default deny |

### Why shared-library tables get RLS enabled rather than disabled

If the production database host auto-generates a REST API over the public schema — as some managed providers do — then **RLS-disabled means publicly readable, regardless of what your application code does.** v1 had **seven tables** exposed exactly this way, flagged by the vendor's own linter rather than by review.

### Why the CI check exists

After v1 fixed those seven tables, **one table regressed to no-RLS and went undetected** until a later audit. Vigilance failed; a parser didn't. The check needs no database, so it always runs.

**[v2] And the isolation test must fail if it cannot run.** v1's cross-user isolation test self-skipped when database credentials were absent. Those credentials were never added as CI secrets, so CI reported green for the entire project **without ever having proven isolation.**

---

# Operational notes

- **Delete order for fixture resets:** `AdjustmentEvent` and `SessionLog` before `Regime`. Neither cascades.
- **Onboarding upserts** rely on Prisma's `undefined`-means-don't-touch semantics.
- **`RegimeGenerationJob.userId`** is a required FK — the user upsert must complete first.
- **Seeding order:** `seed` (exercises from the vendored snapshot) → `seed:presets` → `seed:skeletons` → `seed:fixtures`. **[v2]** v1's correct order existed only as tribal knowledge and was documented nowhere.
- **On Windows**, Prisma client generation fails with a file-lock error if the dev server is running. This recurred across at least four v1 sessions. Stop the server first.
