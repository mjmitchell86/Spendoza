# Spendoza - Product Requirements Document & Design

**Date:** 2026-02-22
**Status:** Approved
**Version:** 1.0

---

## 1. Overview

Spendoza is a personal and household finance tracker that helps users understand their income, expenses, and overall financial health. Users can manually enter financial data or upload bank statement PDFs for AI-powered extraction and categorization. Households allow multiple users to share financial visibility.

### Core Value Proposition

- **Personal finance tracking** with income and expense management
- **AI-powered bank statement parsing** for automated data entry
- **Household budgeting** with configurable sharing of income and expenses
- **Monthly AI-generated financial health reports** with actionable insights
- **Dashboard visualizations** for both personal and household finances

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Bun |
| **Backend** | Express.js (TypeScript) |
| **Frontend** | React (Vite SPA, TypeScript) |
| **UI Components** | shadcn/ui + Tailwind CSS |
| **Charts** | Recharts |
| **Server State** | TanStack Query |
| **AI/LLM** | LangChain + OpenAI |
| **Database** | Supabase Postgres |
| **Auth** | Supabase Auth (email/password) |
| **File Storage** | Supabase Storage |
| **Cron** | pg_cron (Supabase) |
| **Monorepo** | Bun workspaces + Turborepo |
| **Validation** | Zod (shared package) |
| **Hosting** | Vercel |
| **CI/CD** | GitHub Actions |
| **Domain** | spendoza.io |

---

