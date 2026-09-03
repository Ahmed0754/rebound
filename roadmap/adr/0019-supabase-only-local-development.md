# 0019 — Local development runs against hosted Supabase

**Status:** Accepted · 2026-09-01 · **Supersedes 0004 (Docker Compose for local development)**

## Context

Docker was removed on 2026-09-01. ADR 0004 and `TDD.md` require that
`docker compose up` yield a complete working stack with no external accounts,
because v1 could not be run locally at all — it needed a live database, live
auth, and live model keys before anything would start, and `TDD.md` calls that
"the single worst part of the v1 codebase for onboarding a second person."

## Decision

Accept the hosted dependency. A clean clone requires a Supabase project and a
Gemini API key before it runs.

## Consequences

- **This knowingly reintroduces the exact v1 condition ADR 0004 existed to
  prevent.** It is accepted because setup work is not worth it at current scale,
  not because the original reasoning was wrong.
- The second developer will hit it. `CONTRIBUTING.md` must make the prerequisites
  and the failure modes explicit rather than assuming they are obvious.
- Both developers currently share one database. There is no isolation: a
  destructive migration or a reseed affects the other person's work.
- **Revisit trigger:** the first time shared-database interference costs an hour,
  or the first outside contributor.
