# GAME_PLAN.md

**Rebound.ai — zero to shippable.**

This is the agenda. It is checkbox-driven, not calendar-driven: work is done when the **Done when** line is satisfied, not when a date passes. The only hard date in this document is M1.

Target: substantially complete by **end of November 2026**, with December 5 as the real deadline and the November gap reserved for the things that always take longer than expected.

---

## How to read this document

- **Track 0** runs in parallel with everything, starting now.
- **M1** is a deliberate detour — a throwaway proof of concept for the advisor. It is not the architecture.
- **M2 onward** is the real build, in dependency order.
- Every milestone has a **Done when** line. If you can't demonstrate it, it isn't done.
- Two standing appendices at the bottom — the **Carried-forward bug catalogue** and the **Guardrails** — are not milestones. They are reference material you consult while working the milestones.

### Who does what

Both founders are full-stack and pair on the work. There is no frontend/backend split. What this means practically:

- One person drives, one reviews, on anything touching the clinical rules, the RLS policies, or the agent layer. These are the three places where a silent bug is expensive.
- Everything else can be picked up independently off the checkboxes.
- **Every decision that changes an interface, a dependency, or a data shape gets an ADR.** The v1 build rewrote its entire API layer on day eight because a decision changed and there was no record of why the original was made. See [M2](#m2--founding-docs--repo-conventions).

### Advisor demo cadence

Every milestone from M1 onward ends in something demonstrable. When a demo is due, show the most recent completed milestone rather than a work-in-progress branch.

---

## Track 0 — Non-code, starts immediately

Neither of these parallelizes with engineering, and both have lead times measured in weeks. They cannot sit at the end of the plan. Start them in the same week as M1.

- [ ] **Engage a PT / clinical advisor for safety-rule review.**
  The risk-tiering thresholds and the progression change-ceilings (`ABSOLUTE_BOUNDS`) are invented defaults. They have been cross-checked against literature, which is *not* the same as being signed off. Two specific things a reviewer needs to rule on:
  - The **0–3 / 4–6 / 7–10** pain-tier split is a legitimate general clinical convention, but it does not precisely match the specific pain-monitoring model the product gestures at by name.
  - The **"10% rule"** for weekly load progression is weaker evidence than "evidence-informed" implies. It has never been validated in a peer-reviewed trial, and a key systematic review found **no injury-risk difference between 10% and 24% weekly increases** — with the real risk signal being *large single-session spikes*, not a weekly percentage.

  That second finding has an architectural consequence worth putting in front of the reviewer directly: it suggests the **real-time escalation monitor** (which fires per session log) is the clinically load-bearing component, and the weekly change ceiling is the weaker one. v1 built both and weighted them the other way round.

  Give the reviewer the scenario simulator and the trajectory fixtures so they are ruling on concrete cases, not prose.

- [ ] **Engage digital-health counsel.**
  TOS, medical disclaimers, liability insurance, state health-data law (e.g. CMIA), App Store / Play health-data requirements, and — the one that most affects everything else — the **SaMD (Software as a Medical Device) classification question**. An app that takes symptom input and returns an individualized exercise prescription that it adjusts over time is commonly scrutinized for SaMD classification. That affects liability posture, insurance, and possibly the product itself. Not code-fixable. Find out early.

- [ ] **Document the red-flag screen's known limitation in writing**, because legal review will ask: the screen only catches conditions disclosed *at onboarding*. It cannot catch symptoms that emerge later or that a user underreports.

---

## M1 — Proof of concept ⚠️ **THIS WEEK. HARD DEADLINE.**

The advisor wants a bare-minimum proof of concept: something that demonstrates the full stack is wired end to end. This is explicitly **not** the real architecture, and it is explicitly throwaway.

**What it does:**

1. An Expo screen asks *"what muscle hurts?"* — one input.
2. It calls the standalone API.
3. The API reads exercises from Postgres — **mock/generated exercise rows, not real AscendAPI data.**
4. It makes one generic Gemini call: *pick 3 exercises from this list, assign sets and reps.*
5. It returns the 3 exercises. The screen renders them.

**What it deliberately does NOT have:** auth, onboarding, red-flag screening, risk tiering, skeleton retrieval, validation, retries, fallbacks, Flow A, Flow B, streaks, sessions. One shot, no loop, no safety layer. Gemini picks whatever sets and reps it wants.

**Why bother, if it's throwaway:** it forces Docker, Postgres, the API container, Expo Go on a real phone, and the LAN networking between them to all work *before* your co-founder ever clones the repo. In v1, none of that existed and local setup was the single worst part of the project. This milestone buys that down in a week, under the cover of a demo.

- [ ] Repo initialized, pnpm workspace, one TypeScript version
- [ ] `docker-compose.yml`: `postgres` + `api`
- [ ] Prisma schema with a single `Exercise` model; **an actual migration, not `db push`**
- [ ] Seed script writing ~30 plausible generated exercises
- [ ] `apps/api`: one endpoint, `POST /poc/regime`
- [ ] Gemini call — model id and key read from a single root `.env`, and **present in `.env.example`**
- [ ] `apps/mobile`: one screen, one input, one result list
- [ ] `README.md` with the exact setup commands, verified by running them on a clean checkout

**Done when:** demoed live on Shahid's iPhone via Expo Go, *and* the co-founder can bring the entire stack up on macOS with `docker compose up` plus `pnpm --filter mobile start`, from a clean clone, with no accounts beyond a Gemini API key.

> **Note on the deliberate mismatch.** This PoC does not reflect how the product actually works — the real system wraps the LLM in deterministic safety rules and never lets it freely choose dose. If the advisor asks, that distinction is worth stating out loud, because "the LLM picks your exercises" is the version of this product that would be irresponsible to ship.

---

## M2 — Founding docs + repo conventions

The other six documents in this folder get imported and become the working spec. This milestone is about the conventions that keep them true.

- [ ] Import `PRD.md`, `DATA_MODEL.md`, `TDD.md`, `ENG_PLAN.md`, `USERFLOW.md`, `DESIGN_BRIEF.md`
- [ ] `CONTRIBUTING.md` — setup, branch model, commit conventions, the review rule, how to run each part of the stack
- [ ] `DESIGN.md` at repo root — the anti-slop guardrails and the do-not list (see [M12](#m12--brand-identity-then-design-pass))
- [ ] `adr/` directory with `0001-record-architecture-decisions.md` and one ADR per decision already locked in below
- [ ] `ENG_PLAN.md` established as the **living state doc** — what's done, what's next, what's risky. Updated in the same commit as the work it describes, never deferred.

**The ADR habit is the point of this milestone.** v1's decisions were real and mostly good, but they lived in a 171KB session log and in people's heads. When a colleague suggested REST would serve the project better, there was no record of why tRPC had been chosen, so the choice was re-litigated from scratch and the API layer was rewritten eight days into the build. An ADR is fifteen lines. Write them.

### Decisions already locked in — write these as ADRs first

| # | Decision | Why |
|---|---|---|
| 1 | Mobile-first (Expo). Web is marketing only. | v1 built and maintained ~24 screens twice. Most real bugs came from that duplication. The product is a twice-daily habit loop — it belongs on a phone. |
| 2 | Standalone containerized API service, not Next.js route handlers. | The API is the mobile app's backend. Coupling it to a marketing site's deploy cycle makes no sense, and route handlers don't containerize cleanly. |
| 3 | `docker compose up` → Postgres + API. Local dev needs no external accounts. | v1 required live Supabase + live Clerk + live API keys to run at all. |
| 4 | Better Auth, self-hosted in our own Postgres. | Runs inside Docker. We own the user table outright rather than keying it on an external provider's user id. Removes the production-instance cutover from the launch critical path. |
| 5 | AscendAPI as the sole exercise data source, vendored as a committed snapshot. | v1 fused two databases with a fuzzy string matcher and got 56% coverage. One source, in git, seeded offline. |
| 6 | Gemini only. Model id is a config value. | Deliberate this time, and written down. v1 swapped Claude → Gemini for cost without a decision record, and its own TDD flagged that it was never re-confirmed. |
| 7 | Prisma migrations, committed, from the first commit. | v1 used `prisma db push` exclusively. Schema history was git-diff archaeology. |
| 8 | Production hosting deferred; kept portable behind Docker. | Decide at [M14](#m14--production-hosting-decision--first-deploy) with real requirements, not by default at the start. |
| 9 | Regime quality has a floor gate before feature work continues. | See [M8](#m8--flow-a-to-a-quality-floor). |

---

## M3 — Foundation, done properly

Everything a fresh clone needs to become a running, tested system.

- [ ] Monorepo: `apps/api`, `apps/mobile`, `apps/web`, `packages/db`, `packages/contracts`, `packages/clinical-rules`, `packages/agents`
- [ ] **One TypeScript version across every workspace.** v1 had three different majors (5, 6, 7) and three `@types/node` majors in one workspace.
- [ ] ESLint configured in **every** package, not just one
- [ ] Vitest configured with a shared base config
- [ ] `docker-compose.yml` — `postgres`, `api`, and a `worker` service reserved for [M9](#m9--flow-b-escalation-monitor-scheduler)
- [ ] `Dockerfile` for `apps/api`, multi-stage, non-root user
- [ ] `packages/db` has `postinstall: prisma generate` — v1 omitted this and local builds only worked because a generated client happened to already be on disk
- [ ] **A single root `.env`**, one `.env.example`, and a startup check that fails loudly with a readable message when a required variable is missing. v1 spread credentials across four `.env` files and omitted `GEMINI_API_KEY` — the production model provider — from every example file and from the build env allowlist.
- [ ] CI: install → generate → **lint** → typecheck → test → RLS coverage check → OpenAPI drift check

**Two CI notes carried from v1:**
- v1 had a `lint` task that CI never ran, and four standing lint errors nobody fixed. Lint runs in CI here.
- v1's cross-user RLS isolation test **silently skipped** in CI because the database secrets were never added to the repo. CI reported green having proven nothing. Any test that self-skips without credentials must **fail** in CI instead, or assert that it actually ran.

**Done when:** a co-founder on macOS clones the repo, follows `CONTRIBUTING.md`, and reaches a running API plus a fully passing test suite — with no external accounts, no shared database, and no messages to Shahid.

---

## M4 — Data layer

- [ ] Prisma schema, all models, per `DATA_MODEL.md`
- [ ] **Every table gets an explicit RLS decision**, and `check:rls` enforces it in CI from the first table
- [ ] Two-tier database roles: privileged (owns tables, RLS never applies) and restricted (request-scoped, `SET LOCAL app.user_id`)
- [ ] Cross-user isolation test that genuinely runs in CI

### Exercise data — AscendAPI only

This is the change the whole data layer benefits from. v1 had two sources: one supplied the text data the LLM reasoned over, the other supplied the GIFs users need to actually perform a movement. They shared no identifiers, so they were joined by **Jaccard similarity over word sets** — and only 486 of 873 exercises ever got a GIF.

- [ ] `packages/db/data/exercises.json` — a **vendored, committed snapshot** of the AscendAPI catalogue
- [ ] A separate, occasionally-run fetch script that regenerates that snapshot. Rate-limit-aware: the free tier sits behind a Cloudflare burst limiter far tighter than its documented 1,000 req/hr — v1 lost two scripting attempts to it. Paginate at 25 with a 2s delay; do not fan out per-exercise.
- [ ] Seed script reads the local snapshot only. **Offline, deterministic, identical in CI and on both machines.**
- [ ] `Exercise` schema is AscendAPI-native — no lossy category/level/equipment remapping, no fuzzy matcher, no split between "the data" and "the pictures"
- [ ] `media` is a **typed column**, not an untyped `Json?` that gets blind-cast at the API boundary
- [ ] One media-rendering helper in a shared package. v1 duplicated `readMedia()` byte-for-byte across web and mobile.
- [ ] Movement-pattern taxonomy field (~12–15 canonical patterns: horizontal/vertical push and pull, hip hinge, squat, lunge, rotation, anti-rotation, spinal flexion/extension, scapular retraction/protraction, ankle dorsi/plantarflexion)
- [ ] Progression-chain field, populated deterministically where possible
- [ ] **`frequency` is an enum, not free text.** v1's baseline captures contain `"DAILY"`, `"daily"`, `"3X_WEEK"`, `"3X_PER_WEEK"`, `"2x/week"`, `"3-4x/week"`, and `"7x/week"` — all from the same field.
- [ ] A single documented ingest runbook. v1's correct order existed only as tribal knowledge.

**Licensing milestone, tracked separately:** the free AscendAPI tier is demo-grade and disposable. The Shop tier ($500–600 one-time, self-hosted) is the launch-safe version. Because the data is vendored, upgrading is a snapshot swap. → [M15](#m15--launch-gates)

**Done when:** `docker compose up` on a clean machine yields a fully populated exercise library with media, with no network calls to any vendor.

---

## M5 — Auth + API contract

The API shape is settled here and not revisited. This is the decision v1 paid eight days to change.

- [ ] Better Auth, tables in our own Postgres, email + password with verification
- [ ] Expo client integration, session handling, token refresh
- [ ] `packages/contracts` — Zod schemas → generated OpenAPI spec, committed, CI drift-checked
- [ ] Typed client generated for the mobile app
- [ ] Handler composition: CORS → rate limit → auth → handler
- [ ] Rate limiting — Postgres-backed, keyed by scope and identity
- [ ] **Errors never leak internal exception text to the client.** v1's error formatter returned raw Prisma and API exception messages, and one of them was rendered directly into the UI on the onboarding screen.

**Done when:** the mobile app can sign up, verify, sign in, refresh, and call an authenticated endpoint — entirely against the local Docker stack.

---

## M6 — Clinical rules (ported, reviewed)

`packages/clinical-rules` is the strongest thing v1 produced: pure functions, no database or LLM dependencies, 41 unit tests, and reviewable by a physical therapist in isolation. Port it deliberately — as commits the co-founder reads line by line, not a blind copy.

- [ ] Red-flag screen (structured questions)
- [ ] Risk tiering
- [ ] `validateRegime` — absolute bounds, and week-over-week delta when a previous regime is supplied
- [ ] Escalation monitor
- [ ] All 41 tests, passing
- [ ] Package has **zero** database or LLM dependencies — this is what makes it PT-reviewable and independently testable
- [ ] Thresholds and bounds are clearly marked in-code as *unreviewed defaults* until Track 0 says otherwise

**Done when:** tests pass, and the file you'd hand a clinical advisor is a single readable module with no infrastructure in it.

---

## M7 — Eval harness, **before** Flow A

Inverted from v1, where evals arrived on day 10 — after the pipeline they were meant to measure. Build the ruler first.

- [ ] Golden fixture set — start at 20–30 cases, grow toward 100. v1 had 9.
- [ ] Rubric: LLM-judged dimensions plus deterministic checks computed in code. v1's design note here is right and worth keeping: *asking an LLM to re-derive something a `filter()` already answers exactly adds cost and flakiness without adding signal.*
- [ ] Judge, tool-based scoring
- [ ] Runner writing timestamped reports
- [ ] **CI gate** on any PR touching the agent package or prompts

### Three harness bugs from v1 to fix by construction

1. **`meanOverall` averaged only over *successful* runs.** One report reads `meanOverall: 2.60, fixtureCount: 9` while **7 of the 9 fixtures failed to generate at all** — it looks like the best result ever recorded, and it's the worst. Failures must count, or the report must refuse to print a mean.
2. **Errors carried no diagnostic** — just `{fixtureId, generationStatus: "ERROR", score: null}`. Persist the error.
3. **No rubric versioning in the output.** A dimension was renamed and rewritten mid-run, and the resulting score jump was partly a rubric change, not a model improvement. Stamp the rubric version in every report.

Also: `deterministicFailures: 0` was reported alongside those 7 generation errors, because the counter only inspected scored results. Counters must not silently exclude the failure case.

### The Gemini-only caveat, recorded honestly

v1's judge deliberately used a **different model family** than the generator, to avoid same-family self-flattery. Gemini-only forfeits that mitigation. Compensate:

- [ ] Judge uses a **stronger Gemini model** than the generator
- [ ] Judge scores are spot-checked against human judgement on a fixture sample, at least once, before the floor gate in M8 is trusted
- [ ] If judge/human agreement is poor, revisit — a floor gate against an untrustworthy judge is worse than no gate

**Done when:** `run-eval` produces a versioned report where failures are visible, and a deliberately-broken generator makes the CI gate fail.

---

## M8 — Flow A, to a quality floor

Initial regime generation. Onboarding-time, no history.

- [ ] Onboarding capture: goal, target movement, condition flags, structured red-flag answers, bounded free text, wake time, evening time, available equipment
- [ ] Rules-based red-flag screen → crisis-resources routing for self-harm language, kept separate from the generic "see a doctor" exit
- [ ] Free-text red-flag classifier pass (cheap model) — catches what the structured screen misses
- [ ] Rules-based risk tiering
- [ ] Skeleton-preset retrieval — structured filter over goal × risk tier, then keyword match on body-region tags
- [ ] LLM fills the skeleton's slots. **Exercises selected by ID, never free text.** Assigns morning/evening slots.
- [ ] Freeform path as fallback when no skeleton matches
- [ ] Structural validation, then clinical validation
- [ ] Retry with the rejection reason fed back as context
- [ ] Preset fallback on exhaustion, **re-validated before persisting**
- [ ] Async job + polling, job errors never returned to the client
- [ ] Every LLM call logged: model, tokens, latency, cost, stop reason, full request and response

### Then improve until the floor is met

v1's diagnosis of its own output is the right starting point: *"The LLM is making exercise-selection decisions with almost no domain knowledge. It's choosing exercises the way a layperson with a database would."* The mean never exceeded **2.58/5**.

- [ ] Movement-pattern taxonomy wired into retrieval
- [ ] Progression chains available to the model
- [ ] Explicit reasoning scaffold in the prompt — numbered, domain-specific steps
- [ ] 2–3 retrieval-selected few-shot exemplars (more degrades — this is a real effect, don't over-add)
- [ ] **Tool descriptions written as domain documentation**, so programming knowledge reaches the model every time it considers the tool
- [ ] Skeleton coverage audit across every goal × risk-tier × body-region combination
- [ ] Consider a generate-verify-refine pass — an inline verifier between structural and clinical validation, scoring against the rubric. This targets the specific gap the evals exposed: regimes that *pass validation* and are still mediocre.

**Done when:** the agreed eval floor is met **and `sessionSlotCoherence` specifically clears it.**

That dimension gets called out because it is the one v1 never solved: it scored **2/5 in 41 of 43 graded fixtures**, with the judge repeatedly noting that *"the split isn't clearly organized around a coherent activation-vs-recovery logic — it reads as a fairly arbitrary distribution of similar-intensity work across both slots."* The twice-daily morning/evening structure is the product's stated differentiator. If the model isn't reasoning about it, the differentiator is decorative.

Note the shape of v1's failure precisely: `difficultyAppropriateness` scored 3–4 while every effectiveness dimension scored 2–3. **The safety half worked and the usefulness half didn't.** The two worst fixtures were the injury-specific ones — which is to say, the actual product premise.

Once the floor is met, move on. Do not open-endedly optimize here; revisit only if the gate regresses.

---

## M9 — Flow B, escalation monitor, scheduler

- [ ] **Escalation monitor** — runs inline on every session-log write. **Rules only, never calls an LLM.** This is deliberate and load-bearing: it makes the safety response structurally immune to model-provider outages.
- [ ] Flow B — fixed 7-day cycle. Trailing session logs → LLM proposes hold / progress / rollback plus re-slotting → validation with delta check → new regime version + adjustment event.
- [ ] LLM unavailable → **hold.** Hold is already a clinically valid state, so this introduces no new concept. Log it as an adjustment event so it's distinguishable from a model-chosen hold.
- [ ] Day-4 post-rollback check — rules-based, no LLM
- [ ] Trailing-window reset anchored to the rollback date, so the next window never straddles the incident
- [ ] Manual-hold flag respected by **both** the escalation monitor and Flow B
- [ ] Scheduler runs in the `worker` container — reproducible locally, not dependent on a hosting provider's cron

### Bugs to not re-derive

Every one of these was found in production in v1. They are not hypothetical.

- [ ] `versionNumber` computed from existing rows, never hardcoded. v1 hardcoded `1`; the second onboarding collided with the uniqueness constraint and **silently failed all three retries.**
- [ ] Activating a regime **supersedes** the prior active one. v1 left two `ACTIVE` rows for one user while three separate call sites did an unordered `findFirst` assuming exactly one.
- [ ] `WorkoutSession` uniqueness includes the regime version. Without it, a same-day regime change silently skipped creating fresh rows and paired the new regime's exercises with the old regime's completion timestamps.
- [ ] Session rows exist for future days. v1 created them once, for that calendar day only — cross a midnight boundary and "mark complete" silently disabled with zero feedback. It was patched with a lazy self-heal; the underlying gap remained and blocks server-side push notifications.
- [ ] Once-daily session logging is actually enforced. v1's uniqueness constraint used a timestamp that defaulted to the submission instant, so it could never collide.
- [ ] Retroactive "was reversed" marking **excludes the triggering row's own id**. v1 marked a rollback event as reversing itself.
- [ ] `availableEquipment` is threaded through **every** path. v1 loaded it and then silently dropped it on the Flow B path and the admin test path, so equipment filtering never applied there.
- [ ] Tool-use loops have a **maximum turn count**. v1's loops were `while (true)` bounded only by a self-correction counter — a model that kept searching and never submitted would loop indefinitely.
- [ ] Tool input from the model is **parsed and validated before use**, never accessed directly. v1 called `.map()` on raw tool input and hard-crashed on a genuine model response.
- [ ] The prompt-assembly layer is **tested**. v1's Gemini adapter silently dropped the system prompt entirely on the production path — every piece of grounding work would have been dead on arrival.

**Done when:** a real account, with real logs, produces a real weekly adjustment; and a pain-9 log triggers a real rollback. Verified against the live stack, not mocks.

---

## M10 — Mobile core loop

- [ ] **Bottom-tab navigation from the start**: Today · Progress · Plan · Account. v1 ran 17+ screens on a bare stack navigator and called fixing it *"the highest-impact structural fix in the codebase."*
- [ ] Onboarding wizard — large tappable option cards, not dropdowns. Free text reserved for the final step.
- [ ] Generation wait screen → regime review / edit → activate
- [ ] Today screen — the two session cards plus the pain check-in. **Not a progress ring.**
- [ ] Guided session player — large centered exercise GIF, prominent countdown, unambiguous next/done, minimal chrome, **tab bar hidden during a session**
- [ ] Daily check-in, bundled with the morning session
- [ ] My Plan, history, exercise detail, adjustment explainer
- [ ] Accessibility baseline: text scaling (~1.3×), 44px minimum tap targets, everywhere

### Navigation rules, learned the hard way

v1's real-device testing found the user **physically stuck** three separate times: onboarding with no way out but force-quitting, the regime review form with no back button, and a post-activation screen that was a hard dead end. Separately, a `flex: 1` used as a scroll container's content style made onboarding unscrollable.

- [ ] **Every screen has a way back.** No exceptions.
- [ ] **Every terminal screen has a forward action.**
- [ ] Scroll containers use `flexGrow`, never `flex`, on content style
- [ ] Safe-area handling is actually applied — v1 shipped the dependency with zero usage and rendered under the notch

**Done when:** the full loop — sign up → onboard → generate → review → activate → complete a session → log pain — works on a real iPhone via Expo Go and on the co-founder's Android emulator.

---

## M11 — Engagement + notifications

- [ ] Two local notifications per day, on-device, anchored to the user's wake time and chosen evening time
- [ ] Notification permission primer at first touch
- [ ] Second permission touch — the "protect your streak" re-ask, after a streak exists. Never built in v1.
- [ ] Streak logic: a calendar day holds the streak if **at least one** of the two sessions completes. Deliberately forgiving.
- [ ] Progress dashboard, milestones, streak detail
- [ ] Risk-tier re-assessment flow — a user must be able to report a new flare-up or injury. v1 never built this, despite the risk tier being *the only lever controlling how aggressively a regime can progress.* It appeared as an open item in four separate documents and was never closed.

---

## M12 — Brand identity, **then** design pass

Order matters and this is the whole lesson. From v1's own plan: *"`#2563eb` is in the codebase 45 times because nobody ever chose a color, not because anyone picked blue. A design pass with nothing to apply is just rearranging boxes."*

- [ ] **Define the brand identity first** — palette, type pairing, logo, tone. Nothing else in this milestone starts until this exists.
- [ ] `packages/design-tokens` — dark-first (deep charcoal, single high-energy accent, readable in a gym), light derived. Build dark mode into the token *shape* even if the toggle ships later.
- [ ] Migrate hardcoded styles to tokens as a **zero-visual-change refactor, while the app still looks bad** — so any screenshot diff is unambiguously a bug.
- [ ] Then apply: NativeWind, component library, charts
- [ ] Session player polish — the completion moment matters most. A brief animation or haptic.

### The `DESIGN.md` do-not list

Without explicit guardrails, AI-generated screens converge on the same defaults regardless of the brief. Encode these:

- No stock three-column feature grids with circular icons
- No `01 / 02 / 03` numbered markers on non-sequential content
- No gradient overlays on text
- No hero images with a dark scrim and centered white text
- No progress ring as the primary home-screen element

### Three screens that stay clinical, always

These are **never** gamified, never given the accent color, never animated, regardless of brand tone:

1. The crisis-resources screen (self-harm language detected)
2. The red-flag exit screen
3. Escalation-rollback "stop and consult a professional" messaging

**Done when:** no hardcoded color values remain outside the token package, and the three clinical screens visibly differ in register from the rest of the app.

---

## M13 — Marketing web + legal surfaces

Web is marketing only. It is not a second copy of the product.

- [ ] Landing, How It Works, Safety & Guardrails, Pricing, About
- [ ] Privacy policy, terms, AI-usage disclosure, medical disclaimer
- [ ] In-app links to the legal surfaces from mobile
- [ ] Deployed independently of the API

---

## M14 — Production hosting decision + first deploy

Made deliberately, at this checkpoint, with real requirements — not by default at the start.

- [ ] Decide and write the ADR: managed Postgres provider, container host, marketing host
- [ ] Production database provisioned, migrations applied
- [ ] Secrets management
- [ ] Error monitoring wired in. v1 named it in its tech-stack decision and **never wired it up** — there was no error monitoring at all, for the entire build.
- [ ] Automated deploy on merge. v1 deployed manually for its entire lifetime and never configured this.
- [ ] Backups, and a restore actually tested

**If the choice lands on a provider that auto-exposes tables over an API** (Supabase's PostgREST does this), then RLS-disabled means publicly readable *regardless of what your application code does*. v1 had **seven tables** exposed this way, caught by the vendor's own linter. The `check:rls` gate covers this — keep it.

---

## M15 — Launch gates

None of these are engineering velocity problems.

- [ ] **Clinical sign-off** — Track 0 lands. The largest single blocker.
- [ ] **Legal sign-off** — Track 0 lands.
- [ ] **Purchase the AscendAPI Shop tier** and swap the vendored snapshot. The free tier is demo-only.
- [ ] **Billing** — payment provider integrated, subscription state actually flips.
      Trial design already decided: free through onboarding, the first regime, and the *first* recursive adjustment. The gate is that the **second** scheduled adjustment never fires — the scheduler checks subscription state and skips, so no inference spend is wasted on a lapsed user. Paywall is a non-blocking card in settings, never an upfront gate.
- [ ] **Unit economics modeled** against real logged cost data before the price is set. v1 swapped models for cost without ever running this. One real datapoint from v1: **$1.49 across 113 calls** during ~2 hours of heavy testing.
- [ ] **Production auth cutover** verified end to end
- [ ] **Clean production database** — beta data has inconsistencies baked in, and trustworthy launch metrics are worth more than preserved test accounts
- [ ] App Store submission requirements, including health-data declarations

---

# Appendix A — Carried-forward bug catalogue

Every item here was a real bug or a real trap in v1. They are grouped by where they bite. This appendix exists so that this knowledge lives in the repo rather than in a 171KB session log.

### Regime and session data
- Hardcoded `versionNumber` → silent collision on second onboarding → all retries failed silently
- No supersede on activate → two `ACTIVE` regimes → unordered `findFirst` picks arbitrarily, in three places
- `WorkoutSession` uniqueness missing the regime version → stale completion timestamps after a same-day regime change
- Session rows only ever created for today → silent dead-end after midnight
- Once-daily logging unenforced because the uniqueness key defaulted to "now"
- Escalation monitor didn't check the manual-hold flag on one of its two call sites
- Retroactive reversal marking included the triggering row itself

### LLM and agent layer
- `.map()` called on raw, uncast model tool input → hard crash on a real response
- User equipment silently dropped on two of three code paths
- **The provider adapter dropped the system prompt entirely** on the production path
- Unbounded `while (true)` tool loops with no turn cap
- Insufficient max output tokens truncated full regimes; needs headroom, not a default
- A model version was found deprecated for new API keys with no warning
- Free text must be passed as clearly delimited user content, never concatenated into system instructions — and length-bounded to ~500–750 chars per field, which limits both token cost and injection surface

### Security
- Error formatter leaked raw internal exception text to the client, and it was **rendered in the UI**
- CSP missing `worker-src` → auth worker blocked → intermittent unauthorized errors on mutations while queries kept working. Took a long time to diagnose.
- CSP missing the auth provider's CAPTCHA hosts
- CSP missing the media host → every exercise GIF silently blocked
- `strict-dynamic` would have broken every sign-in, because the auth script loads without a nonce. Caught by diffing the actual response body against the header — not by reading the spec.
- Seven tables shipped with RLS disabled, publicly exposed via an auto-generated API
- One table regressed to no-RLS after that fix and went undetected until an audit. **This is why the CI coverage check exists.**
- Real secrets committed to `.env.example` **twice**

### Environment and tooling
- Prisma client generation fails on Windows with a file-lock error if the dev server is running — recurred across at least four sessions
- Container/deploy tooling does not necessarily respect `.gitignore`; a 492MB build-cache archive was swept into an upload
- Framework env allowlists silently drop unlisted variables from the build
- A placeholder value in the workspace config blocked *every* package-manager command
- Windows Firewall silently hangs non-interactive bundler startup — indistinguishable from a slow bundler
- Package tsconfigs must include the scripts directory and must not set `rootDir`
- Editor silently uses the wrong TypeScript version when a workspace pins a different major

### Process
- **Every real bug was found by a human using the app.** Typecheck-clean was never evidence of anything.
- A migration plan drafted on a cheaper model and reviewed on a stronger one against real source **found six real errors in the first draft, two of which would have caused production bugs.** Worth repeating as a habit.
- Documentation deferred to "later" produced a multi-session gap that had to be reconstructed from `git log`. Write the entry in the same commit as the work.
- Deferred decisions get un-deferred. Rate limiting was explicitly deferred, then implemented six days later. When deferring, shape the interface so the eventual swap is a one-file change.

### Features abandoned after real cost — do not re-attempt without a reason
- **Sunset/geolocation-based evening scheduling.** Fully built and verified, then deleted two days later as complexity without payoff. Build the boring version of scheduling.
- **Global swipe-to-navigate gesture.** Four native rebuild cycles (~15 min each), root cause never confirmed, fully reverted. The actual user problem — getting stuck on a screen — was solved by **a back button.**

---

# Appendix B — Guardrails

Rules that exist because something broke. Each one traces to a specific incident above.

1. **Any new external host on any page requires a matching CSP entry, in the same commit.** Three separate CSP misses shipped silently in v1.
2. **Every new table gets an explicit RLS decision, or CI fails.** Not a reminder — an enforced check.
3. **A test that self-skips without credentials must fail in CI, not pass.** v1's isolation test skipped silently for the entire project.
4. **Typecheck-clean is not evidence.** Anything user-facing gets a real click-through on a real device before it's called done.
5. **Zero new native dependencies without a real reason.** Expo Go until something genuinely forces a dev build. Each native dep costs a rebuild cycle, and this rule is what keeps iteration fast.
6. **Errors never leak internal exception text to a client.**
7. **Model tool output is parsed and validated before use.** Never accessed directly.
8. **Every tool-use loop has a maximum turn count.**
9. **The prompt-assembly layer is tested.** A silently-dropped system prompt is invisible in every other kind of test.
10. **Eval reports must make failures visible.** No metric may be computed over successes only.
11. **Decisions that change an interface, a dependency, or a data shape get an ADR** — before the work, not after.
12. **Documentation is written in the same commit as the work it describes.**
13. **Verification standard, carried verbatim from v1:** typecheck, tests, and RLS check must pass, against real infrastructure rather than mocks — including real cross-user isolation tests and real forced-failure tests (invalid API keys, to genuinely exercise the fallback paths) — before anything is called done.