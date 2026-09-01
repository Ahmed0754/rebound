# RLS decisions

**Every table in the `public` schema needs an explicit decision recorded here, or
`pnpm --filter @rebound/api run check:rls` fails the build.**

This file is the allowlist that check:rls reads. Adding a table without adding a
row here is the failure mode it exists to catch: v1 fixed seven publicly-readable
tables, then **one regressed to no-RLS and went undetected until a later audit**.
Vigilance failed; a parser didn't.

"RLS off" is never a valid decision for a table in `public`. Supabase serves that
schema over PostgREST, so RLS-disabled means readable with the project's anon key
regardless of application code. Shared-library tables get RLS *enabled* with a
permissive read-only policy.

| Table | Decision | Rationale |
|---|---|---|
| `exercises` | RLS enabled · public read, no write policy | Shared library content. Not user-owned. Readable by anyone; writes only via the owning role, which bypasses RLS. |
| `pgmigrations` | Exempt — tooling | Created and owned by node-pg-migrate. Never exposed; not application data. |
