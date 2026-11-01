# Money tab inventory: web, API, recurring detection, and existing iOS code

Paths are relative to `/Users/matt/dev/Spendoza/.claude/worktrees/spendoza-support-privacy`. Web files are under `packages/web/src` (abbreviated W/), API files under `packages/api/src` (A/), shared files under `packages/shared/src` (S/). Strings are quoted verbatim.

## 0. Findings that change the plan

1. **The web has no "statements this month" section.** The dashboard only shows a processing banner (`W/pages/dashboard.tsx:217-232`). That section is iOS-spec-only, so its copy has no web wording to match.
2. **The web "Assign To" for a single transaction is probably broken.**
   - `W/hooks/use-bank-statements.ts:100-118` sends `{attributed_to_user_id}` to `PUT /transactions/:id`.
   - `updateTransactionSchema` (S/schemas/transaction.ts:12-17) has no such field, and Zod strips unknown keys, so it is a silent no-op.
   - The working endpoints are `PUT /transactions/:id/attribute` and `POST /transactions/bulk-attribute`. iOS should use those.
3. **Attribution exists only inside a statement's transaction review, and only when `is_shared_account` is true.**
   - The main Transactions page and the Expenses/Income pages have no attribution UI.
   - The household "Assign To" list comes from `GET /api/household` members.
4. **Rate limit.**
   - `/api` allows 100 requests per 15 minutes per IP (A/index.ts:66-71), returning express-rate-limit's default 429.
   - The web polls statements every 3 s while any is `uploaded` or `processing` (`use-bank-statements.ts:14-21`). iOS onboarding does the same, so a Money tab that also polls can hit the limit.
5. **"Refresh Report" is not month-aware.**
   - `POST /reports/generate` regenerates the report for the month of the user's latest transaction, not the selected month.
   - It is limited to 2 per rolling 24 h, in production only.
6. **The dashboard endpoint never returns `financial_health_score` or `allocation`.**
   - `dashboard.service.ts` never sets them, so the web health card is effectively dead on `/dashboard/personal`.
   - Health data comes from `/reports/personal` → `report_data`.
7. **Category rename and delete have gaps.**
   - `transactions.ai_category` is free text keyed by name. Renaming a category does not update transactions, so they keep the old name and lose their budget class.
   - Deleting a category: `expenses.category_id` is a FK with no `ON DELETE` (initial_schema.sql:88). Deleting a category that expenses use will likely fail with a 400 FK error message, not "become uncategorized" as the web dialog claims.
   - There is no unique constraint on category names.
   - Reports are marked stale on category insert, update or delete (migration 20261031120000).
8. **Editing is wider on the server than on the web.**
   - Web hides Edit and Delete for `is_system_default` categories, but `PUT /categories/:id` has no system check.
   - Only `DELETE` rejects system defaults.
9. **Validation errors are generic on the web.** The API returns `{error:"Validation failed", details:[zod errors]}` with status 400, so the web shows only "Validation failed". Use `details` for field-level messages on iOS if you want better copy.

## 1. Web UI

All amounts use `Intl.NumberFormat("en-US", currency USD)`: whole dollars on the dashboard and summary cards, cents in tables.

### 1a. Time period (shared by Dashboard, Transactions, Expenses, Income)

`W/components/filters/time-period-filter.tsx`, `W/contexts/time-period-context.tsx`

- Presets, in order (filter.tsx:23-30): "This Month", "Last Month", "Last 3 Months", "This Year", "Last Year", "All Time". The last option is "Specific Month" (:86), which shows a native `<input type="month">`.
- Period state lives in the URL query `?period=`. Valid values are the preset keys (`this_month`, `last_month`, `last_3_months`, `this_year`, `last_year`, `all_time`) or `month:YYYY-MM`. Default is `this_month`. `isExplicit` means the param is present.
- `getDateRange` (:113-171) turns a period into `from_date` and `to_date`:
  - `this_month`: first to last day of the current month.
  - `last_month`: the previous month.
  - `last_3_months`: first of (month − 3) through the last day of the current month (four calendar months).
  - `this_year`: Jan 1 to Dec 31.
  - `last_year`: the same for the previous year.
  - `all_time`: `2000-01-01` to `{currentYear}-12-31`.
  - `month:YYYY-MM`: that month's first to last day.
- `getMonthParam` (:177-196) returns `YYYY-MM-01` only for `this_month`, `last_month` and `month:*`. It returns undefined otherwise.
- Header subtitle (`formatPeriodLabel`, dashboard.tsx:44-76):
  - Month periods: "October 2026".
  - Last 3 months: "July 2026 – October 2026".
  - Year periods: "2026".
  - All time: "All Time".

### 1b. Dashboard (`W/pages/dashboard.tsx`)

**Header and actions**
- Title "Dashboard". Subtitle is the period label.
- Controls: TimePeriodFilter, "Refresh Report" (:193, pending text "Generating..."), "Export PDF" (:211, pending text "Exporting...").
- "Refresh Report" is disabled while pending or when `has_transactions === false`. The tooltip then says "No transactions for this period".
- Export PDF:
  - For `all_time` it exports `last_3_months` as a range, then switches the period to Last 3 Months.
  - Otherwise it exports `data.month ?? month`.

**Loading and error**
- A spinner while loading.
- Error shows `error.message` or "Failed to load dashboard", with a "Retry" button.

**Auto-switch (:114-126)**
- If the user has not picked a period, the data has `has_transactions === false`, and `latest_transaction_month` is set, the period switches to `month:{latest YYYY-MM}`.

**Processing banner (:217-232)**
- Shown when any statement is `processing` or `uploaded`.
- Text: "{n} statement(s)" followed by "currently processing. Dashboard will update once complete."
- The dashboard refetches when the processing count drops.

**Summary cards (:235-289)**

| Card | Value | Extra |
|---|---|---|
| "Total Income" | `summary.total_income` | trend badge `trends.income_change` |
| "Total Expenses" | `summary.total_expenses` | trend badge `trends.expense_change` |
| "Savings Rate" | `formatSavingsRate(rate)` | see below |
| "Net" | `summary.net` | caption |

