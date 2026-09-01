# 0018 — Next.js web is the only client, for now

**Status:** Accepted · 2026-09-01 · **Supersedes 0002 (mobile-first; web is marketing only)**

## Context

ADR 0002 and `GAME_PLAN.md` M10–M12 assume Expo is the product and web is
marketing. M1 was originally scoped as an Expo screen specifically to validate
Expo Go and LAN networking early — v1's worst local-setup pain point — and that
was traded away under deadline pressure. The working slice is Next.js.

The product argument for mobile is unchanged and still correct: a twice-daily
habit loop with local notifications belongs on a phone.

## Decision

Build the full loop in Next.js. Do not start Expo yet.

## Consequences

- One client to build, on the surface that already works.
- **Expo Go + LAN networking remains completely unvalidated**, and will be hit for
  the first time under feature pressure rather than demo pressure.
- Local notifications — the engagement mechanism in `PRD.md` — do not exist on
  web in the form the product assumes. Engagement design needs revisiting or the
  mobile port needs scheduling before that milestone.
- `GAME_PLAN.md` M10–M12 need rewriting against a web target.
