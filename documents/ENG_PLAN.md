# Rebound.ai — Engineering Plan

*The **living state document**. What's done, what's next, what's risky, right now. For the full milestone agenda, see [`GAME_PLAN.md`](./GAME_PLAN.md). For architecture, see [`TDD.md`](./TDD.md).*

> **[v2] This document has a different job than v1's version had.** v1's `ENG_PLAN.md` was a retrospective log of completed milestones — useful history, but it drifted from reality because it was written after the fact. This one answers exactly three questions at any moment: **what works right now, what's being worked on, and what will bite us.**
>
> **Update it in the same commit as the work it describes.** v1's rule, learned the hard way: several sessions' worth of feature commits landed with no matching entry, and the gap had to be reconstructed from `git log` and `git show` afterward. Its own note: *"when committing real feature work, write the session section in the same pass, don't defer it."* The reconstruction was still incomplete — a whole architectural change (the skeleton-preset retrieval layer) existed in the code and in the TDD but appeared nowhere in the log.

---

**Last updated:** *(set on first real update)*
**Current milestone:** M1 — Proof of concept

---

## Status

### What works end to end

*Nothing yet. v2 has not started.*

Update this section only with things that have been **run and verified**, not things that have been written. v1's verification standard, carried forward verbatim:

> Every item that claims "done" was, at the time it was built, verified against the real database and the real model API — **not mocked** — including real cross-user RLS isolation tests, real forced-failure tests (invalid API keys, to genuinely exercise the fallback paths), and real device testing. Hold any future work to the same standard: `pnpm typecheck && pnpm test && pnpm check:rls` at minimum, plus a real click-through for anything user-facing, before calling something done.

### What's stubbed or faked

*(List anything that looks finished but isn't. v1's list included: billing that never flipped state, an auth provider still on its development instance in production, a dead location dependency with zero call sites, and an exercise field that was empty for every row. Each of these read as "built" from the outside.)*

### In progress

*(Who is working on what, right now.)*

---

## What's next

**M1 — Proof of concept. Hard deadline: this week.**

See `GAME_PLAN.md` M1 for the checklist. The short version: one Expo screen asking "what muscle hurts," a standalone containerized API, mock exercise rows in a Dockerized Postgres, one generic Gemini call, three exercises back.

Deliberately not the real architecture. It exists to demo for the advisor **and** to force Docker, Postgres, the API container, Expo Go on a real phone, and LAN networking between them to all work before the co-founder clones anything.

**Done when:** demoed on a real iPhone, and the co-founder brings the whole stack up on macOS from a clean clone with only a Gemini API key.

---

## Risks

Ordered by how much they'd hurt, not how likely they are.

### 1. Clinical sign-off — the largest single launch blocker

The risk-tiering thresholds and the change ceilings are **invented defaults**. They have been cross-checked against literature, which is not the same as being signed off, and the cross-check was less flattering than the framing implied — see `PRD.md`'s "What these numbers actually rest on."

Long lead time. Not parallelizable with engineering. Started in `GAME_PLAN.md` Track 0.

**Do not mistake "cross-checked against cited literature" for "signed off."**

### 2. Legal review not started

TOS, medical disclaimers, liability insurance, state health-data law, App Store health-data requirements, and the SaMD classification question. None are code-fixable. All have long lead times. Also Track 0.

### 3. Effectiveness, not safety, is the unsolved problem

v1's evaluation is unambiguous about the shape of the failure:

- Mean regime quality **never exceeded 2.58/5**
- `sessionSlotCoherence` — the morning/evening split that is the product's stated differentiator — scored **2/5 in 41 of 43 graded fixtures**
- `difficultyAppropriateness` scored 3–4, and every deterministic safety check passed
- The two worst-scoring fixtures were the injury-specific ones — the actual product premise

**The safety half worked. The usefulness half didn't.** The diagnosis on record: *"The LLM is making exercise-selection decisions with almost no domain knowledge. It's choosing exercises the way a layperson with a database would."*

`GAME_PLAN.md` M8 makes this an explicit gate rather than a backlog item. If the improvement work doesn't move the effectiveness dimensions, that is a **product-level finding** to surface to the advisor, not an engineering detail to absorb quietly.

### 4. The judge has no cross-family check

Single-provider (Gemini) means the eval judge cannot be a different model family, which is what v1 used to avoid self-flattery. Mitigations are in `TDD.md`, and the important one is: **spot-check judge scores against human judgement before trusting the M8 gate.** A floor gate against an untrustworthy judge manufactures false confidence, which is worse than no gate.

