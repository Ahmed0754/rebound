# Rebound.ai — Design Brief

*The design problem, the constraints, and the chosen stack. For flows through these screens, see [`USERFLOW.md`](./USERFLOW.md). For product requirements, see [`PRD.md`](./PRD.md). For where design sits in the build order, see [`GAME_PLAN.md`](./GAME_PLAN.md) M12.*

> **v2 note.** Rewritten. v1's research holds up and is carried forward. What changed: this is now a **mobile-first, greenfield** design problem rather than a retrofit of 24 already-built screens — and the ordering lesson from v1 is elevated from a footnote to the organizing principle of the whole document.

---

## The one thing v1 got wrong about design

v1 built 24+ screens across two platforms before anyone chose a color. The result, measured in its own codebase: **19 distinct hex literals across 26 of 36 files on web**, with `#2563eb` — stock Tailwind `blue-600` — appearing **45 times**. Plus 17 more hexes on mobile.

Its own engineering plan named the lesson precisely:

> *"`#2563eb` is in the codebase 45 times because nobody ever chose a color, not because anyone picked blue. A design pass with nothing to apply is just rearranging boxes — define the identity first."*

**So: identity first. Then tokens. Then screens.** Nothing in M12 starts until the brand identity exists as a written, decided thing.

The corollary, also from v1: much of what looks like a "UX polish backlog" — hover states, dark-mode toggle, sticky headers, scroll progress — *is* the design pass output. Building those against undesigned hand-rolled styles is throwaway work.

---

## Goal

Give Rebound.ai a real visual identity and information architecture, defined **before** the screens are built, so the app is designed once rather than built twice.

---

## Target user & key use cases

Primary marketed audience: **athletes**, amateur through competitive. The product and every safety guardrail also fully serve general-fitness users, patients with chronic or autoimmune conditions, and elderly users. **The marketing lead is athletes; the eligibility is broader.**

The design must serve five situations well:

1. **A daily returning user** completing two short sessions and a check-in. This loop needs to feel fast and low-friction — adherence is the entire product bet. **This is the highest-priority surface.**
2. **A new user completing onboarding** without feeling like they're filling out a medical intake form.
3. **A user experiencing a safety event** (escalation rollback). This moment must read as serious and trustworthy, not glossy.
4. **A first-time visitor deciding whether to sign up** — the marketing website.
5. **An admin** reviewing flagged users or running experiments. Lowest priority, internal tooling.

---

## Brand tone

Athletic, energetic, performance-and-recovery framing — closer to how a lifestyle-fitness brand markets to a broad fitness audience than to a clinical "physical therapy" brand. This is deliberate positioning, not a claim that the guardrails are any less serious.

### Explicit exception — three screens that stay clinical

**These are never gamified, never given the accent color, never animated, regardless of brand tone elsewhere:**

1. The **crisis-resources screen** (self-harm language detected)
2. The **red-flag exit screen** ("see a doctor or PT")
3. **Escalation-rollback** "stop and consult a professional" messaging

They use a distinct, restrained subset of the palette. This override is stated here, and again in `DESIGN.md`, so it is respected without per-screen reminders.

Everywhere else — onboarding, the daily loop, progress, marketing — carries the energetic athletic tone.

---

## Constraints

- **[v2] Mobile is the product.** Design the app first and properly. Web is marketing, pricing, and legal only.
- **Dark-first.** Deep charcoal base with a single high-energy accent — the current fitness-dashboard idiom, and readable in a gym. Derive light from it, not the reverse. Build dark mode into the token *shape* even if the toggle ships later.
- **Accessibility is a baseline, not a polish item.** Text scaling (~1.3× via a large-text toggle) and a **44px minimum tap target** on every interactive element. Elderly users are an explicit audience. This must not regress.
- **Zero new native dependencies without a real reason.** Every one costs a rebuild cycle. **Expo Go until something genuinely forces a dev build.** In v1 this rule was what kept both apps lean, and breaking it cost four rebuild cycles on a feature that was ultimately reverted.
- **No social, leaderboard, or community features.** Pain and injury data sits badly next to any public comparison feature. If a social layer is ever wanted, it must be private and opt-in only.
- **Share tokens, not components.** Web and mobile share colors, spacing, type scale, and radii as data. They do not share component code. A universal cross-platform component library was evaluated in v1 and correctly rejected.

---

## Navigation structure

**Today · Progress · Plan · Account** — four bottom tabs, from the first screen built.

v1 ran **17+ screens on a bare stack navigator** and called fixing it *"the highest-impact structural fix in the codebase, and it needs no new dependency."* Expo Router's built-in tabs map directly onto these four route groups. There is no reason to defer this.

### Navigation invariants

From v1's real-device testing, where users were found **physically stuck three separate times**:

- **Every screen has a way back.** No exceptions.
- **Every terminal screen has a forward action.**
- Scroll containers use `flexGrow`, never `flex`, on content style. (A `flex: 1` content style made onboarding unscrollable in four places.)
- Safe-area insets are actually applied. (v1 shipped the dependency with zero usage and rendered under the notch.)
- **The tab bar is hidden during a guided session**, and only then.

