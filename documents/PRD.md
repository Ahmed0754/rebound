# Rebound.ai PRD

*Product Requirements Document — what we're building, for whom, and why. For how it's built, see [`TDD.md`](./TDD.md). For the database schema, see [`DATA_MODEL.md`](./DATA_MODEL.md). For step-by-step user flows, see [`USERFLOW.md`](./USERFLOW.md). For screen inventory, brand tone, and design constraints, see [`DESIGN_BRIEF.md`](./DESIGN_BRIEF.md). For the implementation agenda, see [`GAME_PLAN.md`](./GAME_PLAN.md). For current build state, see [`ENG_PLAN.md`](./ENG_PLAN.md).*

> **⚠️ Current state, 2026-09-01.** None of the product described here is built. The repo holds a bare-bones slice: one web screen that asks which body part hurts and lists three exercises a Gemini call picked from 30 mock rows. **No onboarding, no red-flag screening, no risk tiering, no regimes, no sessions, no accounts.** In particular, the safety architecture this document treats as non-negotiable — deterministic rules bounding what the LLM may prescribe — **does not exist yet**, and the LLM currently picks dose freely. That is the arrangement this document calls irresponsible to ship, and it is knowingly the current state of a demo with mock data. See [`ENG_PLAN.md`](./ENG_PLAN.md).

> **v2 note.** This document was rewritten at the start of the v2 build. The product thinking is carried forward largely intact — it held up. What changed is platform (mobile-first), infrastructure, and a more honest accounting of what the safety rules actually rest on. Decisions overturned from v1 are marked **[v2]**.

---

# Overview & Objectives

AI-powered recovery and performance app built for athletes — observes a user's pain, mobility, and strength on a recurring basis and recursively adjusts their training/recovery regime to keep them moving toward their goal instead of sidelined by it. Success is defined as measurable improvement in a user's self-reported pain and mobility/strength scores on their target movement(s) over time, without a corresponding increase in adverse events (re-injury, pain spikes).

**Objectives**

- **Activation:** ≥60% of new signups complete onboarding (goal selection + finetuned regime) and log at least one session within 7 days.
- **Efficacy:** Among users with ≥4 weeks of consistent logging, ≥50% show a meaningful improvement (e.g., ≥2-point drop on a 0–10 pain scale, or measurable ROM/strength gain) on their target movement.
- **Retention:** ≥35% D30 retention (users still logging at least 2x/week at day 30).

**[v2] Platform.** Rebound.ai is a **mobile app**. The product is a twice-daily habit loop with on-device notifications — that belongs on a phone. The web presence is marketing, pricing, and legal surfaces only, not a second copy of the product. v1 built and maintained the full app twice, on web and mobile in parallel; the duplication produced more bugs than it produced reach.

# Problem Statement

Athletes lose training time to nagging injuries and under-recovery — not because recovery is impossible, but because it's hard to prioritize without structure, feedback, and accountability, and the existing options are either a slow, clinical PT pipeline (referral, scheduling, insurance) or generic fitness apps with no real recovery logic behind them. Physical therapy and stretching apps in general struggle with the same underlying adherence problem: users forget to do their exercises because life and training are busy, or they disengage because they're unsure if they're doing an exercise correctly and get discouraged by lack of visible progress. The result is athletes staying sidelined longer than they need to, or returning to training under-recovered and at risk of re-injury.

# Intended Audience

- **Athletes** (amateur through competitive) — the primary audience and go-to-market focus. See Competitive Landscape > Brand Positioning.
- Fitness individuals / general training population
- Patients with hindering diseases (autoimmune, etc.) — fully supported by the underlying product, just not the lead marketing angle
- Elderly — same as above

Broadening the *marketed* audience to athletes doesn't narrow who the safety rules protect. The Clinical Risk Framing guardrails below are written for, and still fully cover, everyone on this list.

# Daily Session Structure

*The core habit loop. This is a deliberate differentiator, not an incidental feature.*

Every user gets exactly **two sessions per day**, no more, no fewer — fixed, not user-configurable:

