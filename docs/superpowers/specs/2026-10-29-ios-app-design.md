# Spendoza for iPhone — design

Date: 2026-10-29. Status: approved direction, ready for a plan.
Mockups: [`2026-10-29-ios-app-mockups/`](2026-10-29-ios-app-mockups/) — `drilldown.png` and `tabs.png` are the approved screens; the `.html` files are the live mockups they were captured from (open in a browser; fonts load from Google Fonts).

## Why this app exists

The owner wants to check his financial health at a glance on his phone. The moment the app is for: open it (or glance at the home-screen widget), see the health score, and when it dips, see what changed, why, and what to do about it. Everything else Spendoza does on the web has to be in the app too, as real screens, but it sits behind that score-first front door.

## Goals

- **Score first.** The app opens on the monthly financial health score (0–100) as an engraved dial, with how much it moved since last month.
- **Explain every dip.** Each of the five parts of the score is tappable: it shows the rule behind the part, where the user is against it, its trend, and the spending categories that moved it. Each category is tappable down to its transactions. Every level ends with a concrete thing to do (set a budget, open a goal, ask the advisor).
- **Privacy-safe widgets.** Home-screen and lock-screen widgets show only the score, its band, and the direction it moved — never amounts, categories, merchants or account details.
- **Every existing web feature as a real screen** (inventory below), except plan selection and billing, which are deferred.
- **A distinctive, deliberate visual identity** (the theme below). The owner's words: the earlier mockups "look entirely vibe coded"; the theme is the foundation every screen is built on.

## Release target (owner's decision)

