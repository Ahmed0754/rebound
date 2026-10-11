# Pages plan — accounts, onboarding, plans

*For whoever builds the real frontend pages on the `onboarding-test` branch, and for the AI assistant they hand this to as context. The backend described here is built, tested, and running against the shared Supabase database. This document covers what the pages must do; layout and visual design are yours.*

> **Status, 2026-10-11.** Server: done (accounts, onboarding Parts 1–3). Client: only the old single-page app (`app/page.tsx`) and its API helpers (`lib/api.ts`) exist. Nothing below is built yet.

---

## Read first

- **This is Next.js 16 with React 19, and it has breaking changes.** [`AGENTS.md`](./AGENTS.md) says to read the guide in `node_modules/next/dist/docs/` before writing code. Do that before creating routes, layouts or loading states.
- **There is no authentication.** An account is a username and a server-minted uuid. Every request names its account in an `X-User-Id` header, and anyone holding an id can act as that account. Every account is a test account. Don't build password, login or session UI.
- **The API is a separate Express server on `:4000`.** The client calls it directly (`NEXT_PUBLIC_API_URL`, default `http://localhost:4000`). CORS allows the origin in `WEB_ORIGIN` (default `http://localhost:3000`) and the header `X-User-Id`.
- **The safety rules are not the client's job.** The server decides every limit, filter and outcome. The client sends answers and shows what comes back. Never compute an outcome, a limit or a dose bound in the browser. A client that shows `ready` after the server said `crisis` is the worst bug this app can have.
- **Run it:** `pnpm dev` at the repo root starts both apps. The server needs `.env` with `DATABASE_URL` and `GEMINI_API_KEY`.

---

## The flow

```
            ┌──────────────┐
            │  /account    │  pick or create an account (stores the user id)
            └──────┬───────┘
                   ▼
            ┌──────────────┐
            │ /onboarding  │  4-step questionnaire, held in client state,
            │  steps 1→4   │  submitted ONCE at the end (POST /api/onboarding)
            └──────┬───────┘
                   ▼
        ┌─────────────────────┐
        │ /onboarding/[id]    │  reads the saved result (GET /api/onboarding/:id)
        └──┬────────┬──────┬──┘
   outcome │        │      │
   crisis  ▼        ▼      ▼  ready
   ┌──────────┐ ┌────────┐ ┌───────────────────────────┐
   │ crisis   │ │ see a  │ │ limits + reasons,          │
   │ resources│ │ doctor │ │ "Build my plan" button     │
   └──────────┘ └────────┘ └────────────┬──────────────┘
                                        ▼  POST /api/regimes {onboardingId}
                              ┌───────────────────┐   409 / 503 → message + retry
                              │  generating…      │   (no plan saved)
                              └─────────┬─────────┘
                                        ▼  201
                              ┌───────────────────┐
                              │  /plans/[id]      │  view · edit doses · delete
                              └─────────┬─────────┘
                                        ▼
                              ┌───────────────────┐
                              │  /plans           │  this account's plans, newest first
                              └───────────────────┘
```

**Navigation rule, from `USERFLOW.md`:** every screen has a way back, and every terminal screen (crisis, see a doctor, an error) has a forward action. v1 shipped screens users got physically stuck on. That is a bug, not polish.

---

## Pages to build

