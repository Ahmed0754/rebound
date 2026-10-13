# Pages build — what changed

*Branch `onboarding-test`, 2026-10-13. Implements everything in [`PAGES_PLAN.md`](./PAGES_PLAN.md): the real frontend pages for accounts, onboarding, outcomes and plans, wired to the existing server. No server code changed.*

---

## Summary

- The old single-page "type a body part" app is gone. `/` is now just a redirect.
- Six routes now cover the full flow: `/account` → `/onboarding` → `/onboarding/[id]` → `/plans/[id]` → `/plans`.
- All API calls go through one helper in `lib/api.ts` that adds `X-User-Id` and surfaces the server's error message and status.
- The current account lives in `localStorage` and is shared through a React context mounted in the root layout.
- The temporary test bench (`app/onboarding-test/`) is deleted.
- Styling moved from inline styles into one small `globals.css`.

---

## Files changed

| File | Status | What it does now |
|---|---|---|
| `app/layout.tsx` | Modified | Imports `globals.css`, wraps every page in `CurrentUserProvider`, renders the site header. |
| `app/page.tsx` | Rewritten | Redirect only: no account → `/account`; has plans → `/plans`; no plans → `/onboarding`. The old body-part flow is removed. |
| `app/globals.css` | **New** | Shared styles: page layout, cards, buttons, choice pills, pain scale, step bar, error/notice/crisis boxes. |
| `app/account/page.tsx` | **New** | Create an account, pick an existing one, delete the current one (with confirm). |
| `app/onboarding/page.tsx` | **New** | The 4-step questionnaire. Draft kept in `sessionStorage`; submitted once at the end. |
| `app/onboarding/[id]/page.tsx` | **New** | Outcome screen: ready / see a doctor / crisis. Also builds the plan. |
| `app/plans/page.tsx` | **New** | This account's plans, newest first. |
| `app/plans/[id]/page.tsx` | **New** | One plan: view, edit doses, delete. |
| `app/onboarding-test/page.tsx` | **Deleted** | Temporary test bench, replaced by the real pages. |
| `components/ui.tsx` | **New** | Shared pieces: `Choices` (toggle buttons), `ErrorMessage`, `Loading`, `AccountError`, `BackLink`. |
| `components/site-header.tsx` | **New** | Top bar: Rebound home link, My plans, New plan, and the current account (links to `/account`). |
| `lib/api.ts` | Rewritten | One `request()` helper and an `ApiError` class carrying `status`. Added onboarding calls, `listRegions`, `getUser`. Removed the old `createRegime(muscle)`. |
| `lib/questionnaire.ts` | **New** | Option lists (copied from `apps/server/src/clinical.ts`) with plain-word labels, draft types, per-step validation, the `none` equipment rule. |
| `lib/current-user.tsx` | **New** | `CurrentUserProvider`, `useCurrentUser`, `useRequiredUser` (redirects to `/account` when no account). |
| `lib/storage.ts` | **New** | `localStorage`/`sessionStorage` wrappers that never throw. |
| `PAGES_PLAN.md` | Modified | Status line updated; build-order checklist ticked (except the manual walkthrough). |

---

## Details by area

### API layer (`lib/api.ts`)

- `request(path, { method, body, userId })` adds `Content-Type` and `X-User-Id` when needed, returns `undefined` on 204, and throws `ApiError(message, status)` on failure using the server's `error` text.
- A network failure throws `ApiError("Couldn't reach the server. Is it running?", 0)`.
- New functions: `listRegions`, `getUser`, `createOnboarding`, `getOnboarding`, `createRegimeFromOnboarding`.
- New types: `Limits`, `Screening`, `OnboardingResult` (a union of the three outcome shapes).
- `getRegimeById` now throws a 404 `ApiError` instead of returning `null`, so every call handles misses the same way.

### Accounts

- The id is stored as `rebound.userId` in `localStorage`.
- On load the id is checked with `GET /api/users/:id`. A 404 clears it and the user lands on `/account`. A network error shows a message instead of signing them out.
- Switching or deleting an account clears any half-finished questionnaire draft.
- Deleting asks for confirmation and warns that it also deletes the account's plans and questionnaires.