- Trend badge: arrow plus `abs(value).toFixed(1)%`. Green when ≥ 0, rose when negative.
- Savings Rate card (`components/dashboard/savings-rate-card.tsx:63-94`):
  - `savings_rate` is already a percentage.
  - Tier colours come from `lib/savings-rate.ts`: good, fair, poor.
  - A mini arc is drawn, and an `overspendNote(rate)` line appears if the rate is negative.
  - Footer line is "Net: $X".
- Net caption: "This month" when the period is `this_month`, otherwise the period label.

**Health score and allocation** (:292-306): only when `financial_health_score` is present and the report is not empty. See finding 6.

**Charts row**
- "Income vs Expenses" (`income-vs-expenses-chart.tsx`): a two-bar chart, "Income" (green) and "Expenses" (rose), with value labels.
- "Spending by Category" (`spending-by-category-chart.tsx`):
  - Donut chart with centre label "Total" and a legend of colour dot, category, `$amount`, `{pct}%`.
  - The percentage is computed against the chart total: `amount/total*100`, `toFixed(0)`.
  - Empty state: "No category data available".
  - Palette: `#3b82f6 #10b981 #f59e0b #f43f5e #8b5cf6 #ec4899 #06b6d4 #f97316 #14b8a6 #a855f7`.

**Bottom row**
- "Top Expenses" (`top-expenses-list.tsx`):
  - Categories sorted by amount, descending, with bars scaled to the max.
  - Each row shows `$amount (pct%)`.
  - Empty state: "No expense data available".
- "Upcoming Bills" (`upcoming-bills-list.tsx`, see section 3).
- Insights card (`ai-insights-card.tsx`):
  - Title "Insights".
  - Subtitle "Latest available — {Month YYYY}" when `insights_month` is set.
  - Bullets come from `ai_insights` split on newlines, with leading `•`, `-` or `*` stripped.
  - Empty state: "No insights available yet. Generate a report to get personalized financial insights."
  - On `all_time`, the card is hidden if `insights_month` is older than 3 months.

### 1c. Transactions page (`W/pages/transactions.tsx`, `components/transactions/transaction-table.tsx`)

**Header and filters**
- Title "Transactions". Subtitle "All transactions from your bank statements".
- Filters: TimePeriodFilter, a search input (placeholder "Search descriptions...", client-side, case-insensitive substring on `description`), and a type select.
- Type select options: "All Types", "Credits", "Debits". The value is sent to the API as `type=credit|debit`.
- Card title is "Transactions ({n})". The count is the filtered count and is shown only when n > 0.
- There is no category filter on this page. The category filter exists on Expenses and Income (see 1e).
- Loading shows a spinner. Error shows `error.message` or "Failed to load transactions", with "Retry".
- Empty state: "No transactions found."

**Columns**: "Date" (`MMM d, yyyy`), "Description", "Amount", "Category", "Debt" (only if the user has credit-card debts), "Type".
- Amount: prefix "+" for credit (green) or "-" for debit (red).
- Type: a badge showing the raw `credit` or `debit`.
- Sort is server-side `date desc` and there is no client sort.
- There is no pagination.

**Editable fields**
- **Category**: a select with "Uncategorized" (sent as `ai_category: null`) plus every category's `name`. Value is the name string, not the id. Fired on change, with no toast and no error handling.
- **Debt** (debits only): a select with "None" plus credit-card debts. Choosing a debt opens a dialog:
  - Title "Link to {debtName}".
  - Body "This transaction will be linked as a payment for **{debtName}**."
  - Switch "Update current balance".
  - When on, field "New balance (currently $X)" (number, step 0.01, min 0, placeholder "0.00").
  - Buttons "Cancel" and "Link Payment" (pending: "Linking...").
  - Choosing "None" unlinks immediately.
  - Endpoint is `POST /debts/link-transaction`, gated by `requireTier("starter")`.
- Description, amount, date, type and attribution are not editable here.

### 1d. Expenses page (`W/pages/expenses.tsx`, `components/expenses/expense-list.tsx`, `expense-form.tsx`)

**Page chrome**
- Title "Expenses". Subtitle is the period label, or "Track and manage your expenses".
- Button "Add Expense".
- Summary cards (computed client-side from debit transactions in the period, only if there are any):
  - "Total Expenses" with "{n} transaction(s)".
  - "Avg Transaction" with "Per debit".
  - "Categories" with "Active categories".
  - "Top Category" with "{pct}% of total".
- Filter bar:
  - TimePeriodFilter.
  - Search input, placeholder "Search merchants...".
  - Category select: "All Categories", "Uncategorized", and the distinct categories seen in the period.
  - "Clear filters" button.
- Charts: "By Category" donut with "Total" in the centre, and "Top Merchants" (top 7 by description sum, tooltip label "Amount").
- If the period is `this_month` with no debits and the user has not picked a period, it auto-switches to `last_month`.
- Bottom card "Bank Transactions ({n})" reuses TransactionTable without the Type column.

**Recurring Expenses card**
- Title "Recurring Expenses". This list shows ALL expenses, including one-time ones.
- Filters: category select ("All Categories" plus all categories) and type select ("All Types", "One-time", "Recurring").
- Columns: "Description", "Amount", "Category", "Frequency", "Due Date", "Actions" (Edit and Delete icons; sr-only labels "Edit", "Delete").
- Description cell:
  - Shows `friendly_name || description`.
  - Shows the raw description beneath when a friendly name exists.
  - Shows badges "AI Adjusted" (`is_ai_adjusted`) and "Auto-detected" (`auto_detected`).
- Amount cell: when `is_ai_adjusted` and `original_amount` is set, it shows the original struck through above the current amount.
- Category cell: the name looked up by `category_id`, or "Unknown".
- Frequency cell: the interval label (Weekly, Biweekly, Monthly, Quarterly, Annually) or "One-time".
- Empty states: "No expenses yet." with "Add your first expense to get started." when there are none, or "No expenses match your filters." when filters hide everything.
- Loading shows a spinner. Error shows "Failed to load expenses" with "Retry".

