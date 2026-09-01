# 0020 — Exercise media is self-hosted, not vendor URLs

**Status:** Accepted · 2026-09-01

## Context

`DATA_MODEL.md`'s Phase C checklist leaves this open: does `Exercise.media` hold
the AscendAPI vendor's own URLs, or files re-hosted by this project?

The document already names the cost of the first option, from v1's own history:
*"the reason every v1 exercise image was silently CSP-blocked"* — vendor URLs
are a runtime CDN dependency that has to be individually allowlisted, and v1
never allowlisted the second source's host, so ~44% of exercises fell back to
images that were then blocked in production.

The rest of this project's data layer already made the opposite tradeoff for
the same reason: `exercises.json` is a **vendored, committed snapshot**, read
offline and never touched over the network at seed time, specifically so a
fresh clone or CI run is deterministic and identical everywhere. Vendor media
URLs would reintroduce exactly the runtime dependency that decision exists to
remove — just for images instead of text.

## Decision

**Self-hosted.** `fetch-catalog.ts` downloads each exercise's media during the
same vendoring pass that writes `exercises.json`, and re-hosts it in Supabase
Storage (already in this project's stack — no new vendor). `Exercise.media`
stores the resulting Storage path, not the AscendAPI URL.

## Consequences

- One more CSP entry to maintain (the Supabase Storage host), but exactly one,
  known at build time — not an unbounded set of vendor CDN hosts discovered by
  a blocked image in production.
- Re-vendoring the catalogue re-downloads media too. `fetch-catalog.ts` must be
  idempotent and skip files already present in Storage, or a refresh becomes
  slow and wasteful.
- Storage cost and quota now scale with the exercise library, not just database
  rows. Acceptable at ~30-few-hundred exercises; worth revisiting if the
  licensed catalogue is materially larger.
- Blocked on the same thing the rest of the AscendAPI work is blocked on: this
  only executes once there's a real AscendAPI key to fetch from.
