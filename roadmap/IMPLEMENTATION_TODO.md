# Implementation TODO — current state to shipped

*Draft for review, 2026-09-01. Intended to be tweaked and then folded into [`GAME_PLAN.md`](./GAME_PLAN.md). Sequenced by dependency, not by calendar.*

**Starting point:** 410 lines of application code — one unauthenticated `POST /regime`, one `exercises` table with 30 hand-written mock rows, one Next.js screen, one Gemini call. No auth, no migrations, no tests, no rules, no retrieval.

**Legend:** ⛔ blocks a lot downstream · 📝 content/authoring, not code · ⚖️ needs a decision before code · 🧪 non-code track

---

## Track 0 — Non-code, runs in parallel, start now

Nothing here is unblocked by engineering, and all of it has long lead time. **These are the actual critical path to launch.**

- [ ] 🧪 Engage a PT / clinical advisor. Brief them on what needs review: risk-tier thresholds, progression ceilings, the red-flag list
- [ ] 🧪 Engage digital-health counsel on the SaMD classification question
- [ ] 🧪 Get a written answer on whether showing sourced clinical citations (Flow A Phase 10) changes classification — **this gates a design decision, so ask early**
- [ ] 🧪 TOS, privacy policy, medical disclaimers drafted
- [ ] 🧪 Liability insurance quotes
- [ ] 🧪 State health-data law + App Store health-data requirements reviewed
- [ ] 🧪 Confirm AscendAPI licence terms and price. Verify the "$500–600 one-time, self-hosted" figure in `GAME_PLAN.md` is current, and that it permits committing the dataset to a private repo

---

## Phase A — Decisions that gate everything ⛔

> **Phase A resolved 2026-09-01.** Decisions taken: **raw SQL + `node-pg-migrate`** (ADR 0017), **`withSession`** (ADR 0014), **Next.js only** (ADR 0018), **Supabase-only local dev** (ADR 0019). ADRs 0013, 0015 and 0016 are written but deliberately **Proposed, not Accepted** — retrieval is gated on the Phase E prototype, fail-closed on a review queue existing, and the justification UI on legal review.


These change what gets built below. Settle them before writing code against any of it.

- [x] ⚖️ **Migrations: which mechanism?** `db:setup` (drop-and-reseed) cannot survive a second table with real data. Options: `node-pg-migrate`, Prisma, or numbered SQL files applied by a runner
- [x] ⚖️ **ORM or raw SQL?** Currently raw `pg`. `DATA_MODEL.md` assumes Prisma. ~15 tables of hand-written SQL is a real cost; so is reintroducing an ORM
- [x] ⚖️ **Identity: `withSession` or real auth?** `USERFLOW.md` §1a specifies a client-supplied `X-Session-Id`; `TDD.md` specifies Better Auth. The session approach is faster and **cannot ship with real users**
- [x] ⚖️ **Client: finish in Next.js, or add Expo?** The whole of `GAME_PLAN.md` M10–M12 assumes mobile. Expo Go + LAN networking is still completely unvalidated
- [x] ⚖️ **Local dev: accept the Supabase dependency, or restore a local database?** A clean clone currently needs live Supabase + a Gemini key — the exact condition `TDD.md` calls the worst part of v1
- [x] Write **ADR 0013** — clinical-literature retrieval corpus (reverses "no vector database")
- [x] Write **ADR 0014** — `withSession` as the RLS subject (reverses the Better Auth trust model)
- [x] Write **ADR 0015** — fail-closed on classifier unavailability, and the review queue it depends on
- [x] Write **ADR 0016** — showing sourced clinical justification (claim surface / SaMD)
- [x] `adr/0001-record-architecture-decisions.md` + backfill ADRs for the decisions already made and superseded

**Done when:** a reader of `documents/` can tell what the system is being built as, without having to ask which of two contradictory paragraphs is current.

---

## Phase B — Foundation

> **Phase B done 2026-09-01**, except the credential rotation (yours to do) and `packages/clinical-rules` (moved to Phase G). All gates verified able to **fail**, not just to pass.