**Expense dialog** (`expense-form.tsx`)
- Title: "Edit Expense" or "Add Expense".
- Fields:

| Field | Details |
|---|---|
| "Description" | required, placeholder "e.g. Rent, Netflix" |
| "Friendly Name (optional)" | placeholder "e.g. Netflix, Gym Membership"; helper "A short display name shown instead of the raw description" |
| "Amount" | number, step 0.01, min 0.01, placeholder "0.00", required |
| "Category" | select, placeholder "Select category", sends `category_id` |
| "Type" | "One-time" or "Recurring" |
| "Recurrence Interval" | shown only if recurring; Weekly, Biweekly, Monthly, Quarterly, Annually; default Monthly |
| "Next Due Date" | date, required, default today |
| "End Date (optional)" | date |

- Buttons: "Cancel", and "Add Expense" / "Update" (pending: "Saving...").
- Errors: an inline red box with `err.message`, or "Failed to save expense".
- Validation is only the browser's `required`/`min`. The category is not marked required in the UI, so an empty `category_id` gives a server 400 "Validation failed".
- On submit: `recurrence_interval` is set only when the type is recurring, otherwise null. `friendly_name` and `end_date` are null when empty.

**Delete dialog** (`expense-list.tsx:226-253`)
- Title "Delete Expense".
- Body: `Are you sure you want to delete “{friendly_name || description}”? This action cannot be undone.`
- Buttons "Cancel" and "Delete" (pending: "Deleting...").
- A failed delete is swallowed silently.

### 1e. Income page (`W/pages/income.tsx`, `components/income/income-list.tsx`, `income-form.tsx`)

**Page chrome**
- Title "Income". Subtitle is the period label, or "Manage your income sources".
- Button "Add Income".
- Summary cards from credit transactions:
  - "Total Income" with "{n} deposit(s)".
  - "Avg Deposit" with "Per credit".
  - "Categories" with "Active categories".
  - "Top Source" (shows the top category name) with "{pct}% of total".
- Search placeholder "Search sources...". Category select and "Clear filters" as on Expenses.
- Charts: "By Category" and "Top Sources".
- Same auto-switch to `last_month` as Expenses.
- Bottom card "Bank Transactions ({n})".

**Recurring Income card**
- Title "Recurring Income". Columns: "Source", "Amount", "Frequency", "Effective Date", "Actions".
- Source cell:
  - Shows `friendly_name || source_name`, with the raw name beneath when a friendly name exists.
  - Badges: "Auto-detected", "AI Suggested" (`is_ai_suggested`), and the attributed member name or custom name.
- Frequency labels: "One-time", "Weekly", "Biweekly", "Monthly", "Annually".
- Empty state: "No income entries yet." with "Add your first income source to get started."
- Error: "Failed to load income".

**Income dialog**
- Title: "Edit Income" or "Add Income".
- Fields:

| Field | Details |
|---|---|
| "Source Name" | required, placeholder "e.g. Salary, Freelance" |
| "Friendly Name (optional)" | max 200, placeholder "e.g. Salary, Freelance Income"; helper "A short display name shown instead of the raw source name" |
| "Amount" | min 0.01, placeholder "0.00" |
| "Frequency" | One-time, Weekly, Biweekly, Monthly, Annually; default Monthly |
| "Effective Date" | required, default today |
| "End Date (optional)" | date |
| "Attributed To (optional)" | select, placeholder "Who earned this?" |

- "Attributed To" options:
  - "Me (default)".
  - "Household Member", shown only when the user is in a household. It reveals a "Select member" select of `display_name`s and sends `attributed_to_user_id`.
  - "Custom Name", which reveals a text field (placeholder "e.g. Jane, Partner", max 100) and sends `attributed_to_name`.
- Buttons: "Cancel", "Add Income" / "Update" (pending: "Saving...").
- Error fallback: "Failed to save income".

**Delete dialog**
- Title "Delete Income Entry".
- Body: `Are you sure you want to delete “{source_name}”? This action cannot be undone.`
- Server rule: only the owner can delete. An attributed user can edit but not delete (see 2b).

### 1f. Categories page (`W/pages/categories.tsx`, `components/categories/category-form.tsx`)

**Page chrome**
- Title "Categories". Subtitle "Organize your expenses with categories". Button "New Category".
- Empty state: "No categories yet." with "Create your first custom category to get started."
- Error: "Failed to load categories", with "Retry".

**Card grid**
- Each card shows the name, plus a "System" badge with a shield icon when `is_system_default`.
- Custom categories only get Edit and Delete icon buttons.
- When in a household: switch "Shared with household", which fires `PUT {is_shared_with_household: !current}` immediately.

**Category dialog**
- Title: "Edit Category" or "Create Category".
- Fields:
  - "Name": required, placeholder "e.g. Childcare, Pet Expenses".
  - "Share with Household" (household members only): "Make this category visible to all household members".
  - "Budget Class", with options:
    - "Need (50%)"
    - "Want (30%)"
    - "Savings (20%)"
    - "Transfer (not income or spending)"
    - "Other"
  - Default class is `want`.
- Helper under Budget Class: "Used for 50/30/20 budget allocation tracking. Savings counts as saved, not spent; transfers between your own accounts and credit card payments count as neither income nor spending."
- Buttons: "Cancel", "Create Category" / "Update" (pending: "Saving...").
- Error fallback: "Failed to save category".
- Name length is limited to 1–100 by the server only.

**Delete dialog**
- Title "Delete Category".
- Body: `Are you sure you want to delete “{name}”? Expenses using this category will remain but become uncategorized.` See finding 7: this claim looks inaccurate.

### 1g. Bank Statements page (`W/pages/bank-statements.tsx`, `components/bank-statements/*`)

**Page chrome**
- Title "Bank Statements". Subtitle "Upload and review your bank statements". Button "Upload Statement".
- Card "Statements". Empty state: "No bank statements uploaded." with "Upload your first statement to begin."
- Error: "Failed to load statements" with "Retry".