| Route | Shows | Calls | Notes |
|---|---|---|---|
| `/` | Redirect only | — | No account → `/account`. Otherwise → `/plans` (or `/onboarding` if the account has no plans yet). |
| `/account` | Current account; pick an existing one; create one; delete the current one | `GET /api/users`, `POST /api/users`, `DELETE /api/users/:id` | Stores the chosen id. See [Accounts](#accounts). |
| `/onboarding` | The 4-step questionnaire | `GET /api/regions`, then `POST /api/onboarding` once at the end | Draft lives in client state. See [Onboarding](#onboarding). |
| `/onboarding/[id]` | The outcome of one saved questionnaire | `GET /api/onboarding/:id` | Reads from the server by id, so it survives a refresh. One page, branching on `outcome`. See [Outcomes](#outcomes). |
| `/plans` | This account's plans, newest first | `GET /api/regimes` | Empty list → link to `/onboarding`. |
| `/plans/[id]` | One plan: exercises, doses, rationales; edit and delete | `GET /api/regimes/:id`, `PUT`, `DELETE` | See [Plans](#plans). |

You choose whether the generating state is its own route or a state of `/onboarding/[id]`. Either way, read the double-submit warning under [Plans](#plans) first.

**What happens to the existing pages:**
- `app/page.tsx`, the old "type a body part" screen, becomes the redirect. Its account switcher and plan editor are worth lifting from.
- `app/onboarding-test/` (at `/onboarding-test`) is a temporary test bench that calls every endpoint below and shows the raw responses. Use it as a working reference while building, then delete the folder once the real pages cover the flow. It's not meant to ship.

---

## Accounts

**The current account is just an id the browser remembers.**
- Keep it in `localStorage` (e.g. `rebound.userId`), wrapped in `try/catch` because storage can throw or be empty.
- Expose it through a small context or hook (`useCurrentUser`) mounted in `app/layout.tsx`, so every page can read it.
- On load, confirm the id still exists with `GET /api/users/:id`. A 404 means the account was deleted: clear the stored id and send them to `/account`.
- Send it as `X-User-Id` on every call that needs it (see the table under [API contract](#api-contract)). Without it, those calls return 400 `"X-User-Id must be a user id"`.

**`/account` does three things:**
- **Create:** a username field → `POST /api/users`.
  - Rule: 3–30 characters, lowercase letters, digits and underscores. The server lowercases the name first, so "Sam" becomes "sam".
  - Show the server's 400/409 message as-is. It's more specific than anything the client would write.
  - On 201, store the returned `id`.
- **Pick:** `GET /api/users` lists *every* account, because these are test accounts. Selecting one stores its id.
- **Delete:** `DELETE /api/users/:id` → 204.
  - **This also deletes every plan and questionnaire that account owns** (the database cascades it). Confirm before doing it.
  - After deleting, clear the stored id.

There's nothing else to an account: no profile, email or settings.

---

## Onboarding

**The server takes the whole questionnaire in one request.** There's no partial save, so hold the draft in client state across the steps. `sessionStorage` is enough to survive a refresh. Every field is required except the note. Only `aggravators`, `conditions` and `redFlags` may be empty lists; `equipment` must have at least one value.

**The four steps follow `USERFLOW.md`.** Grouping and wording are yours; the values are not.

| Step | Field | Type | Allowed values (exact strings the API takes) |
|---|---|---|---|
| 1. What's going on | `region` | one | From `GET /api/regions`: `ankle`, `calf`, `elbow`, `hamstring`, `hip`, `knee`, `lower back`, `neck`, `shoulder`, `wrist`. Fetch the list; don't hard-code it. |
| | `goal` | one | `return_to_movement`, `reduce_pain`, `prevent_recurrence`, `general_mobility` |
| | `onset` | one | `acute` (under a week), `subacute` (1–6 weeks), `chronic` (longer) |
| | `painNow` | integer 0–10 | Whole numbers only. A slider or 11 buttons. |
| 2. Safety check | `redFlags` | many, may be empty | `numbness_or_weakness`, `night_pain`, `recent_trauma`, `surgery_within_6_months`, `pregnancy_related`, `chest_pain_on_exertion`, `fever_or_weight_loss` |
| | `conditions` | many, may be empty | `autoimmune`, `diabetes`, `osteoporosis` |
| 3. About you | `ageBand` | one | `under_30`, `30_49`, `50_plus` |
| | `activityLevel` | one | `sedentary`, `recreational`, `trains_regularly`, `competitive` |
| | `equipment` | many, at least one | `none`, `bands`, `dumbbells`, `full_gym` |
| | `sessionMinutes` | one, a number | `5`, `10`, `20` |
| | `aggravators` | many, may be empty | `stairs`, `overhead`, `sitting`, `impact`, `loaded_flexion` |
| 4. Anything else | `freeText` | optional string | Up to 500 characters after trimming. Blank counts as no note. Show a live counter. |

**Rules the client should enforce, so users don't hit the server's 400s:**
- **`none` is exclusive in `equipment`.** Ticking `none` clears the others, and ticking anything else clears `none`. The server would accept `["none", "bands"]`, but it's a contradictory answer.
- **No duplicates in any multi-select.** The server rejects repeats.
- **`painNow` and `sessionMinutes` are sent as numbers**, not strings.

**Wording to take care over:**
- **Red flags work best as explicit yes/no questions** ("Do you have numbness, tingling, or a limb giving way?"), not a checklist someone skims. Any "yes" means no plan, so the wording matters more here than anywhere else.
- **The note's placeholder should invite context**, e.g. "Anything else we should know?". The server screens it for things the tick-boxes missed. Don't describe that screening to the user.
- **Show raw values as plain words:** `30_49` as "30–49", `loaded_flexion` as "bending forward while lifting", and so on.

**The option lists live in `apps/server/src/clinical.ts`.** Only regions has an endpoint, so copy the other lists into one client file. If they drift, the server's 400 message names the values it expects.

**Submitting is slow, so show a waiting state.** When there's a note, the server screens it with a Gemini call before answering. That's up to 2 tries with a 20-second timeout each, so allow for **up to ~40 seconds** in the worst case. Disable the submit button while it runs. On 201, go to `/onboarding/{id}`.

---

## Outcomes

`/onboarding/[id]` loads `GET /api/onboarding/:id` and branches on `outcome`. **Always branch on `outcome`, never on the HTTP status;** all three outcomes are a 201 or 200.

| `outcome` | Screen | Must show | Must not show |
|---|---|---|---|
| `ready` | Your limits | `limits.reasons` (already user-facing sentences, e.g. "your pain is 7 or above"); a **Build my plan** button | — |
| `see_a_doctor` | See a doctor or physio | That a plan isn't safe to generate from these answers, and to see a professional. If `noteQuote` is set, the note was the reason; you may show what was flagged. | Any limits or plan button |
| `crisis` | Crisis resources | Crisis support first. `USERFLOW.md` names **988** and **Crisis Text Line**. Confirm the numbers, wording and countries covered before shipping. A way back. | Anything about exercise or doctors. **Never merge this with the see-a-doctor screen**; they're different situations. |

**`screening` comes with every outcome:**
- `not_needed`: no note was written.
- `clear`: the note was screened and nothing was found.
- `flagged`: the note led to see-a-doctor.
- `crisis`: the note led to the crisis screen.
- `unavailable`: the classifier couldn't be reached, so **the note went through unscreened**. This is deliberate (ADR 0021). The outcome is still `ready`. Show a gentle line such as "We couldn't review your note, so your plan is based on your answers." Don't block the user.

**Only the `ready` screen should show limits.** For a `ready` outcome, `limits` holds `sets`, `reps`, `hold` (seconds) and `count` as `{min, max}`, plus `difficultyCap`, `categories` and `reasons`. Limits are absent on the other outcomes.

---

## Plans

### Building one

**Trigger it from a button click, never on page load.** In development, React strict mode runs effects twice, so a POST in a mount effect builds two plans. Disable the button while the request runs.

`POST /api/regimes` with body `{"onboardingId": "<id>"}` and the `X-User-Id` header:

| Status | Meaning | What the page does |
|---|---|---|
| `201` | The plan, saved | Go to `/plans/{id}` |
| `409` | No plan from these answers. Either they need a doctor or crisis support (someone skipped the outcome screen), or too few exercises fit their answers ("only 1 exercise fit these answers…") | Show the `error` message. Offer to edit answers (a new questionnaire). |
| `503` | Gemini couldn't produce a valid plan in 2 attempts; nothing was saved (ADR 0022) | "Couldn't build your plan right now" + **Try again** |
| `404` | Unknown onboarding id, or one owned by another account | Back to `/onboarding` |

**This can take a while.** It's up to 2 Gemini calls with a 20-second timeout each, so the wait screen should have changing status copy rather than a bare spinner (`USERFLOW.md`: "Reviewing your goals… / Drafting your plan…").

### Showing one

A plan is `{ id, muscle, bodyRegion, createdAt, updatedAt, userId, regime: Item[] }`. Each item:

```ts
{
  id: string;              // catalogue slug, e.g. "Seated_Calf_Stretch"
  name: string;
  description: string;     // the catalogue's own instructions
  unit: "reps" | "hold";
  sets: number;
  reps: number | null;        // set when unit is "reps"
  holdSeconds: number | null; // set when unit is "hold"
  rationale: string | null;   // one line on why this exercise; null on older plans and after an edit
}
```

**Display rules:**
- **Show the dose by unit:** "2 sets × 10 reps" for reps, or "2 sets × 20s hold" for holds. Never assume `reps` is set; for holds it's `null`.
- **Show `rationale` when it's not null.** It's written for the user.
- **The dose overrides the description.** A description may say "hold for 10–20 seconds" while the prescribed hold is 25s; the dose is what counts. Showing the dose prominently and the description as how-to text avoids confusion.
- **Plans have no morning/evening split yet.** That was deferred until the questionnaire has a question that tells the two apart, so show one list.
- **`createdAt` vs `updatedAt`:** they differ once a plan has been edited.

### Editing and deleting

**Editing:** `PUT /api/regimes/:id` with `{"regime": [ { "id", "sets", "reps" } or { "id", "sets", "holdSeconds" }, … ] }`.
- **Send exactly one of `reps` or `holdSeconds` per item: the one its `unit` names.** The wrong one is a 400 (`"… is dosed as a hold - send holdSeconds"`).
- **Edit bounds:** sets 1–20, reps 1–100, holdSeconds 1–600, and 1–10 exercises per plan.
- **Don't send `name` or `description`.** The server ignores them and fills them in itself.
- **On 200, replace what's on screen with the response.** On 400, stay in edit mode and show the message.
- **The response's `rationale` comes back `null`** for any exercise whose dose changed, because it explained the old dose.

**Deleting:** `DELETE /api/regimes/:id` → 204. Confirm first.

**Known server gap: `GET`, `PUT` and `DELETE` on `/api/regimes/:id` don't check ownership yet.** Any id works from any account. Only reach a plan through `/plans` (which *is* scoped to the account) and don't build anything that relies on the server refusing another account's plan.

---

## API contract

Every error body is `{"error": "<message for a person>"}`. An unexpected failure is `500 {"error":"internal server error"}`.

| Method & path | `X-User-Id` | Body | Success | Errors |
|---|---|---|---|---|
| `GET /health` | — | — | `200 {ok:true}` | — |
| `GET /api/regions` | — | — | `200 string[]` | — |
| `POST /api/users` | — | `{username}` | `201 User` | `400` bad name · `409` taken |
| `GET /api/users` | — | — | `200 User[]` | — |
| `GET /api/users/:id` | — | — | `200 User` | `404` |
| `DELETE /api/users/:id` | — | — | `204` (cascades their plans and questionnaires) | `404` |
| `POST /api/onboarding` | required | answers + optional `freeText` | `201 Result` | `400` (message names the field and its allowed values) |
| `GET /api/onboarding/:id` | required | — | `200 Result + {answers, freeText}` | `400` no header · `404` (also for another account's) |
| `GET /api/onboarding/:id/candidates` | required | — | `200 {query, candidates}` | Test-bench only; don't use in real pages |
| `POST /api/regimes` | required | `{onboardingId}` | `201 Regime` | `400` · `404` · `409` · `503` |
| `GET /api/regimes` | required | — | `200 Regime[]`, newest first | `400` no header |
| `GET /api/regimes/:id` | — | — | `200 Regime` | `404` |
| `PUT /api/regimes/:id` | — | `{regime: Edit[]}` | `200 Regime` | `400` · `404` |
| `DELETE /api/regimes/:id` | — | — | `204` | `404` |

`User` = `{ id, username, createdAt }`.

`Result` takes one of three shapes:
```ts
{ id, outcome: "ready",        screening, limits }
{ id, outcome: "see_a_doctor", screening, redFlags: string[], noteCategories: string[], noteQuote: string | null }
{ id, outcome: "crisis",       screening }
```

**`lib/api.ts` needs updating:**
- `createRegime(muscle, userId?)` is the old flow, and the server now *requires* the header. Add `createOnboarding(userId, answers)`, `getOnboarding(userId, id)` and `createRegimeFromOnboarding(userId, onboardingId)`.
- Pass `userId` to `listRegimes` as before.
- The types for `Exercise` and `RegimeEdit` there already include `unit`, `holdSeconds` and `rationale`.

---

## Build order

- [ ] Read `node_modules/next/dist/docs/` on the app router, layouts, dynamic routes and loading states
- [ ] `lib/api.ts`: add the onboarding calls; one shared fetch helper that adds `X-User-Id` and throws the server's `error` message
- [ ] `useCurrentUser` context in `app/layout.tsx`; `/account` page; `/` redirect
- [ ] `lib/questionnaire.ts`: the option lists, with plain-word labels for each value
- [ ] `/onboarding`: four steps, back/next, draft kept in `sessionStorage`, the `none` rule, a 500-character counter, one submit
- [ ] `/onboarding/[id]`: three outcome screens and the `unavailable` note line
- [ ] Build-my-plan button, wait state, and 409/503/404 handling
- [ ] `/plans` list and `/plans/[id]` view/edit/delete, with reps vs holds
- [ ] Walk every screen and check it has a way back, and every dead end a way forward
- [ ] Delete the old body-part flow from `app/page.tsx` once `/` redirects
- [ ] Delete `app/onboarding-test/` once the real pages cover everything it does

## Open questions

- **Finding an account's questionnaires:** there's no "my questionnaires" endpoint. `/onboarding/[id]` works because the id is in the URL, but nothing lists past questionnaires. Either keep the latest id in `localStorage`, or ask for `GET /api/onboarding` scoped to the account (a small server change).
- **Option lists from the server:** a `GET /api/onboarding/options` endpoint would stop the client copy from drifting. It isn't built.
- **Crisis screen content:** which numbers and services, for which countries, and who signs off on the wording.
- **Retaking the questionnaire:** each submit creates a new questionnaire; old ones and their plans stay. Decide whether the UI treats the newest as current.