### Onboarding (`/onboarding`)

| Step | Asks |
|---|---|
| 1. What's going on | Region (from `GET /api/regions`), goal, onset, pain 0–10 (11 buttons) |
| 2. Safety check | 7 red flags as yes/no questions, conditions (optional) |
| 3. About you | Age, activity level, equipment, session length, aggravators (optional) |
| 4. Anything else | Optional note with a live `n/500` counter |

- Nothing is pre-selected. Every red-flag question needs an explicit yes or no before Next works, so skipping one can't silently count as "no".
- Ticking "No equipment" clears the others; ticking anything else clears "No equipment".
- The draft (`rebound.onboardingDraft`) survives a refresh and is cleared on a successful submit.
- Submit is disabled while it runs. With a note it says it can take up to 40 seconds (Gemini screening).
- On success the questionnaire id is saved as `rebound.lastOnboarding.<userId>` and the user goes to `/onboarding/{id}`.

### Outcomes (`/onboarding/[id]`)

The screen is chosen only from the server's `outcome`, never from the HTTP status.

| Outcome | Shows | Forward actions |
|---|---|---|
| `ready` | The limit reasons ("Because your pain is 7 or above."), a notice if the note couldn't be screened, **Build my plan** | Build my plan |
| `see_a_doctor` | That a plan isn't safe without a professional, the red flags answered yes, the flagged quote from the note if any | Answer again, My plans |
| `crisis` | 988, Crisis Text Line, findahelpline.com, 911. Nothing about exercise or doctors | Back to home |

Building a plan:
- Only runs from the button click, never on page load (strict mode would otherwise build two). The button is disabled while it runs.
- While waiting, status text changes every 5 seconds ("Reviewing your goals…", "Drafting your plan…").
- 201 → `/plans/{id}`. 409 → server message + "Edit my answers". 503 → "Couldn't build your plan right now" + **Try again**. 404 → "Start a new questionnaire".
- An unknown questionnaire id, or another account's, shows "We couldn't find those results".

### Plans (`/plans`, `/plans/[id]`)

- The list shows region, number of exercises, date made, and "edited" when `updatedAt ≠ createdAt`. An empty list links to the questionnaire. A link to the last questionnaire result sits below.
- The detail page shows the dose first ("3 sets × 12 reps" or "2 sets × 25s hold"), then the rationale, then the catalogue instructions under "How to do it".
- Editing changes sets and reps/seconds only. Only the field the exercise's `unit` names is sent. On a 400 the editor stays open with the server's message.
- Delete asks for confirmation, then returns to `/plans`.
- The server doesn't check plan ownership yet, so the page treats a plan with a different `userId` as "not found". This is a client-side check only, not real protection.

---

## Decisions to review

- **Past questionnaires:** kept in `localStorage` (latest one per account) instead of adding a `GET /api/onboarding` endpoint.
- **Crisis screen content:** 988 and Crisis Text Line are US services. There's a `TODO` in `app/onboarding/[id]/page.tsx`; the numbers and wording need sign-off before shipping.
- **Option lists** are still copied from the server, so they can drift. The server's 400 message would name the expected values.

---

## How it was checked

- `pnpm typecheck`, `eslint` and `next build` pass.
- A script drove the client's `lib/api.ts` and `lib/questionnaire.ts` against the running server. All of these passed:
  - Create account; duplicate username (409); bad username (400).
  - Ready outcome; a red flag gives `see_a_doctor`; a crisis note gives `crisis`.
  - Plan generation refused (409) for both see-a-doctor and crisis.
  - Another account can't read the questionnaire (404).
  - Real plan generated (about 13 seconds), edited, an out-of-range edit rejected (400), deleted; account deleted.
- The CORS preflight from `localhost:3000` allows `X-User-Id`, and all six routes load.
- **Not yet done:** clicking through every screen in a browser. Suggested run: one ready, one red-flag and one crisis questionnaire on a new account.