**Statement list** (`statement-list.tsx`)
- Columns: "Bank" (`bank_name` or "Unknown Bank"), "Month" (`statement_month` rendered "Month YYYY", or "Pending" if null), "Account", "Status".
- Account column: a badge with `account_label ?? "Shared"` when shared, otherwise the text "Personal".
- Status labels: "Uploaded", "Processing", "Parsed", "Failed".
- While processing, the status shows a spinner plus `getStepLabel`:
  - `extract_text` → "Reading PDF" or "Reading CSV".
  - `extract_transactions` → "Extracting transactions".
  - `classify_transactions` → "Classifying".
  - `match_and_insert` → "Matching & saving".
  - Anything else → "Processing".
- When `retry_count > 0`: "Retrying ({n}/2) — {step label}".
- Clicking a row selects it and toggles the detail card.

**Detail card, parsed**
- Title: `Transactions — {bank|Unknown Bank} ({Month YYYY})`.
- Shows TransactionReview. Columns: "Date" (`MMM d`), "Description", "Amount", "Type" (badge), "Category" (select, "Uncategorized" plus categories, writes `ai_category`).
- If `is_shared_account` and the user is in a household, extra elements appear:
  - A checkbox column.
  - An "Assign To" column (select, placeholder "Unassigned").
  - A bulk bar showing "{n} selected", a select with placeholder "Assign to...", and a button "Bulk Assign" (pending: "Assigning...").
- Empty state: "No transactions found for this statement."
- Error: "Failed to load transactions" with "Retry".

**Detail card, other statuses**
- `uploaded`: "This statement has been uploaded and is waiting to be processed."
- `processing`:
  - Text "This statement is being processed." or, when retried, "Retrying... (attempt {retry_count+1} of 3)".
  - A 4-step pipeline: "Reading PDF" or "Reading CSV", "Extracting transactions", "Classifying expenses", "Matching & saving".
- `failed`:
  - Line 1: "Failed to process this statement." or "Failed after {n} retry/retries."
  - Line 2 (if the step is known): "Failed during: {step label}".
  - Line 3 (raw): `parsed_data.error`.
  - Buttons "Retry" (pending: "Retrying...") and "Remove" (destructive; pending: "Removing...").

**Upload dialog** (`upload-form.tsx`)
- Title "Upload Bank Statements".
- Drop zone text: "Drop PDFs or CSVs here or click to browse" and "Max 10MB per file".
- Privacy line: "Your bank statement file is deleted once processing finishes (or when you remove a failed upload). We keep the extracted transactions, not the file."
- The file picker accepts `.pdf,.csv,application/pdf,text/csv`, multiple files. Duplicate filenames in the queue are skipped.
- Client-side errors:
  - `{name}: not a PDF or CSV`
  - `{name}: exceeds 10MB`
  - "Please select at least one file"
- Queue header: "{n} file(s) selected — {done} uploaded, {failed} failed". Each file has an optional "Bank name (optional)" input.
- Other fields:
  - "Default Bank Name" with " (optional)" appended unless a CSV is queued. The placeholder is "e.g. Chase, Wells Fargo", or "Select or enter bank name" when a CSV is queued. A datalist is built from existing statements' bank names.
  - Switch "Shared Account": "This account is shared with household members".
  - If shared, "Account Label" (placeholder "e.g. Joint Checking").
- Buttons: "Cancel" / "Close", and "Upload" / "Upload {n} Files" (uploading: "Uploading {done+1} of {total}...").
- Files upload sequentially. The dialog closes only if all succeeded. Per-file errors show as `(msg)`.
- Note: the web's 10 MB limit does not apply to Vercel in practice (see 2d).

## 2. API endpoints

All routes are mounted under `/api`. Everything below the line uses `requireAuth` (A/index.ts:82-95), except `/api/reports`, which applies auth per route.

**Auth and global errors**
- 401 `{"error":"Missing authorization header"}`.
- 401 `{"error":"Invalid or expired token"}`.
- 403 `{"error":"This account has been disabled. Email hello@gravitaz.net if you think this is a mistake.","code":"account_disabled"}`.
- 500 `{"error":"Internal server error"}`.
- 404 for unknown routes `{"error":"Not found"}`.
- Plan refusal, 403: `{"error":"Upgrade required","required_tier":"starter","current_tier":"free"}`.
- Plan checks only run when `STRIPE_SECRET_KEY` is set (non-prod treats everyone as pro).
- Zod failure, 400: `{"error":"Validation failed","details":[...]}` (A/middleware/validate.ts).

**Plan gating summary**
- **No gate:** dashboard/personal, transactions, expenses, income, categories, bank-statements, reports/personal, reports/generate, reports/export/personal.
- **`requireTier("starter")`:** `/goals` and `/debts`. This includes `POST /debts/link-transaction` and `GET /debts`, used by the Transactions Debt column.
- **`requireHouseholdPlan("callerOrHead")`:** `/dashboard/household`, `/reports/household`, `/reports/export/household`.

### 2a. Dashboard (`A/routes/dashboard.ts`, `A/services/dashboard.service.ts`)

`GET /api/dashboard/personal`
- Header `Cache-Control: no-store`.
- Query: `month` (`YYYY-MM-01`, defaults to the current month; the server does not validate it) OR `from_date` / `to_date` (`YYYY-MM-DD`, either is optional). If either date is present, the range path is used and `month` is ignored.
- Web sends `month` for `this_month`, `last_month` and `month:*`, and the date range for everything else.

Month-mode response, `getPersonalDashboardForMonth`:
```
{
  summary: {total_income, total_expenses, total_saved, savings_rate (percent, 2 dp; negative when overspent), net},
  by_category: [{category, amount, percentage}],   // by name, desc; percent of spending+saved
  trends: {income_change, expense_change},          // month_over_month from the report; 0 when computed live
  insights: string|null, insights_month?: "YYYY-MM-01",
  has_transactions: bool, latest_transaction_month: "YYYY-MM-01"|null, month: "YYYY-MM-01"
}
```
- If a cached `reports` row exists with `has_new_data=false` and income or expenses > 0, it is served. Otherwise numbers are computed live from `transactions`, and `trends` is zero.
- Live computation uses `money-flows.summarizeFlows` with the user's category `budget_class`:
  - `transfer` categories are skipped.
  - `savings` debits count as saved, not spent.
  - A `savings` credit reduces saved, not income.
  - `by_category` excludes non-positive amounts.