**TestFlight first**, for the owner and his household. Not a public App Store release yet, so these are out of scope for now and come with a later public release: hiding the "Plans & billing" link outside the US (linking out to web checkout is only allowed in US storefronts without Apple's external-link entitlement), an App Review demo account (sign-up is invite-only), App Store privacy labels, and store listing/screenshots.

## Non-goals (for now)

- **Plans and billing screens, and any plan-based logic in the app.** Plans aren't in effect yet. The app shows a single "Plans & billing" row that opens spendoza.io (web checkout). No in-app purchase, no plan picker, no locking or hiding features by plan in the app.
- Bank account linking (Plaid) — not built on the web either.
- iPad-specific layout, Apple Watch, Android.
- A separate iPhone backend or database.

## Anti-goals

- Anything that shows money on the lock screen, home screen or in notification text.
- Generic templated UI: identical rounded cards with grey shadows, default system blue, unthemed tab bar. If a screen looks like it could belong to any finance app, it isn't done.
- Features that exist on the web but are missing or stubbed in the app (other than plans/billing).

## Constraints and facts about the existing system

- **Backend:** the existing Express API (`https://api.spendoza.io`, test: `https://test-api.spendoza.io`) on Supabase. Auth is Supabase email/password; the API takes the Supabase access token as a Bearer token. Routes are mounted in `packages/api/src/index.ts`: `/api/auth`, `/profile`, `/categories`, `/income`, `/expenses`, `/bank-statements`, `/transactions`, `/households` (and `/household`), `/invite-codes`, `/reports`, `/dashboard`, `/goals`, `/debts`, `/advice`, `/admin`, `/billing`.
- **Plan checks still exist server-side.** `requireTier` gates `/goals` and `/debts` (starter) and `/households` (pro) **when `STRIPE_SECRET_KEY` is set**; advice has daily limits regardless. The app does not implement plan logic, but must handle a plan-related 403 gracefully: show a short "Not available on your plan yet" state with the "Plans & billing" link, never a crash or blank screen.
- **The health score** is computed per monthly report in `packages/api/src/services/health-score.service.ts` and stored in `report_data.financial_health_score` with `score`, `previous_score` and five factors, each `{ value, points, max, rating }`:

  | Part | Max | Full points when | `value` means |
  |---|---|---|---|
  | `savings_rate` | 25 | saving ≥ 20% of income | savings rate, percent (e.g. 21.06) |
  | `needs_ratio` | 20 | needs ≤ 50% of income | needs % of income |
  | `wants_ratio` | 15 | wants ≤ 30% of income | wants % of income |
  | `emergency_fund` | 20 | ≥ 6 months of expenses (15 at 3, 10 at 1) | months covered |
  | `debt_to_income` | 20 | ≤ 10% (15 ≤ 20%, 10 ≤ 36%, 5 ≤ 50%) | ratio (0–1) |

  Ratings: `good` ≥ 80% of max, `ok` ≥ 50%, `warning` ≥ 25%, else `critical`. **`savings_rate` and all `*_ratio` percentages are already percentages** (the web dashboard bug that multiplied by 100 again was fixed in #167 — don't reintroduce it).
- **Score bands for the dial** (the app's own mapping of the 0–100 total): Low 0–39 (oxblood), Fair 40–69 (amber), Good 70–100 (note green). The band name is the word shown everywhere ("Fair").
- **"What changed" data:** `GET /api/reports/personal?month=YYYY-MM-01` returns a month's report: `report_data` (`total_income`, `total_expenses`, `savings_rate`, `by_category`, `allocation` (needs/wants/savings), `debt_summary`, `financial_health_score`) and `ai_insights`. Fetch the selected month and the previous one; part deltas come from the two `financial_health_score.factors`, category deltas from the two `by_category` lists. Categories carry a `budget_class` (needs / wants / savings), which is how a part's screen knows which categories belong to it. Household equivalents: `/api/reports/household`.
- **When reports exist.** Reports are generated whenever a statement is parsed (for each month it touches), at the end of onboarding (current and previous month), and by "Refresh report" (usually the month in progress). Nothing in the repo schedules a monthly run of `/api/reports/generate-all` today. So a report for a part-finished month can appear and change at any time, and its score can "dip" only because, say, a paycheck hasn't landed yet. The app never computes a score itself.

### The check-up month (owner's decision)
- **The check-up is the last finished month.** Health, its drill-down, the widgets and the "check-up is ready" notification all use the most recent *completed* calendar month that has a report. The month menu lists completed months.
- **The month in progress is shown separately as "November so far"** — a clearly labeled, secondary view (e.g. a row under the part list on Health and a toggle in Money). It shows its partial score and spending, but never counts as a dip: no "down N" against last month, no amber highlight on parts, no notification.
- **Backend change:** add a scheduled job that generates every user's (and household's) report for the month just finished, on the 1st (exact hour is the builder's call). The "October check-up is ready" notification fires when the app first sees that report.
- **Suggestions:** use `ai_insights` from the report plus deterministic suggestions the app derives from the parts (e.g. the category with the largest increase in the part that lost the most points → "Set a $X budget for it"; emergency fund below 3 months → open/create the emergency fund goal). "Ask the advisor" on any part opens the advisor prefilled with that part. *(The "would win back about N points" estimate is a nice-to-have the builder may compute from the factor rules; omit it rather than show a wrong number.)*
- **Existing iOS practice to follow:** the owner's other SwiftUI apps (`~/dev/CharadeFam/apps/ios`, `~/dev/Hustlin`) — XcodeGen `project.yml`, fastlane, GitHub Actions for build/test/TestFlight. Spendoza's repo is a Bun/Turbo monorepo with JS packages under `packages/`.

## Decisions made

### Platform (my call, agreed in conversation)
- Native **SwiftUI**, **iOS 26 minimum** (the floating glass tab bar is the iOS 26 system design; use the system's glass/tab APIs rather than imitating them).
- Same backend and accounts as the web app; no app-specific server endpoints unless a gap is found (flag it rather than working around it).
- **Face ID / passcode lock** on open and when returning from the background (toggle in Me → Appearance & Face ID, on by default).
- **Monthly check-up notification**: "Your October check-up is ready" — no score or amounts in the text. Spendoza has no push infrastructure, so v1 uses background refresh + a local notification when a new month's report appears (my call; server push can come later).
- **Statement upload** from the Files picker and from the share sheet (share extension), PDF or CSV. *My call:* the app enforces the size the production API actually accepts — the web says 10 MB (`MAX_BANK_STATEMENT_SIZE_MB`) but the API runs as a Vercel function, which rejects request bodies over about 4.5 MB; verify the real limit early in the plan and show a clear "This file is too large (max N MB)" message. Uploading straight to Supabase Storage (signed upload URL) to lift the limit is a later backend change, not part of this app.
- Sign-in with email/password via Supabase; sign-up needs an invite code, with a "Join the waitlist" path, matching the web.
- **Onboarding** (an existing web feature, so in scope): new users go through the same steps as the web — welcome, upload a first statement (or skip), processing, review categories, then report emails on/off — and finishing calls `PUT /api/profile/onboarding`, which marks `onboarding_completed` (the web's auth guard checks it) and generates the first reports. Users who already finished onboarding on the web skip it. Until a first report exists, Health shows an empty state that leads to "Add your first statement".

### Backend changes this app needs
- **Monthly report job** on the 1st for the month just finished (owner's decision, see "The check-up month").

*My calls:*
- **Join a household with a code.** The web calls `POST /api/household/join` with `{ invite_code }` (`packages/web/src/hooks/use-household.ts`), but no such route exists — only `POST /households/:id/join`, which needs an id an outsider can't look up. So joining by code is broken on the web today. Add the code-only join endpoint (with tests); it fixes the web and serves the app.
- Anything else found missing during the build gets the same treatment: a small, tested API change through the normal PR flow, not a client-side workaround.

### Structure (owner's choice: option A, with drill-down)
Five tabs in a floating glass capsule: **Health · Money · Plan · Home · Me**.

**Health** — the engraved dial, band and change ("Fair, down 9 since September"), five tappable part rows (points, max, change), one green suggestion panel. Month can be changed to see past check-ups (my call: a month menu under the title).
→ **Part screen** (e.g. Wants): big figure ("9 of 15", "−6 since Sep"), the rule in plain words ("Full points while wants stay at or under 30% of your income. October came in at 34%."), a meter showing where the user is against the line, a five-month bar trend (current month amber), "What moved it" = its categories with this month's amount and change vs last month, then actions: primary (fix it) + "Ask the advisor".
→ **Category screen** (e.g. Dining out): the month's amount and change, "You usually spend about $X a month here" (average of prior months), five-month trend, the transactions (tap one to recategorize), "Set a $X budget".
Each part maps to its natural screens: Savings rate → income vs expenses; Needs / Wants → their categories; Emergency fund → savings goals; Debt vs income → debts and payoff.

**Money** — month selector; segmented Overview / Transactions / Bills.
- Overview: money in vs out, spending by category (the category that moved the score highlighted in amber), upcoming auto-detected bills, statements this month, floating "Add statement" button, "Refresh report", PDF export from the month menu.
- Transactions: search, filter by category/type, edit category (and the other fields the web lets you edit), household attribution where it applies.
- Bills: recurring expenses (auto-detected and manual; add, edit, delete) and income entries (add, edit, delete).
- Categories (from "Categories ›"): list, add, rename, budget class, delete.
- Statements: list with status (processing / parsed / failed with reason), upload, Retry, Remove.

**Plan** — Goals (all goal types the web supports, progress, AI goal suggestions, create/edit/delete), Debts (balances, rates, payoff projections, create/edit/delete), Advisor (chat threads, follow-ups, history, questions-left-today, prefilled questions from Health).

**Home** (household) — with a household: name, members and what each shares, household dial with its own score and drill-down (from `/api/reports/household`) **down to category totals only** — no member's individual transactions, matching the privacy policy ("They don't see your individual transactions") and the web; your own transactions stay in Money. Combined in/out, shared goals & debts, your sharing settings, invite code (show/share), remove members / hand over ownership (head only), leave; household PDF export. Without one: create a household or join with a code.

**Me** — profile (name, photo), Reports (report email on/off, day and time; PDF reports), Account (Appearance & Face ID, Invite codes (create up to 3, share), AI assistants (setup steps for Claude/ChatGPT and "Disconnect AI assistants" → `POST /api/profile/sign-out-others`), Plans & billing ↗ spendoza.io, Admin — admins only), Help (Support, Privacy — native screens with the same text as spendoza.io/support and /privacy), Sign out, Delete my account (type DELETE to confirm; `DELETE /api/profile`, handles the household-head 409 message).

**Admin** (admins only): the web admin dashboard (usage stats and trends, LLM usage/cost) and Users (search, change tier/admin/disabled flags, delete, regenerate report, re-run recurring detection, send quarterly/annual report emails) — same capabilities as `/admin` and `/admin/users` on the web.

### Theme (owner's choices: Banknote colors, Gauge dial, engraved; glass tab bar)

**Color tokens** (light):

| Token | Hex | Use |
|---|---|---|
| `paper` | `#E9EEE6` | screen background |
| `card` | `#F4F7F2` | raised surfaces, outlined panels |
| `note` | `#1E4A3B` | structure: primary buttons, the suggestion panel, active tab, "good" band |
| `ink` | `#1A2620` | text, needle |
| `soft` | `#4A5A52` | secondary text |
| `engraving` | `#9DB3A6` | hairline rules, chevrons, dial engraving |
| `amber` | `#A8701A` | "fair" band, the part/category needing attention, current-month bar |
| `oxblood` | `#8E2B2B` | "low" band, losses, destructive actions |

Accessibility note for the builder: amber and engraving on paper are below 4.5:1 for small text — use them for graphics, large text and accents; for small amber text use a darker amber that passes, and verify every text pairing meets WCAG AA. A dark-mode palette is **my call to include** (deep note-green paper, light ink, same accents tuned for contrast); derive it from these tokens and keep it in the same token set.

**Type:** Newsreader (serif) for screen titles, section titles, the score and every money amount (lining, tabular figures); Public Sans for everything else. Bundle both fonts (OFL). Support Dynamic Type; the dial and big figures scale within sensible bounds.

**Shapes and surfaces:** hairline ruled rows rather than stacks of cards; square-ish 4 pt corners on panels and buttons; one filled note-green panel per screen, reserved for the main suggestion; outlined (`card` + `engraving` border) panels for secondary explanations; monthly history bars drawn with an engraved diagonal hatch, current month solid amber.

**The dial (the one bold element):** a half-dial with the three band arcs (oxblood / amber / note green), a guilloché engraving on its face (fine rotated-ellipse line pattern, `note` at ~50% opacity), an ink-thin needle at the score, a faint dashed needle at last month's score, and the score in Newsreader at the hub with "of 100" beneath. VoiceOver reads "Health score 64 of 100, Fair, down 9 since September."

**Tab bar:** iOS 26 floating glass capsule; icons in the theme's 1.5 pt line weight (gauge, banknote, flag, house, person); the active tab in a pressed note-green lozenge; content scrolls beneath it.

**Widgets:** home screen (small) — the dial with the score at the hub and "Fair · down 9"; lock screen (circular accessory) — a ring with the score. Data shared with the widget is only the score, band, previous score and month — nothing else is written to the shared app-group container.

**Copy:** plain, specific, sentence case, active voice ("Set a dining budget", "Dining out cost you 6 points"). Errors say what happened and what to do; empty states invite the next action (e.g. no statements yet → "Add your first statement").

## Left to the builder

- Swift package/module structure, networking and caching layers, state management, offline behavior (cached last report is fine to show offline, clearly dated).
- Exact placement of secondary actions within a screen, list/detail navigation details, sheets vs pushes.
- Where the Xcode project lives in the monorepo (e.g. `apps/ios/`, mirroring CharadeFam) and CI/TestFlight setup following the owner's existing iOS repos.
- Background refresh cadence for the check-up notification.
- Icon drawing (match the mockup set; SF Symbols are fine where they fit the line weight).
- Build order — but the release target is every screen above.
