# Spendoza for iPhone — roadmap

Spec: [`../specs/2026-10-29-ios-app-design.md`](../specs/2026-10-29-ios-app-design.md)

The spec covers independent subsystems, so it is built as a sequence of plans. Each produces working, tested software on its own and ends merged (and, for app plans, on TestFlight). Plans 3–6 are written after Plan 2 lands, because they build on the exact types and services Plan 2 creates.

| # | Plan | Delivers | Status |
|---|---|---|---|
| 1 | [Backend for the app](2026-10-29-ios-backend.md) | Join a household by code (fixes the web too); monthly report job on the 1st | written |
| 2 | [App foundation and Health](2026-10-29-ios-foundation-health.md) | Xcode project, theme, sign-in / sign-up / waitlist, Face ID lock, onboarding, Health tab with the full drill-down, widgets, check-up notification, minimal Me (Face ID, sign out), CI and TestFlight | written |
| 3 | Money | Overview, Transactions, Bills (expenses and income), Categories, Statements (upload / retry / remove) and the share extension, PDF export, "so far" toggle | after Plan 2 |
| 4 | Plan | Goals (all types, suggestions), Debts (payoff projections), Advisor (threads, follow-ups, history, daily limit); turns on "Ask the advisor" and the Debt part's actions on Health | after Plan 2 |
| 5 | Home | Household create / join by code, members and sharing, household dial and drill-down to category totals, shared goals and debts, ownership, household PDF | after Plans 1–2 |
| 6 | Me and Admin | Profile and photo, report emails, PDF reports, invite codes, AI assistants (setup + disconnect), Plans & billing link, Support and Privacy, delete account, Admin dashboard and users | after Plan 2 |

Plan 1 has no dependency on the app and can ship first. Tabs appear in the app only once their plan lands, so intermediate TestFlight builds never show placeholder screens.
