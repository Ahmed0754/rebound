# 0016 — Showing sourced clinical justification in the UI

**Status:** **Proposed — gated on legal review** · raised 2026-09-01

## Context

`USERFLOW.md` §1a Phase 10 specifies a preview page with four layers of
justification: regime-level and slot-level text authored by a human, an
exercise-level template filled from structured fields, and a dosage-level
explanation showing the tier ceiling as a visible constraint. Cited blocks carry
source, year, and evidence grade.

**The moment the screen shows a citation it stops being a suggestion and starts
being a clinical claim.**

## Decision

Not taken. This is a legal question before it is a design question, and Track 0's
digital-health counsel is already reviewing the SaMD classification. Sourced
clinical justification moves the product materially closer to that line.

## Design constraints that hold regardless, if it ships

- The defensible claim is *"this exercise satisfies a slot that a cited protocol
  calls for."* The indefensible one is *"this exercise treats your shoulder."*
- Model-written selection notes are labelled as AI selection among eligible
  options, visually distinct from cited protocol text.
- Evidence grade is visible. Grade F is expert opinion and must not look like
  grade A.
- **No fabrication, structurally.** The component takes provenance as a required
  prop and renders an un-cited variant when chunks are absent, so the
  citation-shaped-sentence-without-a-source path does not exist in code.
- The disclaimer uses the safety-serious register, not the athletic one.
