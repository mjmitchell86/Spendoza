# Me and Admin — what the web does today (reference for Plan 6)

Surveyed 2026-10-30 from `packages/web`, `packages/api` and `packages/shared`. Exact copy is quoted; the app uses the same words (sentence case where the web uses title case). Paths: API = `packages/api/src`, WEB = `packages/web/src`, SH = `packages/shared/src`.

## Global

- `/api/profile`, `/api/billing`, `/api/invite-codes` use `requireAuth`; `/api/admin` uses `requireAuth` then `requireAdmin` (403 `{"error":"Admin access required"}`). Missing token → 401 `{"error":"Missing authorization header"}`, bad token → 401 `{"error":"Invalid or expired token"}`.
- Plan 403 body: `{"error":"Upgrade required","required_tier":"starter|pro","current_tier":"free|starter|pro"}`. Tiers: `free`, `starter`, `pro` (`profiles.subscription_tier`).
- Global rate limit 100 requests / 15 min per IP.

## Profile (WEB/pages/profile.tsx)

- "Profile Information": avatar (initials fallback: first letter of up to 2 words, "?" if none); tap to pick JPEG/PNG/WebP; hint "Click avatar to upload a new photo"; upload error shown inline (server text or "Upload failed"). "Display Name" field, placeholder "Your name", "Save" (disabled until changed; "Saved" for 2 s).
- "Subscription": "{Tier} Plan"; free → "Upgrade to unlock more features" + "Upgrade" (/pricing); paid → "Manage your subscription and billing" + "Manage" (/billing).
- "Notifications": switch "Weekly Email Reports", description "Receive your Spendoza financial report via email" (default on). When on: Day (Monday…Sunday, default Saturday) and Time (12 AM…11 PM, labels like "9 AM", default 9); summary "Receive your report every {Day} at {Hour} ({timezone})". Each change sends `PUT /api/profile` at once. Test environment only (API base contains "test"): "Send yourself a report email now to verify the email pipeline." + "Send Test Email" → `POST /api/emails/send-test` (200 `{"message":"Test email triggered","job_id"}`).
- "Account": Email; "Member since" like "October 29, 2026".
- "Admin" card (admins): "Usage, users and reports across Spendoza." + "Admin dashboard", "Users".
- "Danger Zone": see Delete account.
- `GET /api/profile` → profile row: `id, display_name, onboarding_completed, household_id, income_sharing_mode, shared_income_amount, expense_sharing_mode, avatar_url, timezone, email_reports_enabled, email_report_day, email_report_hour, subscription_tier, is_admin, disabled, created_at, updated_at`.
- `PUT /api/profile` (`updateProfileSchema`): `display_name` 1–100, `avatar_url`, `timezone` 1–100, `email_reports_enabled`, `email_report_day` monday…sunday, `email_report_hour` 0–23 (plus sharing fields). 400 `{"error":"Validation failed","details":[…]}`.
- `POST /api/profile/avatar`: multipart field `file`, ≤ 5 MB, JPEG/PNG/WebP → 200 profile row. Errors (400 unless noted): "File too large (max 5 MB)", "File is required", "Only JPEG, PNG, and WebP images are allowed", 500 "Upload failed" / "Failed to upload avatar". Web compresses first: longest side ≤ 512 px, JPEG quality 0.85, filename `avatar.jpg`. No remove-photo endpoint or UI.
- No timezone editor (set once at the end of onboarding); no email or password change.

## PDF reports