- **Morning session** (on wake): bundles the day's stat/pain check-in with the first exercise block. Content leans mobility and activation.
- **Evening session** (at a user-picked time): the second and final exercise block. Content leans strength and recovery, depending on what the regime calls for.

> Originally spec'd as sunset-anchored via geolocation. That version was fully built, verified against real coordinates, and deleted two days later as complexity without payoff. A user-picked time is the correct design.

**Content-aware slot assignment.** The LLM assigns each exercise to morning or evening at regime-generation time (Flow A) and re-assigns as needed at each recursive adjustment (Flow B) — using the user's stated context to judge fit, not a fixed rule. A self-described busy office worker gets denser, more efficient sessions; a self-described younger ex-athlete's sessions can run longer or heavier. The exercise library's `category` field is a soft signal for slot fit, but the model's read of the user's stated context drives the actual split.

> **⚠️ This is the mechanic v1 never got working.** In evaluation, `sessionSlotCoherence` scored **2/5 in 41 of 43 graded fixtures**, with the judge repeatedly noting the split "reads as a fairly arbitrary distribution of similar-intensity work across both slots." If the model isn't genuinely reasoning about morning-versus-evening, the differentiator is decorative. `GAME_PLAN.md` M8 makes this an explicit quality gate.

**Streak logic.** A calendar day maintains the streak if **at least one of the two sessions** was completed. Completing both isn't required, and skipping the evening session after doing the morning one doesn't break the streak. This is deliberately more forgiving than an all-or-nothing streak, matching real adherence patterns better than punishing a single miss.

# Clinical Risk Framing

### Why this needs its own section

The app is marketed primarily to athletes, but its user base spans higher-risk populations, and it includes an AI loop that adjusts a user's self-reported pain and mobility program over time. That pattern is commonly scrutinized for potential **Software as a Medical Device (SaMD)** classification, and it affects liability and insurance posture. Not legal advice — get legal review before launch — but the PRD needs an explicit position.

### Decision — pure AI automation

No clinician in the loop for any tier (this is the differentiation). Weekly loop: evaluate the trailing 7 days of self-reported trajectory → hold or progress if improving → adjust or roll back if not → repeat until pain-free or the user ends. Because there is no clinician safety backstop, the guardrails below are non-optional. Any clinician-reviewed tier is a deliberate future decision.

### Concrete onboarding safety requirements (non-negotiable)

- **Red-flag screen** before any regime (severe or sudden pain, numbness/tingling, trauma, post-surgical, pregnancy-related, cardiac exertion symptoms) → route to "see a doctor or PT."
- **Risk tiering** (age, condition type, pain severity, autoimmune/chronic flag) gates allowed aggressiveness.
- **Escalation and pause** on pain spikes or a "made it worse" flag → rollback plus "stop and consult a professional" messaging above a threshold. Runs in real time on every Session Log write, not gated to the weekly cycle.
- **Change ceilings**: hard rules-based weekly bounds, independent of the LLM. Because exercise content carries no PT-annotated contraindications, default to conservative selection and smaller week-to-week changes until PT-reviewed content exists.

### ⚠️ What these numbers actually rest on

The change ceilings and pain tiers below are **evidence-informed starting points, not clinical prescriptions**, and v1's own literature cross-check was blunter than its framing suggested. Both findings are reproduced here rather than buried, because they should be put in front of the clinical reviewer directly:

- **The "10% rule" is weaker evidence than "evidence-informed" implies.** It has never been validated in a peer-reviewed trial, and a key systematic review found **no injury-risk difference between 10% and 24% average weekly load increases** — with the real injury-risk signal being **large single-session spikes**, not a weekly percentage.
- **The 0–3 / 4–6 / 7–10 pain split** is a legitimate general clinical convention, but it does not precisely match the specific pain-monitoring model this document originally gestured at by name.

The first finding has an architectural consequence: it suggests the **real-time escalation monitor** — which fires per session log, catching exactly the single-session spikes the research identifies — is the clinically load-bearing component, and the weekly change ceiling is the weaker one. v1 built both and weighted them the other way round. A clinical reviewer should be asked to rule on this explicitly.