- Range-mode returns the same shape without `month`, and with `has_transactions` and `latest_transaction_month` (only when empty). `trends` is always 0.
- `latest_transaction_month` is set only when `has_transactions` is false (month mode) and is the latest transaction's month.

`GET /api/dashboard/household` has the same query and shape plus `member_contributions: [{user_id, display_name, income, expenses}]`. It returns 400 `{"error":"You are not a member of a household"}`. It is out of scope for Money; Home uses reports.

### 2b. Reports and PDF (`A/routes/reports.ts`)

`GET /api/reports/personal?month=YYYY-MM-01`
- Returns the Report row `{id, entity_type, entity_id, report_month, report_data, ai_insights, generated_at, has_new_data}`.
- It generates on demand when the report is missing or `has_new_data` is true. It first generates the previous month, then the requested one, with `skipIfEmpty`.
- 404 `{"error":"Report not found for this month"}` for months without transactions (the iOS client maps a 404 to `nil`).
- 500 `{"error":"Failed to generate report"}`.
- `report_data` has `total_income`, `total_expenses`, `savings_rate`, `by_category`, `financial_health_score`, `month_over_month`, and more.

`POST /api/reports/generate` (no body)
- Requires auth.
- Limited to 2 per rolling 24 h in production (`VERCEL_ENV==='production'`). The 3rd returns 429 `{"error":"Report generation limit reached (2 per 24 hours)"}`.
- Generates (force) the report for the month of the latest transaction, plus the household report if the user has one.
- Returns the report row. Web toasts "Report generated" or the error message, falling back to "Failed to generate report".
- It then invalidates the dashboard cache.

`GET /api/reports/export/personal`
- Query: `month=YYYY-MM-01`, or `from_date` AND `to_date` (both required for a range).
- Response is `application/pdf` with `Content-Disposition: attachment; filename="spendoza-report-YYYY-MM.pdf"` (or `...YYYY-MM-to-YYYY-MM.pdf`).
- 404 `{"error":"No report data available for this period"}`. 500 `{"error":"Failed to generate PDF report"}`.
- Web toasts: success "PDF report downloaded"; failure "Failed to export PDF report. Please try again."

### 2c. Transactions (`A/routes/transactions.ts`, `A/services/transaction.service.ts`)

`GET /api/transactions`
- Query: `bank_statement_id`, `from_date` (`date >=`), `to_date` (`date <=`), `type` (`credit|debit`, an exact match with no validation).
- Always filtered to `user_id = caller`. Ordered `date desc`.
- There is no `search`, `category`, pagination or `limit` param. Search and category filtering are client-side on the web.
- Hosted PostgREST likely caps rows at about 1000 (no override in config.toml). This is unverified, so iOS should filter by month.
- Returns the raw `Transaction[]` (S/schemas/transaction.ts:51-65):
  `id, bank_statement_id, user_id, attributed_to_user_id|null, date (YYYY-MM-DD), description, amount (positive), type (credit|debit), ai_category|null, matched_expense_id, matched_income_id, matched_debt_id, created_at`.
- 400 `{error: <supabase message>}`.

`PUT /api/transactions/:id`
- Body is `updateTransactionSchema`: `{ai_category?: string|null, matched_expense_id?: uuid|null, matched_income_id?: uuid|null, matched_debt_id?: uuid|null}`.
- Unknown keys are stripped. No amount, date, description or type edits are possible.
- Scoped to `user_id = caller`.
- Returns 200 with the updated row, or 404 `{"error":"Transaction not found"}`.
- iOS `setCategory` already sends `{"ai_category": <name|null>}`, always including the key.
- Changing `ai_category` triggers `mark_reports_stale` (migration 20261030120000), so cached reports are rebuilt on next open.

`PUT /api/transactions/:id/attribute`
- Body `{attributed_to_user_id: uuid}`. Returns 200 with the row.
- 403 errors (the validation helper returns every failure as 403):
  - "Transaction not found" (also a 403 here)
  - "Bank statement not found"
  - "Attribution is only allowed for shared account statements"
  - "Target user not found"
  - "Requester profile not found"
  - "Target user is not in the same household"
  - "Only the statement uploader or head of household can attribute transactions"
- 400 `{"error":"Failed to attribute transaction"}`.
- The helper's first query filters `user_id = requester`, so only the uploader's own transactions can pass. The "head of household" branch is effectively dead for rows owned by other users.

`POST /api/transactions/bulk-attribute`
- Body `{attributions:[{transaction_id, attributed_to_user_id}]}`.
- Returns 200 `{results:[{transaction_id, success, error?}]}`. Per-item errors use the strings above, or "Failed to update transaction".
- There is no way to clear an attribution back to null through the API (`attributed_to_user_id` is required and must be a uuid).

### 2d. Bank statements (`A/routes/bank-statements.ts`)

`POST /api/bank-statements/upload` (multipart)
- Fields:
  - `file` (single file, field name exactly `file`)
  - `bank_name` (optional string)
  - `is_shared_account` (`"true"` or `"false"`, default false)
  - `account_label` (optional string)
- Multer uses memory storage with no `limits` set, so there is no server-side size cap.
- The only cap is Vercel's request-body limit of 4.5 MB, which returns 413.
  - iOS `APIClient.maxStatementBytes = 4_480_000`, measured at 4,493,164 accepted and 4,494,140 rejected (APIClient.swift:4-8).
- The web's `MAX_BANK_STATEMENT_SIZE_MB = 10` (S/constants.ts) is only a client-side check, and is misleading on Vercel.
- Accepted types, by `file.mimetype` / extension:
  - PDF if mimetype is `application/pdf` or extension is `pdf`.
  - CSV if mimetype is `text/csv`, or mimetype is `text/plain` and extension is `csv`.
  - Otherwise 400 `{"error":"Only PDF and CSV files are supported"}`.