- `GET /api/reports/export/personal?month=YYYY-MM-01` or `?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD` (range wins) → `application/pdf`, `Content-Disposition: attachment; filename="spendoza-report-YYYY-MM.pdf"` (range: `spendoza-report-YYYY-MM-to-YYYY-MM.pdf`). 404 `{"error":"No report data available for this period"}`, 500 `{"error":"Failed to generate PDF report"}`.
- `GET /api/reports/export/household` — same, `requireHouseholdPlan("callerOrHead")`, prefix `spendoza-household-report-` (Home plan, not this one).
- Web: "Export PDF" on the dashboard for the selected period (a month, "last 3 months", this year, last year; "all time" exports the last 3 months). "Exporting...", toasts "PDF report downloaded" / "Failed to export PDF report. Please try again." (the web drops the server's 404 text).

## Invite codes (sign-up codes)

- Dialog from the header menu "Invite Codes": "Share codes with others to let them join Spendoza. You can create up to 3 codes." Empty: "No invite codes yet. Create one to share." Rows: code (monospace), badge "Available" / "Used", copy button on unused codes. Footer "{n} of 3 codes created", "Create Code" ("Creating..."), disabled at 3.
- `GET /api/invite-codes` → `[{id, code, created_by, used_by, used_at, created_at}]` newest first. `POST /api/invite-codes` (body `{}`) → 201 the code; 400 `{"error":"Maximum of 3 invite codes allowed"}` (used codes count).
- Sign-up accepts these codes or a household invitation code; codes match exactly.

## AI assistants (WEB/pages/mcp.tsx, "MCP")

- Title "Connect to AI Assistants": "Use the Model Context Protocol (MCP) to connect Spendoza to AI assistants like Claude and ChatGPT. Ask questions about your finances, manage expenses, and track goals through natural conversation."
- MCP URL `https://mcp.spendoza.io/mcp`. Tabs:
  - "Claude Desktop": 1 "Open Claude Desktop settings" (Settings → Developer → Edit Config); 2 "Add Spendoza to your config": `{"mcpServers":{"spendoza":{"url":"https://mcp.spendoza.io/mcp"}}}`; 3 "Restart Claude Desktop". "On first use, Claude will open your browser so you can log in with your Spendoza credentials. No passwords are stored in the config."
  - "Claude Code": `claude mcp add spendoza --transport http https://mcp.spendoza.io/mcp` — "Claude Code will prompt you to authenticate in your browser the first time you use a Spendoza tool."
  - "OpenAI / Other": "Add this MCP server URL to your client" — "Any MCP-compatible client can connect using this URL. The server uses OAuth 2.1 for authentication — your client will open a browser window to log in."
- "What You Can Do": Understand Your Finances — "How much did I spend last month and what were my top categories?", "Show me my income vs expenses for the last 3 months", "What does my savings rate look like?", "Give me a summary of my latest financial report", "List all my bank statement transactions from March". Ask for Advice — "Based on my spending, where can I cut back the most?", "Am I on track to meet my savings goals?", "What payoff strategy should I use for my debts - avalanche or snowball?", "How long until I pay off my credit card at this rate?", "Suggest some financial goals based on my spending patterns". Take Action — "Add a new monthly income of $5,000 from my salary starting today", "Create an expense for my $150/month gym membership", "Set a budget goal of $400/month for dining out", "Add my student loan: $25,000 at 5.5% interest, $280 minimum payment", "Delete the freelance income entry - I stopped that project".
- "Available Tools": all plans — "Dashboard, income, expenses, categories, transactions, bank statements, reports, profile"; Starter+ — "Financial goals, goal progress & suggestions, debts, debt payoff projections"; Pro — "Household dashboard, household-scoped goals & debts". (Web also shows the user's plan, hard-coded tool counts and "Upgrade required" badges.)
- "Disconnect AI Assistants": "Signs out every other session, including connected AI assistants and other devices. You stay signed in here." Button "Disconnect AI assistants" ("Disconnecting..."); toasts "AI assistants and other sessions disconnected" / "Failed to disconnect other sessions. Please try again."
- `POST /api/profile/sign-out-others` → 200 `{"signed_out_others":true}`; 401 `{"error":"Invalid or expired token"}`; 500 `{"error":"Could not sign out other sessions. Please try again."}`. Other sessions' refresh tokens stop at once; their access tokens last until expiry (~1 h). No per-client list.

## Plans & billing

- Pricing (public `/pricing`): Free $0, Starter $1.99/month, Pro $4.99/month. Billing (`/billing`): current plan + status, "Manage Subscription" (Stripe portal). The app links out to `https://www.spendoza.io/pricing` (spec non-goal: no billing screens in the app).

## Support and Privacy

- Public static pages WEB/pages/support.tsx and privacy.tsx; contact `hello@gravitaz.net` (mailto). Support sections: How it works (ordered list), If a statement fails, Report emails, Plans and billing, Households, Connecting an AI assistant, Delete your account, Get in touch; footer "Read the privacy policy." Privacy: "Privacy Policy", "Effective October 29, 2026", ~12 sections; footer "Need help with the app? See Support."

## Delete account

- Card: "Delete my account" / "Permanently delete your account and all of your data. This cannot be undone."
- Dialog "Delete your account?": "This permanently deletes your account and your data: profile, statements and transactions, income, expenses, goals, debts, reports, advice history, email settings and uploaded files, and cancels any subscription. This cannot be undone." Label "Type DELETE to confirm"; buttons "Cancel" and "Delete my account" (enabled only when the text is exactly `DELETE`; "Deleting..."). Error shown in the dialog (server text or "Failed to delete account"). Success → signed out.
- `DELETE /api/profile` body `{"confirm":"DELETE"}` → 200 `{"deleted":true}`; 409 `{"error":"You're the head of a household that has other members. Transfer household ownership to another member before deleting your account."}`; 500 `{"error":"We couldn't delete your account. Please try again, or contact support if this keeps happening."}`.

## Admin

- Dashboard (`/admin`) "Admin Dashboard" / "Platform metrics overview": cards Total Users ("{admin_users} admins"), Subscribers = starter + pro ("{free} free / {starter} starter / {pro} pro"), Transactions ("Total ingested"), Reports ("Total generated"), Emails Sent, Goals, Households. Charts (12 months): "User Signups" (line), "Activity Trends" (bars: transactions, reports, emails). "LLM Token Usage" table: Month, Call Type, Calls, Total Tokens, Avg, Min, Max, Est. Cost ("$x.xxxx" or "—").
- Users (`/admin/users`) "User Management" / "{n} total users": search "Search by name..." (display name only), tier filter "All tiers"/Free/Starter/Pro, 25 per page. Per user: tier select (immediate), Admin switch, Status "Disabled"/"Active" switch, "Refresh Report" ("Report regenerated for {name}" / "Failed to regenerate report for {name}"), "Detect Recurring" ("Recurring detection complete for {name}" / "Failed to detect recurring for {name}"), "Send Quarterly Report" ("Quarterly report sent to {name}" / "Quarterly report failed: {msg}"), "Send Annual Report" ("Annual report sent to {name}" / "Annual report failed: {msg}"), delete: "Delete User" — "This will permanently delete {display_name} ({email}) and all their data. This cannot be undone." "Cancel" / "Delete User" ("Deleting...").
- Endpoints: `GET /api/admin/stats` → `{users:{total_users,free_users,starter_users,pro_users,admin_users}, activity:{total_transactions,total_reports,total_emails_sent,total_goals,total_households}}`; `GET /api/admin/stats/trends?months=12` → `{user_trends:[{month,new_users}], activity_trends:[{month,metric,count}], llm_stats:[{month,call_type,call_count,total_tokens,avg_tokens,min_tokens,max_tokens,total_cost|null}]}`; `GET /api/admin/users?page&limit&search&tier` → `{users:[{id,display_name,email,subscription_tier,is_admin,disabled,created_at}], total, page, limit}`; `PATCH /api/admin/users/:id` `{is_admin?, subscription_tier?, disabled?}` → profile row (400 "No valid fields to update"); `DELETE /api/admin/users/:id` → `{"deleted":true}` (400 "Cannot delete your own account", 404, 409 household head); `POST …/generate-report`, `…/detect-recurring`, `…/send-quarterly-report` (default last full quarter), `…/send-annual-report` (default last year).

## Web gaps found

1. `profiles.disabled` is stored and shown but never enforced — disabled users keep full access. (Fixed in Plan 6, Task 3.)
2. The web's mobile "More" sheet has no Support, Privacy or Admin links. (Fixed in Plan 6, Task 13.)
3. The admin delete dialog never shows a failed delete (e.g. the household-head 409). (Fixed in Plan 6, Task 13.)
4. Not fixed, for the owner to decide: report emails aren't plan-gated though pricing lists them as paid; no timezone editor (report times use the timezone set at onboarding); AI disconnect is all-or-nothing (no per-client list); admin tier changes don't touch Stripe/`subscriptions`; admin quarterly/annual sends ignore unsubscribes; no waitlist management or admin-made invite codes; MCP tool counts are hard-coded on the web; the Claude Desktop config may need the `mcp-remote` bridge on some versions.
