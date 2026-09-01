# Exercise catalogue ingest runbook

*Written once, per `IMPLEMENTATION_TODO.md` Phase C ("a single documented ingest
runbook. v1's correct order existed only as tribal knowledge"). This is the
order of operations — it is not a substitute for `fetch-catalog.ts` itself,
which does not exist yet. See "What's actually blocked" below for why.*

## Order

1. **Confirm AscendAPI access.** Track 0 has an open item — "Confirm AscendAPI
   licence terms and price" — that has not been resolved. Do this first; there
   is no point writing a fetch script against terms nobody has confirmed.
2. **`fetch-catalog.ts` fetches the full catalogue and re-hosts media.**
   - Paginate at 25 records per request, ~2s delay between pages. The free
     tier sits behind a Cloudflare burst limiter tighter than its documented
     1,000 req/hr — v1 lost two scripting attempts to it.
   - Handle 429/503 with backoff. Never fan out per-exercise — v1's instinct
     to parallelize per-record is exactly what trips the burst limiter.
   - For each exercise's media, download it and upload to Supabase Storage
     per ADR 0020, then store the resulting Storage path — not the AscendAPI
     URL — on the row.
   - Idempotent: re-running it should skip media already present in Storage,
     or a routine refresh becomes slow and wasteful.
3. **Diff the real response against `DATA_MODEL.md`'s Exercise table** before
   writing anything else against it. `DATA_MODEL.md` describes a *target*
   shape; the live API may not match it field-for-field. This step exists
   specifically to catch that before code is built on an assumption.
4. **Write `data/exercises.json`** — the vendored, committed snapshot. From
   here on, nothing at seed time touches the network.
5. **`movementPattern` enrichment** — batch LLM classification with a
   stronger model than the one used for regime generation, exact-id
   echo-back so a response can't silently drift onto the wrong row, then a
   human spot-check of 50–100 rows before trusting the rest.
6. **`progressionGroup` enrichment** — same shape as above, deterministic
   where possible.
7. **Seed order from here matches `DATA_MODEL.md`'s "Operational notes"**:
   `seed` (exercises from the vendored snapshot) → `seed:presets` →
   `seed:skeletons` → `seed:fixtures`. None of the preset/skeleton/fixture
   seed scripts exist yet either — they depend on Phase D's authored content.

## What's actually blocked, and on what

Everything above step 1 is unblocked. Steps 2 onward need a real AscendAPI
key, which needs step 1 resolved first. Concretely, still open:

- **AscendAPI licence terms and price are unconfirmed** (Track 0). The
  "$500–600 one-time, self-hosted" figure in `GAME_PLAN.md` needs verifying,
  including whether it permits committing the dataset to a private repo.
- **`fetch-catalog.ts` does not exist.** Writing it needs AscendAPI's actual
  API docs — endpoint paths, auth scheme, response shape — none of which are
  in this repo. A script written against guessed specifics would look done
  without being tested against anything real; that is worse than the gap
  being visible.
- **`data/exercises.json` cannot be vendored** without step 2 having run
  against real data.
- **Enrichment (steps 5–6) cannot start** without step 4's data existing.

The schema is ready to receive this data the moment it exists — see migration
`1756832400000_exercise-ascendapi-shape` — so none of the above blocks the
data-layer work already done; it only blocks populating it with anything but
the 30 hand-written mock rows currently seeded.
