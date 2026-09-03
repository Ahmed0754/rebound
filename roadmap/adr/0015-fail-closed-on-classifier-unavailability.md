# 0015 — Fail closed when the free-text classifier is unavailable

**Status:** **Proposed — blocked on an operational dependency** · raised 2026-09-01

## Context

`USERFLOW.md` §1a Phase 2 runs two safety gates: a structured red-flag screen
(pure rules) and a free-text classifier pass that catches red flags disclosed in
prose after being answered "no" in the structured screen.

If the classifier errors or is unavailable, §1a treats the result as inconclusive
and routes to human review rather than proceeding ungated. `PRD.md` currently
implies the opposite — proceeding on the structured screen alone.

## Decision

Not taken. Failing closed is the right instinct for a health product, but it has
a dependency nobody owns: **"route to human review" requires a review queue, an
SLA, and a person watching it.** None exist.

Without them, fail-closed is a dead end that strands the user with no path
forward — worse for the user, even if safer for us.

## What must be settled first

- Build the review queue in the same milestone as the gate, **or**
- Specify the user-visible fallback: what the screen says, how long they wait,
  and what happens if nobody looks.

Do not ship the gate without one of the two.