- Errors:
  - 400 `{"error":"Validation failed","details":[...]}` for bad metadata.
  - 400 `{"error":"File is required"}`.
  - 409 `{"error":"Duplicate statement"}`. This is a SHA-256 hash match on the same user. A hash match on a `failed` statement removes the old one and allows re-upload.
  - 400 `{"error":"Invalid file name"}`.
  - 500 `{"error":"Failed to upload file"}`. This also happens on a storage-key collision, because the storage path is `{userId}/statements/{originalname}` with `upsert:false`. iOS should give files unique names, or at least know this can happen.
  - 400 `{error:<db message>}`.
- Success is 201 with the full `bank_statements` row: `status:"processing"`, `parsed_data:{pipeline_step:"extract_text"}`, `statement_month:null`, `file_type:"pdf"|"csv"`.
- A DB trigger runs the pipeline. There is no separate "uploaded" status in practice, though the enum includes it.
- Multi-month CSVs are split by the server into one child statement per month. The parent gets `parsed_data.is_parent_split` and `child_count`. Children have `file_hash = "{parentHash}:..."`.

`GET /api/bank-statements`
- All of the user's statements, `created_at desc`, no pagination.
- Shape (S/schemas/bank-statement.ts:34-47): `{id, user_id, file_path, file_hash, file_type, bank_name|null, statement_month (YYYY-MM-DD)|null, is_shared_account, account_label|null, status: uploaded|processing|parsed|failed, parsed_data: object|null, created_at}`.
- `parsed_data` while processing: `{pipeline_step, retry_count?, last_error?, last_retry_at?, ...intermediate data}`.
- `parsed_data` when failed: `{error: "<raw message>", failed_at, failed_step, retry_count}`.
- There is no human-friendly reason, only the raw `error` string, which is what the web displays.

`GET /api/bank-statements/:id` returns `{statement, transactions}`, or 404 `{"error":"Statement not found"}`. The web uses `.transactions` for the review list. iOS already uses `GET /transactions?bank_statement_id=`, which is equivalent.

`POST /api/bank-statements/:id/reprocess`
- Sets `status:"processing"` and `parsed_data:{pipeline_step:"extract_text"}`.
- Returns 200 `{"message":"Reprocessing started"}`, or 404 `{"error":"Statement not found"}`.
- It works on any status, not just failed.

`DELETE /api/bank-statements/:id`
- 204 on success.
- 404 `{"error":"Statement not found"}`.
- 400 `{"error":"Only failed statements can be deleted"}`.
- 500 `{"error":"Failed to remove statement"}`.
- It also removes split children and the stored file.

Pipeline retries: `MAX_RETRIES` with backoff in the pipeline. Web labels "retry_count/2" and "attempt n of 3" are inconsistent, so use the web wording that matches whichever surface you copy.

### 2e. Expenses (`A/routes/expenses.ts`, `A/services/expense.service.ts`, `S/schemas/expense.ts`)

`GET /api/expenses`
- Query: `category_id`, `frequency` (`one_time|recurring`), `from_date` (`next_due_date >=`), `to_date` (`next_due_date <=`).
- The service always excludes rows whose `end_date` is in the past: `end_date IS NULL OR end_date >= today`.
- Ordered `next_due_date asc`. No pagination. 400 `{error:<msg>}` on failure.

`POST /api/expenses`
- Body `createExpenseSchema`:
  - `category_id: uuid`
  - `description: string 1..500`
  - `friendly_name?: string<=200|null`
  - `amount: number > 0`
  - `frequency: "one_time"|"recurring"`
  - `recurrence_interval?: "weekly"|"biweekly"|"monthly"|"quarterly"|"annually"|null`
  - `next_due_date: YYYY-MM-DD`
  - `end_date?: YYYY-MM-DD|null`
- There is no cross-field rule between frequency and recurrence_interval.
- Returns 201 with the row, or 400 `{error:<db message>}`.

`PUT /api/expenses/:id` takes the partial of the above. Returns 200, or 404 `{"error":"Expense not found"}`.

`DELETE /api/expenses/:id` returns 204, or 400 `{error:<msg>}`.

Expense row: `id, user_id, category_id, description, friendly_name, amount, frequency, recurrence_interval, next_due_date, end_date, is_ai_adjusted, original_amount, bank_statement_id, auto_detected, last_seen_at, created_at, updated_at`.

### 2f. Income (`A/routes/income.ts`, `A/services/income.service.ts`, `S/schemas/income.ts`)

`GET /api/income`
- Entries owned by OR attributed to the caller (`user_id.eq.me,attributed_to_user_id.eq.me`).
- Ordered `effective_date desc`. There is no end_date filter, so ended entries still appear.

`POST /api/income`
- Body `createIncomeSchema`:
  - `source_name: 1..200`
  - `friendly_name?: <=200|null`
  - `amount > 0`
  - `frequency: "one_time"|"weekly"|"biweekly"|"monthly"|"annually"`
  - `effective_date: YYYY-MM-DD`
  - `end_date?: date|null`
  - `attributed_to_user_id?: uuid|null`
  - `attributed_to_name?: <=100|null`
- If `attributed_to_user_id` is set, the server checks the same household. Otherwise it returns **403** (not 400) `{"error":"Attributed user is not in your household"}`.
- Any other create error is also a 403 with the DB message.
- Returns 201 with the row.

`PUT /api/income/:id` takes the partial. It is scoped to `user_id = caller` in the service, so an attributed user's edit actually fails with 404 `{"error":"Income entry not found"}` despite the route comment.

`DELETE /api/income/:id` returns 204, or 400 `{error}`. Owner only.

Income row adds `auto_detected, last_seen_at, is_ai_suggested, bank_statement_id`.

### 2g. Categories (`A/routes/categories.ts`, `A/services/category.service.ts`, `S/schemas/category.ts`)

`GET /api/categories` returns the user's rows, ordered by `name` (system and custom together).
Row: `{id, user_id, name, is_shared_with_household, is_system_default, icon|null, budget_class: "need"|"want"|"savings"|"transfer"|"other", created_at}`.