- [x] Migration tooling chosen in Phase A, wired, with the existing `exercises` table captured as migration 0001
- [x] **RLS enabled on `exercises`** with a permissive read-only policy (not "RLS off")
- [x] `check:rls` script — fails the build on any table with no explicit RLS decision recorded
- [x] ESLint configured in every package
- [x] Vitest with a shared base config
- [x] Restore the two endpoint tests deleted with the PoC, then keep adding
- [x] Startup env check that fails loudly and readably on a missing variable
- [ ] ~~`packages/clinical-rules` created~~ — **moved to Phase G.** Creating an empty package before there is any rules code is ceremony; it gets created in the same commit as `checkRedFlags`.
- [x] `CONTRIBUTING.md` — setup, branch model, review rule, and the `allowBuilds` / `API_PORT` / restart traps
- [x] CI extended: install → lint → typecheck → test → `check:rls`
- [ ] Rotate the Supabase database password; move `DATABASE_URL` to the transaction pooler

**Done when:** your partner clones fresh, follows `CONTRIBUTING.md`, and reaches a running stack and a passing test suite without messaging you.

---

## Phase C — Data layer

> **Phase C partially done 2026-09-01.** Everything not gated on AscendAPI access is
> complete and verified against the live Supabase database: all 13 tables, RLS on
> every one of them (`check:rls` passes at 15/15), the `rebound_restricted` role
> with a real password, and a cross-user isolation test that genuinely proves
> isolation (5 tests, run against `rebound_restricted`, not mocked) — see
> migrations `1756828800000` and `1756832400000`, and `adr/0020`. **Still blocked**:
> everything downstream of Track 0's unresolved AscendAPI licensing item — see
> `documents/INGEST_RUNBOOK.md` for exactly what and why.

- [x] All tables per `DATA_MODEL.md`: `User`, `Regime`, `RegimeExercise`, `WorkoutSession`, `WorkoutSessionExercise`, `SessionLog`, `AdjustmentEvent`, `RegimeGenerationJob`, `Preset`, `PresetExercise`, `PresetSlot`, `LlmCall`, `RateLimit`
- [x] Every table gets an explicit RLS decision **in the same migration that creates it**
- [x] Two-tier database roles: privileged (owns tables) and restricted (request-scoped, `SET LOCAL app.user_id`)
- [x] **Cross-user isolation test that genuinely runs in CI** and fails the build if credentials are missing rather than skipping
- [ ] ⛔ Hit the AscendAPI free tier once and **diff the real response against `DATA_MODEL.md`'s Exercise table** before building on it — blocked on Track 0's unresolved AscendAPI licence/access question
- [ ] ⛔ `fetch-catalog.ts` — paginate at 25, ~2s delay, handle 429/503 with backoff, never fan out per-exercise — needs AscendAPI's real API docs to write against; the order it should follow is in `documents/INGEST_RUNBOOK.md`
- [ ] ⛔ `data/exercises.json` — vendored, committed snapshot — depends on the above
- [ ] Seed script reads the local snapshot only. Offline, deterministic, identical in CI — depends on the above
- [ ] `media` as a typed column; one shared media-rendering helper — column exists (migration `1756832400000`); the rendering helper doesn't yet, since nothing renders exercise media anywhere in the app yet
- [x] ⚖️ Decide whether `media` holds vendor URLs or self-hosted files. Vendor URLs = a runtime CDN dependency, and the reason every v1 exercise image was silently CSP-blocked — **self-hosted, via Supabase Storage**, see `adr/0020-self-hosted-exercise-media.md`
- [x] `frequency` as an enum — `dosage_frequency`, on `regime_exercises` and `preset_exercises`
- [ ] ⛔ `movementPattern` enrichment — batch LLM classification with a stronger model, exact-id echo-back, human spot-check of 50–100 rows — needs real exercise data first
- [ ] ⛔ `progressionGroup` enrichment — deterministic where possible — needs real exercise data first
- [x] Ingest runbook, written down once — `documents/INGEST_RUNBOOK.md`

**Done when:** a clean machine yields a fully populated exercise library with media and **no network calls to any vendor**. *(Not yet — the data-layer half of this is done; the AscendAPI half needs Track 0 resolved first.)*

---

## Phase D — Clinical content 📝 ⛔

**Not code. The real bottleneck for Flow A, and nothing has started.** An LLM cannot produce a defensible regime without authored protocol shapes to fill.

- [ ] 📝 Decide the launch scope: which goals × which body regions × which risk tiers
- [ ] 📝 Author `Preset` skeletons for that matrix — each with slots, labels, session placement, category, muscle tags, difficulty ceiling, suggested dosage
- [ ] 📝 Write `PresetSlot.rationale` for each slot, with its citation
- [ ] 📝 Author regime-level "why this plan looks like this" copy per skeleton
- [ ] 📝 `FALLBACK` presets per risk tier
- [ ] 📝 Red-flag question wording, reviewed for plain language
- [ ] 📝 Crisis-resources screen copy (988, Crisis Text Line)
- [ ] 📝 Standing disclaimer copy, safety-serious register
- [ ] 🧪 PT review pass over all of the above

