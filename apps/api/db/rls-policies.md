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
| `users` | RLS enabled · owner-only, keyed on `id` | User-owned. `rebound_restricted` may only read/write the row matching `app.user_id`. |
| `regimes` | RLS enabled · owner-only, keyed on `user_id` | User-owned. |
| `regime_exercises` | RLS enabled · owner-only via `EXISTS` on `regimes` | Child of `regimes`; no `user_id` column of its own. |
| `workout_sessions` | RLS enabled · owner-only, keyed on `user_id` | User-owned. |
| `workout_session_exercises` | RLS enabled · owner-only via `EXISTS` on `workout_sessions` | Child of `workout_sessions`; no `user_id` column of its own. |
| `session_logs` | RLS enabled · owner-only, keyed on `user_id` | User-owned. |
| `adjustment_events` | RLS enabled · owner-only, keyed on `user_id` | User-owned. |
| `regime_generation_jobs` | RLS enabled · owner-only, keyed on `user_id` | User-owned. |
| `presets` | RLS enabled · public read, no write policy | Shared library content — hand-authored skeletons and fallbacks. |
| `preset_exercises` | RLS enabled · public read, no write policy | Shared library content. |
| `preset_slots` | RLS enabled · public read, no write policy | Shared library content. |
| `llm_calls` | RLS enabled · zero policies, default deny | System table. Not readable or writable by `rebound_restricted`; only the owning/migration role can touch it. |
| `rate_limits` | RLS enabled · zero policies, default deny | System table. Same as `llm_calls`. |