System defaults seeded per user:
- need: Housing, Utilities, Groceries, Transportation, Healthcare, Insurance
- want: Entertainment, Dining Out, Personal, Subscriptions, Automotive
- savings: Savings
- other: Debt Payments, Other
- transfer: Transfers

`POST /api/categories`
- Body `{name: 1..100, icon?: string|null, is_shared_with_household?: boolean (default false), budget_class?}`.
- If `budget_class` is omitted, the DB default is `want`.
- Returns 201, or 400 `{error:<msg>}`.

`PUT /api/categories/:id` takes the partial. Returns 200, or 404 `{"error":"Category not found"}`. It has no system-default guard.

`DELETE /api/categories/:id`
- 204 on success.
- 403 `{"error":"Cannot delete system default categories"}`.
- 404 `{"error":"Category not found"}`.
- 400 `{error:<msg>}`, including the likely FK failure noted in finding 7.

iOS already calls `PUT /api/categories/:id` for `is_shared_with_household` (`setCategoryShared`).

### 2h. Household (for attribution)

`GET /api/household` returns `{household, members:[{id, display_name, income_sharing_mode, expense_sharing_mode}]}`, and 404 without a household. The iOS `Household`/`Member` model already exists.

## 3. Recurring detection

**Tables and columns**
- `expenses`:
  - `frequency` (`one_time|recurring`), `recurrence_interval`, `next_due_date`, `end_date`, `friendly_name`.
  - `auto_detected BOOLEAN DEFAULT false`, `last_seen_at TIMESTAMPTZ` (migration 20260224024348).
  - `is_ai_adjusted`, `original_amount`, `bank_statement_id` (initial schema).
- `income_entries`: `auto_detected`, `last_seen_at DATE`, `friendly_name`, `is_ai_suggested` (migration 20260224170541).
- There is no separate "recurring" table, and no flag besides `auto_detected` distinguishes detected from manual.

**When it runs**
- At the end of the statement pipeline's `match_and_insert` step:
  - `detectRecurringBills(userId)` (A/services/bill-detection.service.ts)
  - `detectRecurringIncome(userId)` (A/services/income-detection.service.ts)
  - `linkPaymentsToDebts` (A/services/ai-pipeline.service.ts:728-745)
- Failures are non-fatal.
- Admin can re-run it: `POST /api/admin/users/:id/detect-recurring`.
- There is no user-facing endpoint to trigger detection.

**Bill detection rules**
1. Takes the user's debit transactions from the last 12 months.
2. Groups them by normalised description. Normalisation: lowercase, strip punctuation, drop numbers of 5+ digits, collapse spaces. It merges groups whose `similarity` is ≥ 0.6.
3. A group needs at least 2 occurrences.
4. The most common `ai_category` must match a bill-like keyword. The keyword list covers subscription, streaming, utilities, rent, mortgage, insurance, auto, loan/debt, health/gym, software. The list is in `BILL_CATEGORY_KEYWORDS` (bill-detection.service.ts:22-40).
5. Amounts must be within ±10% of the average. Mortgage or housing categories get ±25%.
6. The average gap between dates must match an interval within a tolerance:
   - weekly 7±2
   - biweekly 14±3
   - monthly 30±5
   - quarterly 91±15
   - annually 365±30
7. `next_due_date` = last seen date plus one interval, where "monthly" uses calendar `setMonth(+1)`.
8. The category is resolved to an existing `categories.id`, with exact match then fuzzy match ≥ 0.5. Without a match, the bill is skipped.
9. A detected bill is matched to an existing `auto_detected` expense by description similarity.
   - On a match, it updates `amount`, `recurrence_interval`, `next_due_date`, `last_seen_at`, and sets `end_date = null` (re-activation). It sets `friendly_name` only if one is not already set.
   - Otherwise it inserts `{frequency:"recurring", auto_detected:true, friendly_name: AI-generated}`.
10. Staleness: an auto-detected expense whose `last_seen_at` is older than 2 × interval days gets `end_date = today`.
   - Because `GET /expenses` hides rows with a past `end_date`, expired auto bills vanish from lists.
   - Detection re-runs overwrite user edits to `amount`, `recurrence_interval`, `next_due_date` and `end_date` on auto-detected rows. Only `friendly_name` is preserved.

**Income detection** is the same idea but over credits, with no category gate. `quarterly` is skipped, and `effective_date` is set to the first date seen.

**Manual vs detected in the UI and API**
- Manual rows are `auto_detected=false`, created by `POST /expenses` or `POST /income`.
- Detected rows are `auto_detected=true`, created by the server only.
- The API makes no distinction for edit or delete. The same PUT and DELETE work on both.
- The web shows an "Auto-detected" badge on the Expenses and Income lists, and "Auto" on Upcoming Bills.

**Upcoming bills on the web** (`W/components/dashboard/upcoming-bills-list.tsx:48-120`)
- Query: `GET /expenses?frequency=recurring&from_date={today UTC YYYY-MM-DD}`.
- So it shows recurring expenses with `next_due_date >= today`, manual and auto, ordered by `next_due_date` asc, excluding rows with a past `end_date`.
- There is no `to_date`, no limit and no horizon: all future bills appear.
- It does not roll `next_due_date` forward after a due date passes.
- Because of `from_date=today`, an "overdue" bill (daysUntil < 0, labelled "(overdue)" in rose) can never actually appear. Dead code on the web.

Row UI:
- Icon, name (`friendly_name || description`), "Auto" badge if `auto_detected`.
- Date as `MMM d` plus "(today)" or "(in {n}d)" (or "(overdue)").
- Amount in cents.
- Amber border and background if ≤ 3 days away.
- Title "Upcoming Bills". Empty state: "No upcoming bills found".

## 4. Transactions: editable fields, filters, pagination

**Editable**
- Via `PUT /transactions/:id`: `ai_category` (string name or null), `matched_expense_id`, `matched_income_id`, `matched_debt_id`. The web exposes only category and debt link.
- Via `PUT /transactions/:id/attribute` and bulk: `attributed_to_user_id` (uuid, required).
- Not editable via the API: `description`, `amount`, `date`, `type`.

