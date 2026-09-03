# 0014 — `withSession`: a client-supplied id as the RLS subject

**Status:** Accepted · 2026-09-01 · **Supersedes 0005 (Better Auth, self-hosted) for now**

## Context

Flow A needs a subject to own `User`, `Regime`, and `RegimeGenerationJob` rows.
`TDD.md` and ADR 0005 specify Better Auth with verified sessions, where
`app.user_id` comes from a trusted source. Building that is a milestone of work
before any Flow A code can start, and `USERFLOW.md` §1a was written against a
different model.

## Decision

`withSession` reads an `X-Session-Id` header that the client mints and persists
itself, rejects a missing or malformed id with 400, opens the RLS transaction and
sets `app.user_id` to that value. Same shape as `withAuth`, different source.

Admin routes keep whatever gate is available, including an env-var secret.

## Consequences

- Flow A is unblocked immediately, with no auth build.
- **RLS still executes, but it enforces an identity the caller chose.** Anyone can
  set the header to any value and read or write that subject's rows. Job ownership
  is guessable-if-leaked rather than secret.
- Rate limiting must key on **both** the session id and IP, since clearing storage
  rotates the id trivially.
- **Removal trigger: the first real user.** Not "when we get around to auth."
  Until then, everything in the database is test data and must be treated as
  publicly readable.