### 5. Unit economics unconfirmed

Cost per active user per week has never been modeled against the reference price. v1 swapped to a cheaper model for cost reasons *without running the calculation*. The call log carries the data. One real datapoint from v1: **$1.49 across 113 calls** in roughly two hours of heavy testing.

### 6. Exercise media licensing

The free vendor tier is demo-grade and explicitly disposable. The licensed tier is the launch-safe version. Because the data is vendored as a committed snapshot, the upgrade is a snapshot swap — but it is real money and it gates launch.

### 7. Two-person bus factor

Both founders are full-stack and pair on the work, which is good for shared context and bad for redundancy in the three areas where a silent bug is expensive: the clinical rules, the RLS policies, and the agent layer. The mitigation is the review rule in `CONTRIBUTING.md` — one drives, one reviews, on anything touching those three.

---

## Standing operational notes

### The verification gates

```
pnpm lint && pnpm typecheck && pnpm test && pnpm check:rls
```

Plus, for anything user-facing: **a real click-through on a real device.**

**Typecheck-clean is not evidence.** Every real bug in v1 was found by a human using the app — the scroll trap, the missing back buttons, the day-boundary session bug, the duplicate active regimes, the CSP auth flakiness, the invisible admin permission error. Not one was caught by inspection or by the type system.

### Things CI must never do quietly

- **Skip a test for missing credentials.** v1's cross-user RLS isolation test self-skipped when database secrets were absent. Those secrets were never added to the repo, so **CI reported green for the entire project without ever having proven isolation.**
- **Omit lint.** v1 had a lint task CI never invoked and four standing errors nobody fixed.
- **Pass an eval whose failures were excluded from the mean.** See `TDD.md`.

### Branch and review model

- `feature/<name>` → `dev` → `main`
- `main` is protected; PRs required
- One drives, one reviews on clinical rules, RLS, and agents
- **Delete feature branches after merging.** v1 accumulated ten stale branches despite having exactly this convention written down.
- **No `stage` tier.** v1 set one up and never used it; it went 49 commits stale and was dropped. Don't build process tiers you won't use.

### Documentation rules

- **ADR for any decision** that changes an interface, a dependency, or a data shape — written *before* the work.
- **This file updates in the same commit** as the work it describes.
- `DATA_MODEL.md` updates in the same commit as the migration.
- When this document and the code disagree, **the code wins** — and this document is wrong and should be fixed. v1's equivalent doc carried the right warning: *"Treat any narrative claim in it as provisional until checked against the actual code, git log, and running system."*

---

## Deferred, deliberately

Recorded so they get decided rather than rediscovered:

- **Server push notifications.** Local on-device notifications are the v1 design and they work. Server push would require pre-creating future workout-session rows, which nothing currently does.
- **Caching and connection pooling.** v1's performance work was, in its own words, "fully unstarted." Fine for now; know that it's a known zero.
- **Vector/embedding retrieval.** Skeleton retrieval is a structured filter and that's correct at this scale. If synonymy handling is wanted later, embeddings for a few thousand rows load into memory at startup. **No vector database is warranted at any point on the current roadmap.**
- **Multi-goal tracking.** The schema allows it; the product doesn't implement it.
- **Camera-based form tracking.** Out of scope entirely.
- **Web as a product surface.** Marketing only.

---

## Features abandoned in v1 — do not re-attempt without a new reason

| Feature | What it cost | Why it's here |
|---|---|---|
| **Sunset/geolocation evening scheduling** | Fully built and verified against real coordinates, then deleted two days later. Required an irreversible destructive schema change against the live database. | Complexity without payoff. **Build the boring version of scheduling.** |
| **Global swipe-to-navigate gesture** | Four native rebuild cycles at ~15 minutes each, root cause never confirmed, fully reverted. | The actual user problem — getting stuck on a screen — was solved by **a back button.** If ever revisited, start from a newer major of the gesture library, not the one that failed. |

---

## A practice worth keeping

From v1, and it paid off measurably: **draft a migration or refactor plan on a cheaper model, then review that plan against the real source on a stronger one before executing.** On the one occasion this was done, the review pass **found six real errors in the first draft, two of which would have caused genuine production bugs** — one referenced a call site that didn't exist, another missed a silent-failure risk.