**Filters the API supports on `GET /transactions`**: `bank_statement_id`, `from_date`, `to_date`, `type`. That is all.
- Search and category filtering are client-side on the web.
- On iOS, category filter and search will also have to be client-side, over a month-bounded request (iOS already fetches `from_date`/`to_date` for a month in `CategoryDetailModel.load`).

**Pagination**: none. Sort is `date desc` only.

## 5. What iOS already has (apps/ios)

**SpendozaKit models** (`Packages/SpendozaKit/Sources/SpendozaKit/Models/`)
- `Transaction.swift`:
  - Fields: `id, date (YYYY-MM-DD String), description, amount, type (credit|debit), category (ai_category)`.
  - Missing: `attributed_to_user_id`, `bank_statement_id`, `matched_*`.
- `Statement.swift`:
  - Fields: `id, status, fileType, bankName, accountLabel, createdAt, pipelineStep, isParentSplit, childCount`.
  - Comment says "The server has no file name or error text".
  - Missing: `statement_month`, `is_shared_account`, `parsed_data.error`, `failed_step`, `retry_count`. All of these are needed for the "failed with reason" and "Month" columns.
- `BudgetCategory.swift`: `id, name, budgetClass (need|want|savings|transfer|other), isSharedWithHousehold`. Missing: `isSystemDefault`, `icon`.
- `Report.swift`:
  - `GET /reports/personal` decode: `Report{month, data: ReportData{totalIncome, totalExpenses, savingsRate, byCategory[CategoryAmount{category, amount, percentage}], health}, insights[], generatedAt}`. Enough for Overview's money-in/out, spending by category and insights.
  - `hasNoData` exists.
- `Month.swift`: `apiString` is "YYYY-MM-01", and `name` returns fixed-English month names.
- `ReportPeriod.swift`, `PDFFile`: `.month` → `?month=`, `.range` → `?from_date&to_date` (end is the last day of the month).
- `Household.swift`: `Household`, `Member{id, displayName, ...}`, usable for "Assign To".

**APIClient / SpendozaAPI calls already implemented** (SpendozaAPI.swift, APIClient.swift)
- `personalReport(_:)`: 404 maps to nil.
- `categories()`.
- `transactions(from:to:)`: `from_date` and `to_date` via `dayString`, in the device calendar.
- `transactions(statementID:)`: `bank_statement_id`.
- `setCategory(transactionID:category:)`: PUT with an always-present `ai_category` key.
- `createBudgetGoal`.
- `uploadStatement(fileURL:mimeType:bankName:)`:
  - Multipart field `file`, optional `bank_name`.
  - Enforces `maxStatementBytes` (4,480,000) before and after reading.
  - Does NOT send `is_shared_account` or `account_label`.
- `statements()`, `reprocessStatement(id:)`, `removeStatement(id:)`.
- `personalReportPDF(_:)`: returns `PDFFile`; used by Me's PDFReportsModel.
- `setCategoryShared(id:shared:)`: PUT `/api/categories/:id`.
- `household()` and the other household calls.
- Error mapping (`APIClient.error`): 413 → `fileTooLarge`; 403 with `required_tier` → `notOnPlan`; `account_disabled` code; the server `error` text; fallback "Something went wrong. Try again."

**Not yet in the iOS API (these are new for Money)**
- Dashboard endpoints (none needed if Overview uses `/reports/personal`).
- `POST /reports/generate` ("Refresh report").
- Expenses CRUD, Income CRUD.
- Categories create, update (rename, budget class) and delete.
- Transaction attribution (`/attribute`, `/bulk-attribute`).
- Debt link.
- `GET /expenses` for upcoming bills.

**Existing UI to reuse**
- Health drill-down: `Spendoza/Features/Health/CategoryDetailModel.swift` and `CategoryDetailView.swift`.
  - Model: loads categories and transactions in parallel, optimistic `recategorize(_:to:)` with restore on failure, Undo bar (`lastMove`), `userMessage(for:)`, `saveBudgetGoal`.
  - View: `TransactionRow` (description, short date, cents amount, chevron) and `CategoryPickerSheet`. The sheet is titled "Move to another category" and lists "Uncategorized" plus categories sorted by name, with "Try again" and "Cancel". The undo bar reads "Moved {description} to {destination}."
  - Both can be generalised for the Transactions segment, but they are specific to a single category and to debits.
- Onboarding (`Spendoza/Features/Onboarding/OnboardingModel.swift`, `OnboardingView.swift`):
  - Statement flow: upload with `.fileImporter` (PDF and CSV), poll `statements()` every 3 s up to 40 times, retry, remove, and split detection.
  - `OnboardingView` strings to reuse:
    - "Choose PDFs or CSVs"
    - "Max {n} MB per file"
    - "Your bank statement file is deleted once processing finishes (or when you remove a failed upload). We keep the extracted transactions, not the file."
    - progress strings ("Reading your CSV...", "Reading your bank statement...", "Extracting transactions...", "Categorizing expenses...", "Preparing your data...", "Getting your transactions ready...")
    - failure copy `failedMessage` = "We couldn't read this statement."
    - "Retry", "Remove"
    - "Choose a PDF or CSV file."
  - These differ from the Bank Statements page's wording ("Reading PDF/CSV", "Extracting transactions", "Classifying expenses", "Matching & saving"), so match whichever surface Money mirrors.
  - `failedMessage` hides the real reason (`parsed_data.error`), so "failed with reason" is a new data requirement.
- Me tab: `PDFReportsModel` and `PDFReportsView` (share sheet plus temp-file lifecycle, `exportsRoot`/`discard`/`clearExports`, option list) can be reused for the month-menu PDF export.
- Tabs: `Spendoza/App/MainTabs.swift` has only Health, Home and Me, so Money, Plan and the extra tabs are all new.
- Test stub: `Spendoza/Debug/StubAPI.swift` implements `SpendozaAPI`, so any new protocol methods need stub implementations.
- Polling: `Spendoza/Features/Health/HealthModel.swift` and `ReportCache` / `AccountScope` handle staleness and sign-out, and should be the pattern for any Money caching.