**Do not mistake "cross-checked against cited literature" for "signed off."**

### Regime Generation Architecture

Initial-regime generation is **hybrid** — not a pure LLM prompt, and not a pure rules-based mapping.

> **Rules decide who is eligible for what intensity. The LLM decides which specific exercises, and which session slot, within those bounds. Rules validate the output before a user ever sees it.**

This split is what makes pre-launch validation testable: the rules layer is unit-testable deterministically, and PT review only needs to focus on the model's judgment within already-safe bounds. It is also why the clinical-rules module is kept free of any database or LLM dependency — so a physical therapist can read it in isolation.

There are two distinct flows, which must not be conflated in implementation: **initial generation** (onboarding, no logged history) and **recursive adjustment** (fixed 7-day cycle, trailing Session Log data). A third component, the **escalation monitor**, runs independently of both, in real time.

**Flow A — initial regime generation**

1. **Onboarding answers** captured (goal, target movement, symptoms, lifestyle context, available equipment, wake and evening times).
2. **Red-flag screen** (rules-based, no LLM). Flagged → exit to "see a doctor," no regime generated.
3. **Free-text red-flag classifier** (cheap model). Catches disclosures the structured screen missed. A hit routes the same way a structured flag does.
4. **Risk tiering** (rules-based). Sets the allowed change ceiling.
5. **Skeleton-preset retrieval.** A structured filter narrows hand-authored protocol skeletons by goal × risk tier, then keyword-matches body-region tags against the user's free text. This grounds the model in a literature-cited protocol *shape* rather than free invention.
6. **LLM fills the skeleton's slots**, selecting exercises **by ID from the library via tool call**, never as free text, and assigning each to the morning or evening slot. Falls back to freeform drafting when no skeleton matches.
7. **Structural validation** (schema), then **clinical validation** (`validateRegime(draft, riskTier)` — absolute bounds only, since there is no previous regime).
8. **User reviews and edits** before activating.
9. **Regime v1 activated.** Session Log and Workout Session tracking begins.

**Flow B — recursive adjustment (fixed 7-day cycle)**

1. **Trailing 7-day Session Logs** pulled. The window anchor is the later of the scheduled date or the most recent escalation rollback, so it never spans an incident.
2. **LLM proposes an adjustment** — hold, progress, or rollback, including any re-slotting between morning and evening.
3. **Clinical validation** — `validateRegime(draft, riskTier, previousRegime)`. With a previous regime present, both absolute bounds and the week-over-week delta check run. Too aggressive → clip to ceiling or hold.
4. **New regime version created; Adjustment Event logged** with trigger type `scheduled_adjustment`.

