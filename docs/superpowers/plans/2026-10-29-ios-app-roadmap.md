# Spendoza for iPhone — roadmap

Spec: [`../specs/2026-10-29-ios-app-design.md`](../specs/2026-10-29-ios-app-design.md)

The spec covers independent subsystems, so it is built as a sequence of plans. Each produces working, tested software on its own and ends merged (and, for app plans, on TestFlight). Plans 3–6 are written after Plan 2 lands, because they build on the exact types and services Plan 2 creates.

| # | Plan | Delivers | Status |
|---|---|---|---|
| 1 | [Backend for the app](2026-10-29-ios-backend.md) | Join a household by code (fixes the web too); monthly report job on the 1st | written |
| 2 | [App foundation and Health](2026-10-29-ios-foundation-health.md) | Xcode project, theme, sign-in / sign-up / waitlist, Face ID lock, onboarding, Health tab with the full drill-down, widgets, check-up notification, minimal Me (Face ID, sign out), CI and TestFlight | written |
| 3 | [Money](2026-11-01-ios-money.md) | Overview, Transactions, Bills (expenses and income), Categories, Statements (upload / retry / remove), opening statements from the share sheet, PDF export, "so far" month; category rename/delete, shared-income edit and refresh-month API fixes | shipped 2026-11-02 |
| 4 | Plan | Goals (all types, suggestions), Debts (payoff projections), Advisor (threads, follow-ups, history, daily limit); turns on "Ask the advisor" and the Debt part's actions on Health | after Plan 2 |
| 5a | [Household management and invite codes](2026-10-29-household-management.md) | API + web now (rotate code, rename, delete, invitations that arrive, accept/decline, remove-member fix); app Home tab: create / join / invitations / members / sharing / code / ownership / leave | shipped 2026-11-01 (API + web, and the app's Home tab: PRs #198, #200) |
| 5b | Home — household numbers | Household dial and drill-down to category totals, shared goals and debts, household PDF | after Plans 2 and 5a |
| 6 | [Me and Admin](2026-10-30-ios-me-admin.md) | Profile and photo, report emails, PDF reports, invite codes, AI assistants (setup + disconnect), Plans & billing link, Support and Privacy, delete account, Admin dashboard and users; refuse disabled accounts; web menu and admin-delete fixes | shipped 2026-10-30 (moved ahead of 3–5b at the owner's request) |

Plan 1 has no dependency on the app and can ship first.

**Feature parity (owner, 2026-10-29):** every feature ships to the web and the app together. New web features get their app tasks in the same plan; plans 3–6 also list any web gaps they find. Tabs appear in the app only once their plan lands, so intermediate TestFlight builds never show placeholder screens.

**Web gaps found by Plan 3 (Money):** the web has no category filter on its transactions list (the app has one; still open). Fixed on the web in the same branch: a failed expense (or income) delete now shows the server's message instead of looking like it worked; Delete on an income entry shows only for its owner, and someone an entry is attributed to sees who it is attributed to read-only (the API now refuses an attribution change from them with 403, and a delete that matches nothing with 404).

**MCP gap found by Plan 3 (Money):** the MCP server has no tools to create, rename or delete categories (the web and the app both can). An MCP follow-up adds them, keeping the API's rules: system defaults can't be renamed, reclassified or deleted.