---

## Screen inventory

### Mobile — the product

| Category | Screens |
|---|---|
| **Auth & onboarding** | Sign in / sign up, sequenced onboarding wizard, red-flag exit, crisis resources, generation wait screen, regime review & activate, notification primer |
| **Core loop** | Today, guided session player, My Plan, history & trend, exercise detail, adjustment explainer + history |
| **Engagement** | Streak detail, progress dashboard, milestones, notification settings |
| **Account** | Settings hub, profile, accessibility toggle, **risk-tier re-assessment**, billing & paywall, cancellation, regime restart, help |

**[v2] Risk-tier re-assessment is new.** v1 never built it, despite the risk tier being the only lever controlling how aggressively a regime can progress.

### Web — marketing only

Landing, How It Works, Safety & Guardrails, Pricing, About, Privacy & Terms. Plus the admin surfaces, which are operational tools rather than product.

---

## Patterns worth stealing

Researched against workout-logging apps (Strong, Hevy), wearable and recovery apps (Whoop, Oura), general fitness (MyFitnessPal, Peloton), AI-coached training (Freeletics, Nike Training Club), the closest clinical competitors (Sword Health, Hinge Health), and Duolingo's structure.

1. **Score-first home surfaces.** Whoop leads with three tiles answering "how should I train today" before anything else. Today should lead with an *answer*, not a data dump.
2. **Contextual paywalls, not upfront gates.** Duolingo surfaces its paywall at natural friction points. Freeletics' immediate double-paywall is the anti-pattern. The product logic already matches this — the paywall card only appears in settings, after the first real adjustment, never as a blocking interstitial. Protect that when real billing lands.
3. **One consolidated "today" surface.** MyFitnessPal merged diary, macros, habits, and streak into a single Today tab rather than scattering them. Today will accumulate cards — sessions, check-in, streak, adjustment explainer. Watch that it doesn't re-fragment.
4. **An engineered small win before any monetization ask.** Duolingo's first lesson; Freeletics' "building your plan." Rebound's version is regime generation plus a first completed session — and the cycling wait-screen copy is a direct implementation of the pattern. **Deliberately do not interrupt that moment** with settings or paywall noise.
5. **Primed, two-touch notification permission.** Explain the ask before the OS prompt, then re-ask once a streak exists ("protect what you've built"). v1 built only the first touch.
6. **Program-based entry points**, once there's more than one track. Not relevant at a single goal type, but worth remembering if multi-goal tracking ever ships.
7. **Session-player UX without motion tracking.** Sword Health's guided session model is the closest analog, but theirs leans on motion-tracking feedback we don't have. The substitute: **a large centered exercise GIF, a prominent countdown, unambiguous Next/Done, and minimal chrome.** The completion moment matters most — a brief animation or haptic is what drives the loop.
8. **Onboarding as a sequence of quick decisions, not a form.** Each step is **large tappable option cards**, not dropdowns and text inputs. **Reserve free-text for the final step**, where it belongs. The target is reaching the first session fast.
9. **Dark base plus electric accent.** Deep charcoal with a single high-energy accent, readable in a gym. This is why the token palette is designed dark-first.

---

## Frontend stack

**Chosen. Not to be re-litigated mid-build** — which is what happened to v1's API layer.

### Mobile — the product

| Layer | Choice | Why |
|---|---|---|
| Styling | **NativeWind v4** | Tailwind syntax for React Native, compiled at build time (~2ms startup cost). Expo-endorsed. Vocabulary parity with web makes the shared-token bridge natural without coupling the two apps. |
| Components | **gluestack-ui v3** | The shadcn-equivalent for React Native: copy-paste, unbundled, accessible, NativeWind-styled. Lightest option that still gives real accessible primitives. |
| Navigation | **Expo Router `<Tabs>`** | Built in. No new dependency. |
| Charts | **react-native-gifted-charts** | Runs on `react-native-svg`, already bundled with Expo. **Works in Expo Go, no dev build required.** Covers line (pain trend), bar (completion), rings, and contribution graph (streak calendar). |
| Animation | **react-native-reanimated** | Already in Expo's default template. Session transitions, streak celebrations, card entrances. |
| Session timer | **@docren/react-native-reanimated-timer** | Composable Reanimated countdown, directly applicable to the per-exercise timer. |
| Icons | **lucide-react-native** | One icon set across platforms. |

### Web — marketing

| Layer | Choice |
|---|---|
| Components | **shadcn/ui** (Radix + Tailwind) — copied into source, fully owned, no lock-in |
| Styling | **tailwindcss v4** |
| Icons | **lucide-react** |

### Shared

**`packages/design-tokens`** — palette, 4px-base spacing scale, type scale, radii. Exported both as Tailwind config values and as plain constants. **The shared layer is data, not components.**

### Deliberately rejected

- **Tamagui** — high compiler-setup cost, and a universal component paradigm buys less than it costs here.
- **React Native Paper** — Material defaults fight the athletic tone. You'd spend as long overriding Material as building from scratch.
- **Victory Native** — requires Skia dev builds. Violates the Expo Go constraint for capability `gifted-charts` already covers.
- **Runtime CSS-in-JS** — wrong direction for the modern Next.js App Router.
- **Framer Motion on mobile** — web-only; Reanimated covers mobile better.

