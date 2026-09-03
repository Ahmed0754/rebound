# 0013 — Clinical-literature retrieval corpus

**Status:** **Proposed — not decided** · raised 2026-09-01

## Context

`TDD.md` states: *"Skeleton retrieval is a structured filter, not RAG… There is
no vector database and no embedding index… **No vector database is warranted at
any point on the current roadmap.**"*

`USERFLOW.md` §1a Phase 5 introduces per-slot hybrid retrieval (BM25 + dense,
reciprocal rank fusion) over a corpus of clinical literature, with metadata
filters, a relevance floor, and a `RetrievalEvent` table.

These are narrower than they appear to conflict. *Skeleton* selection stays a
structured filter — Phase 4 is unchanged. What is new is a **second corpus**,
of published clinical guidance, which the original decision never contemplated.

## Decision

Not taken. Open questions before it can be:

1. Where does the corpus come from, and is it licensed for this use?
2. Does the justification page actually read as trustworthy? Phase E of
   `IMPLEMENTATION_TODO.md` prototypes this against hand-written provenance
   precisely so this ADR can be decided with evidence.
3. Does retrieval improve regime quality on the eval harness, or only add
   citations to the UI?

## Consequences if accepted

- A vector store and a BM25 index become infrastructure to run and back up.
- Retrieval must be additive-only: zero chunks, a timeout, or an outage degrade
  to the slot's authored rationale and never fail the job.
- `RetrievalEvent` needs an explicit RLS decision — it is job-scoped, therefore
  user-owned, therefore on the restricted path.