**Escalation monitor (real-time, decoupled from Flow B's cadence)**

Runs on every Session Log write. A pain spike shouldn't wait a week to be caught. **Rules only — it never calls an LLM**, which is what makes the app's real-time safety backstop structurally immune to model-provider outages.

| Signal | General tier | Light injury tier | Heavier / chronic / elderly tier |
| --- | --- | --- | --- |
| Single log, pain red (7–10) | Immediate pause + rollback | Immediate pause + rollback | Immediate pause + rollback |
| "Made it worse" flag | Immediate pause + rollback | Immediate pause + rollback | Immediate pause + rollback |
| Day-over-day pain jump ≥2 pts | Flag; rollback if repeated 2 days running | Flag; rollback if repeated 2 days running | Rollback on first occurrence |
| Yellow (4–6) not settled by next morning | Hold; rollback after 2 consecutive | Hold; rollback after 2 consecutive | Rollback on first occurrence |

A triggered rollback creates an Adjustment Event with trigger type `escalation_rollback`, reverts to the prior regime version, and surfaces "stop and consult a professional" messaging. Because this bypasses the scheduled loop, it **must** still be logged as an Adjustment Event, or the reversal-rate guardrail metric silently undercounts the rollbacks that matter most.

**Post-rollback cadence.** The baseline stays a 7-day trailing window for everyone; shortening it universally would undercut the change-ceiling figures, which come from weekly-cadence research, and would mix pre- and post-incident data into one trend read. Cadence changes only locally around an actual incident:

- **Trailing-window reset.** After a rollback, the next Flow B window anchors to the rollback date.
- **Day-4 post-rollback check.** Four days after a rollback, a rules-based read of already-collected Session Logs asks one question: has pain stayed at or below the rolled-back level? Yes → resume the normal cycle, no LLM call. No → escalation thresholds apply as always.

**Tool access, not MCP.** Exercise-library and current-regime lookups are plain tool-use function calling, not a standalone MCP server. MCP earns its complexity when multiple external clients need to interoperate; for a single first-party app calling its own database from its own backend, function calling is materially less infrastructure.

**Validator scope.** One shared module, one function: `validateRegime(draftRegime, riskTier, previousRegime?)`. Absolute bounds always run. The delta check runs only when a previous regime is supplied — true for Flow B, naturally absent for Flow A.

**Change ceilings (defaults, pending clinical sign-off).**

| Risk tier | Max week-over-week increase | Progress condition | Hold condition | Rollback trigger |
| --- | --- | --- | --- | --- |
| **General / no injury** | 10% | Pain green (0–3) across the window | Pain yellow (4–6) any session | Pain red (7–10), or "made it worse" |
| **Light injury** | 5% | Green pain AND settles within 24h, 2 consecutive logs | Yellow pain, or green not settling by next morning | Red pain, ≥2-pt jump from prior baseline, or "made it worse" |
| **Heavier / chronic / autoimmune / elderly** | Hold-only by default; progress only after 2 consecutive green cycles | Same, doubled confirmation window | Yellow pain, or any single non-green log | Red pain, "made it worse," or any yellow after a prior hold |

Notes: the general tier uses the standard figure because risk tiering already routes higher-risk users out of it. The light-injury tier sits deliberately below general-population norms — injured tissue gets a smaller ceiling regardless of what the model judges it could handle. The heaviest tier defaults to *hold*, not slow progress, since this group has the least clinical backstop and the most downside from a wrong call. The 24-hour settle check is computable directly from Session Log by comparing day N to day N+1.

### LLM reliability and failure handling

Every step that touches the LLM has a defined failure path. None of them result in an unhandled error reaching the user or an unsafe regime slipping through.

**Two validation layers, run in order:**

1. **Structural validation** — schema check on the drafted regime: required fields present, exercise list non-empty, numeric ranges sane, no duplicate exercises, valid session-slot values.
2. **Clinical validation** — `validateRegime`, run only on output that already passed structurally.

**Invalid or nonexistent exercise ID.** Handled inside the tool-use loop: the library tool validates the ID against the database and returns an error in the same turn. The model self-corrects, capped at a small number of attempts before falling through to the outer retry policy.

**Model or API unavailable.**

- **Flow A.** The generation job retries with exponential backoff. On exhaustion the user is **not** blocked — they're handed the closest-matching general preset for their risk tier, so onboarding completes the same day, and the job is flagged for admin review. The preset is **re-validated before persisting**.
- **Flow B.** Safe default is to **hold** — skip the adjustment this cycle. Hold is already a clinically valid state, so this introduces no new concept. Logged as an Adjustment Event so it stays distinguishable from a model-chosen hold. Retried next cycle.
- **Escalation monitor.** Rules only; never calls the LLM. Structurally unaffected.

**`validateRegime` fails repeatedly.** One retry with the specific rejection reason fed back as context. On a second failure: Flow A falls back to the nearest general preset; Flow B falls back to hold. Using the same two fallback destinations regardless of *why* generation failed keeps this to one failure story instead of three, and keeps the flagged-for-review queue meaningful.

### Free-text input handling

- **Length bounding.** Cap each free-text field at ~500–750 characters. Controls token cost on every call and shrinks the prompt-injection surface.
- **Prompt hygiene.** Free text is passed as clearly delimited user content, **never concatenated into system-level instructions**. The goal is that even an adversarial input can only influence which exercises get proposed, never bypass the validator's bounds.
- **Red-flag leakage check.** Nothing stops a user from answering "no" to a structured question and then disclosing the same red flag in free text — *"36 weeks pregnant, sciatica's been brutal"* typed into the lifestyle box. A cheap classifier pass runs specifically to catch this, before the draft step.
- **Consistency across call sites.** **[Open]** Is onboarding free text re-fed into Flow B prompts every cycle, or captured once? If reused, length-bounding and the red-flag scan must run at every call site that reads it, not only at intake.

### Pre-launch validation

Create a held-out test set of realistic trajectories (plateauing, worsening, contradictory) and have a PT or clinical advisor review the proposed adjustments. Track reversal rate from day one. The admin scenario simulator exists specifically to produce this test set.

### Legal and ops items — open now, not later

TOS and medical disclaimers (digital-health counsel), liability insurance scoping, state health-data law applicability (e.g. CMIA) even where HIPAA doesn't apply, App Store and Play health-data requirements, and the SaMD classification question. None are code-fixable and all have long lead times. See `GAME_PLAN.md` Track 0.

### Documented limitation

The red-flag screen only catches conditions **disclosed at onboarding**. It cannot catch symptoms that emerge later or that a user underreports. This is stated explicitly because legal and insurance review will ask.

# Technical Scope

**In scope**

- Onboarding and goal capture; initial regime generated via the hybrid Flow A above. A user has a single primary target movement.
- Regime finetuning and activation before tracking begins.
- Stat logging **once daily**, bundled with the morning session.
- Streak system — a day counts if at least one of the two sessions is completed.
- **Two local on-device notifications per day** — morning (wake) and evening (user-picked). Not server push.
- Recursive adjustment agent on a fixed 7-day cycle, plus the real-time escalation monitor on every Session Log write. Both validate through the same shared function.
- General presets, which also serve as the Flow A failure fallback.
- Accessibility baseline: text scaling and larger tap targets, minimum. Elderly users are an explicit audience.
- **[v2] Risk-tier re-assessment.** A user must be able to report a new flare-up or injury. v1 never built this despite the risk tier being the only lever controlling change ceilings; it appeared as an open item in four separate documents and was never closed. It is in scope now.
- **[v2] Exercise data: AscendAPI only**, vendored as a committed snapshot. v1 used two sources — one for text data, one for GIFs — joined by fuzzy string similarity, and only 56% of the library ever got a visual. One source, in git, seeded offline.

**Deferred (expected, not v1)**

- Camera-based form tracking and correction.
- Licensed PT-authored and annotated exercise content. The library carries no clinical annotation — no contraindications, no rehab-specific progressions, no isometric or regression staging. **Implication:** since exercise selection itself carries no clinical safety annotation, the Clinical Risk Framing guardrails are the *only* safety layer, and selection defaults conservative until annotated content exists.
- **Licensed media upgrade** — the free AscendAPI tier is demo-grade and disposable; the Shop tier is the launch-safe version. Because the data is vendored, this is a snapshot swap.
- PT/clinical document upload. If built, the AI's read of the document should be **advisory** — surfaced for user confirmation — not autonomous.
- True multi-goal support. The schema allows it; the product does not implement it.
- **[v2] A full web application.** Web is marketing only.

**Out of scope**

- Diagnosing injuries or replacing medical/PT consultation
- Integration with wearables, EHR/EMR, or insurance/billing systems
- Social and community features (leaderboards, sharing). Pain and injury data sits badly next to any public comparison feature. If a social layer is ever wanted, it must be private and opt-in only.

# Data Model

See [`DATA_MODEL.md`](./DATA_MODEL.md) for the authoritative schema. Product-level intent:

- **User** — goal type, risk tier, condition flags, target movement, available equipment, wake and evening times. **[v2]** Identity is our own, in our own database, not keyed to an external auth provider's user id.
- **Exercise** — category, target muscle groups, difficulty, equipment, movement pattern, progression group, media, contraindications (empty until PT-annotated content exists).
- **Regime** (versioned) — the object the agent modifies over time: exercise list with sets, reps, duration, frequency, and session slot; status; end reason; parent-version link supporting history and rollback.
- **Workout Session** — one per scheduled slot per day, tracking exercise completion. This is what streaks compute from. Distinct from Session Log.
- **Session Log** — one per day, the check-in bundled with the morning session: pain score, mobility/strength indicator, and a "this made it worse" flag feeding both the adverse-event guardrail and the escalation monitor.
- **Adjustment Event** — the agent's audit trail: trigger type, trailing window used, rationale, and a `wasReversed` flag that makes the reversal-rate guardrail a first-class field.

> Success Metrics require measuring improvement against a baseline and tracking a reversal rate. Neither is measurable unless Session Log, Workout Session, and Adjustment Event exist as structured, queryable objects **from day one**. Retrofitting after launch loses baseline data for the earliest cohorts — the ones you most want to learn from.

# Success Metrics

**Primary:** % of active users (≥4 weeks logging) showing measurable, sustained improvement in their target metric — pain score, ROM, or strength benchmark, whichever applies — measured against their own baseline at regime start.

**Guardrail metrics** (must not degrade as the primary is optimized):

- **Adverse event rate** — self-reported pain increase of ≥2 points, or a user-flagged "this made it worse"
- **Churn** — including both involuntary (failed payment) and voluntary cancellation, captured with a reason code
- **Regime-adjustment reversal rate** — how often the AI walks back a change it made the prior cycle, a direct proxy for adjustment quality, segmented by trigger type

# Competitive Landscape & Differentiation

**Closest competitors:** Sword Health and Hinge Health (Sword acquired Kaia Health in January 2026). The common pattern is AI plus a licensed PT in the loop, often hardware-assisted, distributed mostly B2B2C through employers and insurers. Smaller players follow similar models.

**Why a user picks Rebound.ai instead:**

- **Direct access** — start without employer coverage, insurance authorization, or a diagnosis.
- **DTC cost** — pricing stays low because there is no clinician-hour overhead.
- **Speed** — no scheduling, no hardware. Questionnaire to regime immediately.
- **Broader scope** — not just diagnosed MSK injuries; also in-season training load, mobility work, and recovery between hard sessions. A training tool, not only a rehab tool.
- **Habit-loop structure** — a fixed, forgiving two-session daily rhythm with content-aware placement and a streak that needs only one of the two. This is a deliberate product bet: it is the mechanism meant to solve the adherence problem named in the Problem Statement.

**Trust mechanisms deliberately forgone:**

- **Licensed PT review** — omitted to preserve pure automation and the DTC cost structure. This is exactly what makes the Clinical Risk Framing guardrails non-negotiable.
- **Published outcomes** — not at v1. Positioning is access, speed, and cost until cohort data exists.

**Positioning line:** *"Train like an athlete, recover like one too — an AI-adjusted plan that keeps you moving toward your next PR instead of sidelined by pain, no doctor's referral or insurance approval needed."*

**Brand positioning.** Market to athletes the way lifestyle-fitness brands market performance and energy products to a broad, non-clinical audience — energetic, performance-and-recovery framing rather than clinical "physical therapy" framing. This is a go-to-market and copy decision, not a change to the product. The guardrails are unchanged and still fully apply to every user, including the higher-risk populations above. Athletes get injured too: the same ceiling that stops an elderly user's regime from progressing too fast is exactly what should stop an athlete from re-aggravating a strain by pushing back into training too soon.

# Business Model

**Model:** Subscription, not one-time purchase. The core value (an ongoing, adapting regime) and the core cost (LLM inference on every adjustment cycle) are both recurring. A one-time payment would mean absorbing inference costs indefinitely.

**Trial mechanics:** Free through onboarding, the questionnaire, the first AI-generated regime, all supporting features, and the user's **first** recursive adjustment (~1 week in). The user experiences one full adjustment cycle before being asked to pay.

The gate is not a blocking screen. It's that the **second** scheduled adjustment (~2 weeks in) never fires: the scheduler checks subscription state before generating it and skips users who haven't converted, so **no inference spend goes toward a regime update a non-paying user will never see**. The regime simply holds at its post-week-1 version until they pay, at which point the next cycle generates the adjustment they were owed. A non-blocking paywall card in settings surfaces this in the meantime.

**Contextual paywall, never an upfront gate.** There is an engineered small win before any monetization ask — regime generation plus a first completed session. That moment is worth deliberately not interrupting with settings or paywall noise.

**Pricing:** TBD. Comparable players offer flat, insurance-independent tiers around $14.99/mo. Outcome-based pricing is precedented but adds complexity this product doesn't want at v1.

**Voluntary cancellation.** Takes effect at the end of the current billing period rather than immediately, and captures a reason code at cancel time, feeding the churn guardrail. On cancellation, personalized-regime access downgrades to presets-only.

**[Open]** Exact price point, and whether any free tier persists post-trial. This also gates the fuller win-back flow.

**⚠️ Unit economics are unconfirmed.** The cost per active user per week — the weekly adjustment plus the escalation monitor on every log — has never been modeled against the reference price. v1 swapped to a cheaper model for cost reasons without ever running this calculation. One real datapoint from v1: **$1.49 across 113 calls** during roughly two hours of heavy testing. The LLM call log carries the data needed to do this properly. See `GAME_PLAN.md` M15.

# Analytics & Instrumentation

- **Activation (≥60% in 7 days):** onboarding-step completion events as a funnel — goal selected → regime generated → regime activated → first Session Log — timestamped against signup.
- **Efficacy (≥50% at 4 weeks):** computed from Session Log pain and indicator deltas against each user's first logged baseline, for users with ≥4 weeks of logs.
- **Retention (≥35% D30):** Session Log frequency per user (≥2x/week) at day 30.
- **Guardrails:** adverse events and churn from the Session Log flag and account-status events including the cancellation reason code; reversal rate directly from the Adjustment Event field, segmented by trigger type.

**[Open]** Tooling choice — a product analytics platform versus direct queries against Postgres. Not decided. The event- and field-level tracking above holds regardless.

# Open Questions & Risks

### Open

1. **Streak endgame.** What happens to the streak once a user's stated goal is met — does it end, convert to a maintenance streak, or something else?
2. **Free text in Flow B.** Re-fed every cycle, or captured once? Determines where the bounding and scanning logic must run.
3. **Price point and free tier.** Gates the win-back flow.
4. **Analytics tooling.**
5. **Is the effectiveness gap closable?** v1's mean regime quality never exceeded 2.58/5 while its *safety* dimensions scored well. If deep improvement work doesn't move the effectiveness dimensions, that is a product-level finding, not just an engineering one, and it should be surfaced to the advisor rather than absorbed quietly.

### Risks

- **Clinical sign-off is the largest single launch blocker.** Long lead time, not parallelizable with code. Started in Track 0.
- **Legal review not started.** Same shape.
- **Effectiveness, not safety, is the unsolved problem.** v1's deterministic checks all passed and difficulty-appropriateness scored 3–4/5, while every effectiveness dimension sat at 2–3. The two worst fixtures were the injury-specific ones — the actual product premise.
- **Vendor concentration.** Mitigated in v2 by containerizing and deferring the hosting decision, but the exercise-media vendor remains a single point of dependency until the licensed tier is purchased.
- **Exercise content carries no clinical annotation.** Named again here because it is the reason the guardrails cannot be relaxed.

### Ownership

**[v2]** Every open item above has an owner assigned between the two founders. v1 left these unassigned because it was a solo build; that is no longer the situation, and unassigned items do not get closed.

# Roadmap

**[v2]** See [`GAME_PLAN.md`](./GAME_PLAN.md) — the milestone agenda from zero to shippable, including the two non-code tracks that gate launch regardless of engineering velocity. v1 listed "roadmap/timeline" as a missing PRD section for its entire lifetime.

# Technical Direction

Architecture, stack, system design, and implementation detail live in [`TDD.md`](./TDD.md), kept current against the real codebase rather than restated here.