## 3. Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Vite SPA   │────>│  Bun + Express   │────>│    Supabase     │
│  (React)    │     │  REST API        │     │  - Auth         │
│  shadcn/ui  │     │  - LangChain     │     │  - Postgres     │
│  Recharts   │     │  - OpenAI        │     │  - Storage      │
│  TanStack   │     │  - Zod           │     │  - Edge Funcs   │
│  Query      │     └──────────────────┘     │  - pg_cron      │
└─────────────┘                              └─────────────────┘
```

### Monorepo Structure

```
spendoza/
├── packages/
│   ├── shared/          # Shared types, Zod schemas, constants
│   ├── api/             # Bun + Express backend
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   ├── middleware/
│   │   │   ├── ai/          # LangChain pipelines
│   │   │   └── index.ts
│   │   └── supabase/
│   │       └── migrations/
│   └── web/             # Vite + React SPA
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   ├── hooks/
│       │   ├── lib/
│       │   └── App.tsx
│       └── index.html
├── .github/workflows/
├── package.json         # Workspace root
├── turbo.json
└── CLAUDE.md
```

### Key Architectural Decisions

- **Auth flow:** Supabase Auth JS client handles signup/login on frontend. Backend validates JWT on every request via Supabase `getUser()`. RLS policies on Postgres as a second layer of defense.
- **File uploads:** Bank statement PDFs go to Supabase Storage. Backend downloads from storage for AI processing.
- **AI pipeline:** LangChain orchestrates: PDF text extraction -> OpenAI structured output for transaction parsing -> category classification -> expense matching.
- **Cron:** Supabase pg_cron extension triggers a Supabase Edge Function on the 1st of each month, which calls the Express API's report generation endpoint.
- **State management:** TanStack Query for server state, minimal React context for UI state (theme, sidebar).
- **Mobile-ready:** REST API is client-agnostic. Shared types package can be consumed by a React Native app.

---

## 4. Data Model

### profiles
Extends Supabase `auth.users`.

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | FK -> auth.users |
| display_name | text | |
| onboarding_completed | boolean | default false |
| household_id | uuid, nullable | FK -> households |
| income_sharing_mode | enum | 'all', 'none', 'partial' |
| shared_income_amount | numeric, nullable | used when mode = 'partial' |
| expense_sharing_mode | enum | 'all', 'none', 'category' |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### households

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| name | text | |
| head_of_household_id | uuid | FK -> profiles |
| invite_code | text, unique | for joining |
| created_at | timestamptz | |

**Constraint:** Max 10 members per household (enforced at application layer and via DB trigger).

### household_invitations

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| household_id | uuid | FK -> households |
| email | text | |
| status | enum | 'pending', 'accepted', 'declined', 'revoked' |
| invited_by | uuid | FK -> profiles |
| created_at | timestamptz | |
| expires_at | timestamptz | |

### categories

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| user_id | uuid | FK -> profiles |
| name | text | |
| is_shared_with_household | boolean | default false; determines household rollup |
| is_system_default | boolean | default false |
| icon | text, nullable | |
| created_at | timestamptz | |

**System defaults seeded on user creation:** Housing, Utilities, Groceries, Transportation, Healthcare, Insurance, Entertainment, Dining Out, Personal, Savings, Debt Payments, Subscriptions, Other.

### income_entries

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| user_id | uuid | FK -> profiles |
| source_name | text | e.g., "Employer - Acme Corp" |
| amount | numeric | |
| frequency | enum | 'one_time', 'weekly', 'biweekly', 'monthly', 'annually' |
| effective_date | date | |
| end_date | date, nullable | |
| is_ai_suggested | boolean | |
| bank_statement_id | uuid, nullable | FK -> bank_statements |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### expenses

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| user_id | uuid | FK -> profiles |
| category_id | uuid | FK -> categories |
| description | text | |
| amount | numeric | |
| frequency | enum | 'one_time', 'recurring' |
| recurrence_interval | enum, nullable | 'weekly', 'biweekly', 'monthly', 'quarterly', 'annually' |
| next_due_date | date | |
| end_date | date, nullable | |
| is_ai_adjusted | boolean | default false |
| original_amount | numeric, nullable | amount before AI adjustment |
| bank_statement_id | uuid, nullable | FK -> bank_statements |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### bank_statements

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| user_id | uuid | FK -> profiles |
| file_path | text | Supabase Storage path |
| file_hash | text | SHA-256 for deduplication |
| bank_name | text, nullable | hybrid parsing hint |
| statement_month | date | first of the month |
| status | enum | 'uploaded', 'processing', 'parsed', 'failed' |
| parsed_data | jsonb, nullable | raw extraction results |
| created_at | timestamptz | |

**Deduplication:** `UNIQUE(user_id, file_hash)` — same file uploaded twice is rejected before processing.

### transactions

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| bank_statement_id | uuid | FK -> bank_statements |
| user_id | uuid | FK -> profiles |
| date | date | |
| description | text | |
| amount | numeric | |
| type | enum | 'credit', 'debit' |
| ai_category | text, nullable | AI-suggested category name |
| matched_expense_id | uuid, nullable | FK -> expenses |
| matched_income_id | uuid, nullable | FK -> income_entries |
| created_at | timestamptz | |

### reports

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| entity_type | enum | 'user', 'household' |
| entity_id | uuid | user ID or household ID |
| report_month | date | |
| report_data | jsonb | pre-computed metrics |
| ai_insights | text, nullable | AI-generated summary |
| generated_at | timestamptz | |
| has_new_data | boolean | false = no re-engage with AI |

### report_requests

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| user_id | uuid | FK -> profiles |
| report_month | date | |
| request_count | int | default 1, max 2 |
| created_at | timestamptz | |

---

## 5. API Design

### Authentication

```
POST   /api/auth/signup
POST   /api/auth/login
POST   /api/auth/logout
```

### Profile

```
GET    /api/profile
PUT    /api/profile
PUT    /api/profile/onboarding
```

### Households

```
POST   /api/households
GET    /api/households/:id
POST   /api/households/:id/invite
POST   /api/households/:id/join
DELETE /api/households/:id/members/:userId
PUT    /api/households/:id/sharing
```

### Categories

```
GET    /api/categories
POST   /api/categories
PUT    /api/categories/:id
DELETE /api/categories/:id
```

### Income

```
GET    /api/income
POST   /api/income
PUT    /api/income/:id
DELETE /api/income/:id
```

### Expenses

```
GET    /api/expenses
POST   /api/expenses
PUT    /api/expenses/:id
DELETE /api/expenses/:id
```

### Bank Statements

```
POST   /api/bank-statements/upload
GET    /api/bank-statements
GET    /api/bank-statements/:id
POST   /api/bank-statements/:id/reprocess
```

### Transactions

```
GET    /api/transactions
PUT    /api/transactions/:id
```

### Reports & Dashboards

```
GET    /api/reports/personal
GET    /api/reports/household
POST   /api/reports/generate
GET    /api/dashboard/personal
GET    /api/dashboard/household
```

---

## 6. AI Pipeline: Bank Statement Processing

### Hybrid Parsing Strategy

1. **Upload:** PDF -> Supabase Storage, SHA-256 hash computed, checked against existing hashes for user
2. **Extract:** LangChain PDF loader extracts text. If bank is identified (user selects or auto-detected), use bank-specific prompt template for better accuracy
3. **Parse:** OpenAI structured output extracts transactions (date, description, amount, credit/debit)
4. **Classify:** Each transaction gets an AI-suggested category from user's existing categories (or suggests new ones)
5. **Match:** Transactions matched to existing expenses/income by description similarity + amount proximity
6. **Adjust:** If a matched recurring expense has a different amount, flag it and optionally update the stored expense amount

### AI-Powered Categorization

- On first upload: AI categorizes transactions into system default categories or suggests new ones
- On subsequent uploads: AI uses existing user categories as context for classification
- Users can always override AI suggestions; the system learns from corrections within the user's data

### Report AI Insights

- Monthly report sends a structured summary of financial data to OpenAI
- Returns 3-5 bullet-point financial health insights
- Includes actionable suggestions (e.g., "Your dining spend increased 30% month-over-month")
- Cached in `reports.ai_insights` to avoid re-calling OpenAI when no new data exists

---

## 7. User Flows

### Onboarding Wizard

1. **Welcome screen** — brief app explanation
2. **Upload bank statement(s)** — drag-and-drop or file picker, optional bank name selection
3. **AI processing** — loading state while transactions are extracted
4. **Review transactions** — user confirms/adjusts categories and identifies income sources
5. **Setup recurring expenses** — mark which expenses are recurring vs. one-time
6. **Optional: Household** — create or join a household (can skip)
7. **Dashboard** — loads with initial data from processed statement

### Household Creation & Joining

**Creating:**
1. User clicks "Create Household"
2. Names the household
3. Gets an invite code to share
4. Becomes head of household

**Joining:**
1. User receives invite (email with code, or direct code)
2. Enters invite code
3. Configures income sharing: all / none / partial (set amount)
4. Configures expense sharing: all / none / by category (select which categories)
5. Joins household

**Head of Household Permissions:**
- Invite new members (up to 10 total)
- Remove any member
- View household dashboard
- Cannot view individual member's private (non-shared) data

### Expense Management

- **Manual entry:** description, amount, category, one-time or recurring (with interval and next due date)
- **From bank statement:** AI extracts and pre-fills, user confirms
- **AI adjustment:** When a new bank statement shows a recurring expense at a different amount, the user is notified and can accept the AI-suggested adjustment

### Report Generation

**Automatic (monthly cron):**
- pg_cron fires on 1st of each month
- Edge Function triggers report generation for all users and households
- Report includes data aggregation + AI insights

**Manual (up to 2x/month):**
- User clicks "Refresh Report"
- System checks: are there new bank statements or manual entries since last report?
  - **Yes:** Generates fresh report with AI insights
  - **No:** Returns cached report data without calling OpenAI
- Tracks request count per user per month (max 2)

---

## 8. Dashboard & Visualizations

### Personal Dashboard

| Widget | Chart Type | Description |
|---|---|---|
| Income vs. Expenses | Stacked bar chart | Monthly comparison over last 6-12 months |
| Spending by Category | Donut/pie chart | Current month with drill-down to transactions |
| Monthly Trend | Line chart | Net savings (income - expenses) over time |
| Savings Rate | KPI card/gauge | (income - expenses) / income as percentage |
| Top Expenses | Ranked list | Biggest recurring expenses with amounts |
| Upcoming Bills | List | Next 30 days of expected expenses by recurrence |
| AI Insights | Card | Latest AI-generated financial health summary |

### Household Dashboard

| Widget | Chart Type | Description |
|---|---|---|
| Combined Income | KPI card | Total shared income from all members |
| Combined Expenses | Stacked bar | Shared expenses by category |
| Member Contributions | Bar chart | Income/expense breakdown per member |
| Household Savings Rate | KPI card/gauge | Combined metric |
| Shared vs. Personal | Donut chart | % of total spending that is shared |
| Household AI Insights | Card | Household-level financial health summary |

---

## 9. Deployment & Environments

### Environment Matrix

| | Test | Production |
|---|---|---|
| **Git Branch** | `test` | `main` |
| **Supabase Project** | spendoza-test | spendoza-prod |
| **Vercel Project** | spendoza-test | spendoza |
| **Domain** | test.spendoza.io | spendoza.io |
| **GitHub Trigger** | Push to `test` | Push to `main` |

### Vercel Configuration

- **API package:** Deployed as Vercel Serverless Functions (Bun runtime)
- **Web package:** Deployed as static site (Vite build output)
- Both packages deploy from the same monorepo via Vercel's monorepo support (root directory config per project)

### GitHub Actions

**`.github/workflows/test-deploy.yml`** (push to `test`):
1. Install dependencies (Bun)
2. Lint + typecheck (`turbo lint typecheck`)
3. Run tests (`turbo test`)
4. Apply Supabase migrations to test project
5. Deploy to Vercel test project via Vercel CLI

**`.github/workflows/prod-deploy.yml`** (push to `main`):
1. Install dependencies (Bun)
2. Lint + typecheck (`turbo lint typecheck`)
3. Run tests (`turbo test`)
4. Apply Supabase migrations to production project
5. Deploy to Vercel production project

**`.github/workflows/pr-check.yml`** (pull requests):
1. Lint, typecheck, test only (no deploy)

### Supabase Migrations

- Stored in `packages/api/supabase/migrations/`
- Applied via `supabase db push` in CI targeting the correct project per environment
- Test gets migrations on push to `test`, prod on push to `main`

---

## 10. Security

### Authentication

- Supabase Auth with email/password
- JWT-based session management
- Backend validates JWT on every API request

### Row Level Security (RLS)

- All tables have RLS enabled
- Users can only read/write their own data
- Household data accessible only to household members
- Head of household has additional permissions (invite/remove members)
- Household dashboard queries only aggregate shared categories

### File Storage Security

- Supabase Storage bucket: `bank-statements`
- Per-user path isolation: `{user_id}/statements/{filename}`
- RLS on storage bucket: users can only access their own folder

### API Security

- Rate limiting on all endpoints
- Input validation via Zod schemas (shared package)
- CORS configured for spendoza.io and test.spendoza.io only
- Environment variables for all secrets (Supabase keys, OpenAI key)

---

## 11. Constraints & Business Rules

1. **Household size limit:** Maximum 10 members per household
2. **One household per user:** A user can belong to at most 1 household
3. **Report regeneration limit:** Maximum 2 manual report requests per user per month
4. **Bank statement dedup:** Entire file hash comparison (SHA-256). Duplicate files rejected; partial overlapping transactions from different statements are NOT deduped (different statements may legitimately contain overlapping date ranges)
5. **Head of household:** The user who created the household. They can invite/remove members. If they leave, the household is dissolved (or ownership transfers — to be decided in v2)
6. **Income sharing modes:** all (full income reported), none (no income shared), partial (fixed amount shared)
7. **Expense sharing modes:** all (all expenses shared), none (no expenses shared), category (only expenses in categories marked `is_shared_with_household`)

---

## 12. Future Considerations (Out of Scope for v1)

- Mobile app (React Native) consuming the same REST API
- Budget goals and tracking
- Savings goals
- Bill reminders / notifications
- Bank API integration (Plaid) for automatic transaction import
- Multi-currency support
- Expense splitting between household members
- Head of household transfer
- Export to CSV/PDF
