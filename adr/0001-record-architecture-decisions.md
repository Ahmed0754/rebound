# 0001 — Record architecture decisions

**Status:** Accepted · 2026-09-01

## Context

v1's decisions were real and mostly good, but they lived in a 171KB session log
and in people's heads. When a colleague suggested REST would serve the project
better than tRPC, there was no record of why tRPC had been chosen — so the choice
was re-litigated from scratch and the entire API layer was rewritten eight days
into an eight-week build.

## Decision

Every decision that changes an interface, a dependency, or a data shape gets an
ADR in this directory, written *before* the work.

Format: Context, Decision, Consequences. Status is one of Proposed, Accepted,
Superseded by NNNN. Numbering is sequential and never reused. An ADR is fifteen
lines; the habit matters more than the polish.

When a decision is reversed, write a new ADR that supersedes the old one. Do not
edit the original to say something different — the reasoning that was overturned
is the part worth keeping.

## Consequences

- A reader can reconstruct why the system is shaped the way it is.
- Reversals become deliberate and argued rather than accidental.
- Some ADRs will record decisions that were later wrong. That is the point.
