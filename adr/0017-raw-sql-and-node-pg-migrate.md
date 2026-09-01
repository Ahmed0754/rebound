# 0017 — Raw SQL with node-pg-migrate; no ORM

**Status:** Accepted · 2026-09-01 · **Supersedes 0009 (Prisma migrations from the first commit)**

## Context

Prisma was removed on 2026-09-01 when the project moved to a bare-bones approach;
the API talks to Supabase through `pg`. The data layer now needs ~15 tables,
two database roles, and an RLS policy per table. `DATA_MODEL.md` is written
assuming Prisma.

The current `db:setup` script drops and reseeds. That cannot survive a second
table containing real data, so migrations are required regardless of ORM choice.

## Decision

Hand-written SQL, with `node-pg-migrate` for versioned migrations. The existing
`exercises` table is captured as migration 0001.

## Consequences

- RLS policies, `GRANT`s, and the privileged/restricted role split are SQL-native
  and written directly rather than through an abstraction that models them poorly.
- No generated types: row shapes are hand-declared, and drift between SQL and
  TypeScript is possible. Mitigated by keeping queries in one module per entity.
- `DATA_MODEL.md`'s Prisma-flavoured examples need reading as intent, not as code.
- **Revisit trigger:** if query and mapping code starts dominating feature work,
  reconsider a typed query builder. Record that as a new ADR, not a quiet swap.