---

## Implementation sequence

**Order is the whole point of this document.**

1. **Write `DESIGN.md`.** Identity, palette, typefaces, do-not list, safety-screen override. **Nothing else starts until this exists.**
2. **Build `packages/design-tokens`** from `DESIGN.md`'s values.
3. **Mobile: NativeWind + tabs.** Tabs first — highest-impact structural decision.
4. **Mobile: gluestack components.** Accessible primitives replacing anything hand-rolled.
5. **Mobile: charts.** Real pain-trend line and streak heatmap.
6. **Session-player polish.** Reanimated transitions, per-exercise countdown, the completion moment.
7. **Web marketing**, with shadcn + Tailwind against the same tokens.

> **If any screens exist before step 2** — as they will, since the core loop is built in M10 and design lands in M12 — **migrate them to tokens as a zero-visual-change refactor, while the app still looks bad.** A broken screenshot diff is then unambiguously a bug. This is v1's advice and it is correct.

---

## `DESIGN.md` — the most important file

A project-level file at the repo root that persists across every session and encodes decisions that would otherwise get silently defaulted on every screen.

**Why it matters here specifically:** without explicit anti-slop guardrails, AI-generated screens converge on the same handful of safe defaults — Inter, system fonts, purple gradients, three-column feature grids with circular icons — regardless of what any brief says. The athletic tone above is *not* a default AI aesthetic.

### Contents, each a named section

- **Brand & mission** — the positioning stated as a design directive: *"this app looks like a training tool, not a medical intake form."* With the three safety-screen exceptions called out as overrides.
- **Color palette** — 4–6 named values. Dark-first. Explicit: *"the accent color is X, not purple, not teal, not terracotta."*
- **Typography** — a display face used with restraint, a body face, a utility face for data. Explicit anti-defaults: *"do not use Inter, DM Sans, Roboto, or system-ui as the display face."*
- **Spacing & layout** — 4px base scale, radius tokens, the 44px tap-target rule.
- **Component conventions** — card structure, button hierarchy, form-field styling, and how session-player chrome differs from the rest of the app.
- **Safety-screen override** — the three clinical screens use a restrained palette subset: no accent color, no motion, no gamification.
- **Token authority** — *"the token system is defined here. Refine within these tokens; do not replace them."*

### The do-not list

Patterns that signal "AI-generated default" in this category:

- Stock three-column feature grids with circular icons
- Numbered `01 / 02 / 03` markers on non-sequential content
- Gradient overlays on text
- Hero images with a dark scrim and centered white text
- **Progress rings as the primary home-screen element** — Today leads with session cards and the pain score, not a ring

---

## Design-time tooling

Skills and project files that shape how AI-assisted screens get written. Not runtime dependencies.

| Order | What | Role |
|---|---|---|
| 1 | **Custom `DESIGN.md`** | The persistent brief. Written first, by us. |
| 2 | **Taste Skill** — `taste-skill` base + `high-end-visual-design` | Preflight discipline: infers direction from the brief, sets variance/motion/density before touching code, blocks generic defaults. |
| 3 | **`frontend-design`** (built-in) | Process discipline: brainstorm → tokens → critique → build → critique again. |
| 4 | **Vercel Web Design Guidelines** | **Post-build audit gate, not a design-time skill.** Computed contrast values, keyboard traps, unlabeled forms. Blockers only — taste opinions are ignorable. |

**Skip** the aesthetic-family variants (`brutalist-ui`, `soft-ui`, `minimalist-ui`) — activating a contradictory aesthetic alongside `DESIGN.md` produces incoherent output. **[v2]** Also skip `redesign-existing-projects`; v2 is greenfield.

**Don't install** collections of other companies' design systems. They're useful as *format* references for writing our own `DESIGN.md`, not as drop-in installs. Shipping the app looking like someone else's design system is exactly the borrowed-identity problem `DESIGN.md` exists to prevent.

---

## Screens that resist final polish

The three or four surfaces that render regime output — My Plan, regime review, the adjustment explainer — are hard to *finally* polish against unformed AI output. Design them to tolerate highly variable content length, and expect to revisit them after the regime-quality work in M8 settles what that output actually looks like.

---

## Success criteria

- The brand identity exists as a written, decided thing **before** any screen is styled.
- Every screen gets its treatment from the token system — no hardcoded color values anywhere outside `packages/design-tokens`.
- The three safety-critical screens read as unambiguously serious and are visibly distinguishable in register from the rest of the app.
- The accessibility baseline — text scaling, 44px targets — holds by construction, not by accident.
- Mobile has real tab navigation from the first screen, never a growing flat stack.
- No new native dependency was added without a deliberate, recorded decision.
- The app still runs in Expo Go.

---

## Sources

App-store listings and screenshots, product teardown sites, and Duolingo's engineering blog. Original research mapped against the v1 build; carried forward and re-framed for a mobile-first greenfield build.