---

## Phase E — Prototype the trust surface early ⛔

**Do this before any retrieval work.** If the justification page doesn't read as trustworthy with perfect hand-written citations, retrieval will not save it — and that's an afternoon's finding instead of a month's.

- [ ] Hand-write one complete provenance record: skeleton, slots, rationales, citations, a fake selection note
- [ ] Build the preview page against it — all four layers (regime / slot / exercise / dosage)
- [ ] Citation rendering with source, year, evidence grade. **Grade F must look different from grade A**
- [ ] The un-cited variant, rendered from the same component with provenance absent
- [ ] Show it to the clinical advisor and to someone who is not a founder
- [ ] **Decide from that whether Phase H's retrieval work is worth it at all**

---

## Phase F — Identity, contract, transport

- [ ] `withSession` or Better Auth, per the Phase A decision
- [ ] Handler composition: CORS → rate limit → session → handler
- [ ] Postgres-backed rate limiting, keyed by scope and identity; onboarding at 5/hr on both session id and IP
- [ ] Errors never leak internal exception text
- [ ] `packages/contracts` — Zod schemas, generated + committed `openapi.json`, CI drift check
- [ ] Typed client generated for the frontend

---

## Phase G — Clinical rules

- [ ] `checkRedFlags` — structured screen, pure, zero I/O
- [ ] `determineRiskTier` — writes `User.riskTier`
- [ ] Constraint envelope builder — tier ceiling, `ABSOLUTE_BOUNDS`, equipment, difficulty cap
- [ ] `validateRegime` — absolute bounds, plus delta check when a previous regime is supplied
- [ ] Escalation monitor
- [ ] **Test: the envelope cannot be widened downstream**
- [ ] **Test: the validator's signature takes draft + tier only, and never retrieved context**
- [ ] All 41 ported tests passing
- [ ] Thresholds marked in-code as **unreviewed defaults** until Track 0 says otherwise

---

## Phase H — Eval harness, before Flow A

- [ ] 20–30 golden fixtures, growing toward 100 (v1 had 9)
- [ ] Rubric — LLM-judged dimensions plus deterministic checks computed in code
- [ ] Judge on a **stronger Gemini model** than the generator
- [ ] Runner writing timestamped reports; failures visible, never excluded from the mean
- [ ] CI gate on any PR touching prompts or the agent package
- [ ] **Spot-check judge scores against human judgement** on a fixture sample before any floor gate is trusted

**Done when:** a deliberately broken generator makes CI fail.

---

## Phase I — Flow A

Split from `USERFLOW.md` §1a. **Larger than `GAME_PLAN.md` M8 assumed.**

**I.1 — Capture and job plumbing**
- [ ] Onboarding wizard, sequenced, with client-side validation and free-text caps
- [ ] `POST /onboarding`, `upsertUserForOnboarding` (omitted fields stay `undefined`)
- [ ] `RegimeGenerationJob` + `GET /onboarding/jobs/:jobId` polling + wait screen
- [ ] `User.manualHold` respected

**I.2 — Safety gates**
- [ ] Structured red-flag screen wired in
- [ ] Free-text classifier pass, logged as `FREE_TEXT_CLASSIFIER`
- [ ] Crisis sub-check → dedicated crisis screen
- [ ] Terminal red-flag outcome + exit screen, **before any retrieval runs**
- [ ] ⛔ **Human-review queue** — fail-closed currently routes nowhere. Build it or specify the user-visible fallback

**I.3 — Tiering and skeletons**
- [ ] Risk tiering + envelope, computed once
- [ ] Skeleton structured filter (goal × tier, then region tags), general fallback
- [ ] ⚖️ **Define freeform behaviour** — §1a routes to "the legacy tool-use path," which does not exist in v2
- [ ] Record skeleton id + match reason for provenance

**I.4 — Candidate narrowing**
- [ ] Per-slot `Exercise` query on category, muscle tags, difficulty, equipment; `BODY_ONLY` and null-equipment always eligible
- [ ] Top-k per slot (start k ≈ 8)
- [ ] Relax order on empty: difficulty → equipment → muscle tags, logged; drop the slot if still empty

**I.5 — Generation and validation**
- [ ] Prompt assembly; **user free text delimited as content, never as instruction**
- [ ] One call, `submit-skeleton-regime` tool, `LlmCall` logging with group/sequence
- [ ] Structural + clinical validation
- [ ] One retry with the rejection reason; then `assignFallbackPreset`, re-validated before persist
- [ ] Backoff on model/API outage

**I.6 — Persist, preview, activate**
- [ ] `Regime` v1 DRAFT + `RegimeExercise` rows
- [ ] **Provenance join written in the same migration as the retrieval work**
- [ ] Preview page wired to real provenance (built in Phase E)
- [ ] Edit + per-row `userModified`; `sourcePresetId` and provenance **survive the edit**
- [ ] Activate → server-side re-validation → `ACTIVE` → today's `WorkoutSession` rows

**I.7 — Quality**
- [ ] Iterate until the eval floor is met **and `sessionSlotCoherence` specifically clears it**
- [ ] If it doesn't move, that is a **product-level finding for the advisor**, not an engineering detail

---

## Phase J — Retrieval (only if Phase E justified it)

- [ ] Source and licence the clinical literature corpus
- [ ] Chunking + evidence grading
- [ ] Vector store + BM25 index
- [ ] Per-slot structured query builder
- [ ] Hybrid search with reciprocal rank fusion
- [ ] Metadata hard-filters before ranking; relevance floor
- [ ] Additive-only failure behaviour — zero chunks, timeout, or outage all degrade, never fail the job
- [ ] Skip for `GENERAL_FITNESS` / `STRENGTH`, or route to a general dosage index
- [ ] `RetrievalEvent` per slot, with its RLS decision

---

## Phase K — Flow B, escalation, scheduler

- [ ] Weekly adjustment agent — trailing logs → hold / progress / rollback + re-slotting
- [ ] Delta validation against the previous version
- [ ] New regime version + `AdjustmentEvent`
- [ ] Escalation monitor on real logs; pain-9 triggers a real rollback
- [ ] Day-4 check
- [ ] Scheduler process, reproducible locally

**Done when:** a real account with real logs produces a real weekly adjustment, verified against the live stack, not mocks.

---

## Phase L — Client build-out

- [ ] Today / Progress / Plan / Account
- [ ] Session player, check-in, pain logging
- [ ] Two local notifications per day, recomputed on app open
- [ ] Streaks
- [ ] Navigation invariants: every screen has a way back, every terminal screen has a forward action, `flexGrow` not `flex` on scroll content, safe-area insets applied
- [ ] Accessibility: ~1.3× text scaling, 44px minimum tap targets
- [ ] If Expo: validate Expo Go + LAN networking early, not at the end

---

## Phase M — Design

- [ ] Brand identity first, design pass second
- [ ] `packages/design-tokens`; **no hardcoded colors outside it**
- [ ] `DESIGN.md` with the anti-slop do-not list
- [ ] The three clinical screens visibly differ in register from the rest of the app

---

## Phase N — Commercial and legal surfaces

- [ ] Marketing site
- [ ] TOS, privacy, medical disclaimers published
- [ ] Subscription and billing

---

## Phase O — Production

- [ ] Hosting decision, with real requirements
- [ ] Automated deploy on merge
- [ ] **Error monitoring actually wired up** — v1 named it and never did it
- [ ] Backups configured **and a restore actually tested**
- [ ] If the host auto-exposes the database over an API, `check:rls` covers it

---

## Phase P — Launch gates

- [ ] Clinical sign-off received in writing
- [ ] Legal sign-off received in writing
- [ ] Eval floor held, including `sessionSlotCoherence`
- [ ] Licensed exercise data purchased and snapshot swapped
- [ ] Real-device click-through of the entire loop by someone who is not a founder
- [ ] Cross-user isolation test green in CI, having actually run
- [ ] Unit economics modeled against the reference price

---

## Honest notes on this list

**The critical path is not code.** Track 0 and Phase D (authored clinical content) gate launch and neither is unblocked by engineering. Phase D in particular has not started and Flow A cannot produce anything defensible without it.

**Phase E is deliberately early and out of dependency order.** It is the cheapest way to find out whether the product's central claim — justified, sourced recommendations — actually reads as trustworthy. If it doesn't, Phase J is a month spent on the wrong thing.

**`GAME_PLAN.md` targets substantially complete by end of November 2026.** That is roughly three months from this draft, against 410 lines of existing code and a list this size, for two people who are also students. Treat the milestone order as real and the date as aspirational, and decide early what a *demonstrable subset* looks like — because "all of the above by November" is not a plan, it's a wish.
