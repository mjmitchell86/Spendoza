# Spendoza

Personal and household finance tracker with AI-powered bank statement processing, automatic bill detection, goal tracking, debt payoff projections, financial health scoring, and AI-generated insights.

## Overview

Spendoza helps individuals and households take control of their finances. Upload a bank statement (PDF or CSV) and the AI pipeline extracts transactions, classifies them into your categories, detects recurring bills, and matches them against existing records. Set budget and savings goals, track debts with payoff projections, monitor your financial health score, and get AI-generated insights in monthly reports and weekly email digests.

```mermaid
flowchart TB
    subgraph Client["Frontend (React + Vite)"]
        UI[Dashboard & Pages]
        RQ[TanStack Query]
        SBAuth[Supabase Auth SDK]
    end

    subgraph Server["Backend (Express)"]
        MW[Middleware Layer<br/>Auth · Validation · Rate Limit · Tier]
        Routes[Route Handlers]
        Services[Services<br/>Reports · Health Score · Debt Projections<br/>Email · Bill Detection · Income Detection]
        AI[AI Pipeline<br/>PDF Parse · Classify · Match<br/>Bill Detect · Goal Suggestions · Report Insights]
    end

    subgraph External["External Services"]
        SB[(Supabase<br/>PostgreSQL + Storage + Auth)]
        OAI[OpenAI<br/>GPT-4o-mini]
        Stripe[Stripe<br/>Billing & Subscriptions]
        Resend[Resend<br/>Email Delivery]
    end

    UI --> RQ
    RQ --> MW
    SBAuth --> SB
    MW --> Routes
    Routes --> Services
    Services --> SB
    AI --> OAI
    Services --> AI
    Services --> Stripe
    Services --> Resend

    style Client fill:#e3f2fd
    style Server fill:#e8f5e9
    style External fill:#fff3e0
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Bun |
| **Backend** | Express (TypeScript) |
| **Frontend** | React 19, Vite 7 |
| **UI** | shadcn/ui, Tailwind CSS 4, Radix UI |
| **Charts** | Recharts |
| **Data Fetching** | TanStack Query |
| **Validation** | Zod (shared schemas) |
| **AI** | LangChain + OpenAI (GPT-4o-mini) |
| **Database** | Supabase (PostgreSQL + Auth + Storage) |
| **Payments** | Stripe (Checkout, Customer Portal, Webhooks) |
| **Email** | Resend |
| **Build** | Turborepo |
| **Deployment** | Vercel |

## Monorepo Structure

```mermaid
graph TB
    Root["spendoza (root)"]
    Shared["@spendoza/shared"]
    API["@spendoza/api"]
    Web["@spendoza/web"]

    Root --> Shared
    Root --> API
    Root --> Web
    API -->|imports schemas & types| Shared
    Web -->|imports schemas & types| Shared

    style Root fill:#f5f5f5
    style Shared fill:#fff3e0
    style API fill:#e8f5e9
    style Web fill:#e3f2fd
```

```
spendoza/
├── package.json              # Root workspace config
├── turbo.json                # Turborepo task pipeline
├── CLAUDE.md                 # AI assistant instructions
├── .github/workflows/        # CI/CD (PR checks, test deploy, prod deploy)
└── packages/
    ├── shared/               # Zod schemas, types, constants
    │   └── src/schemas/      # 13 schema modules
    ├── api/                  # Express backend
    │   └── src/
    │       ├── routes/       # 18 route modules
    │       ├── services/     # Business logic (reports, health score, debt projections, email, bill/income detection)
    │       ├── ai/           # AI pipeline modules (parser, classifier, matcher, goal suggestions, insights)
    │       ├── middleware/    # Auth, validation, error handling, tier guard, admin guard
    │       └── lib/          # Supabase client, email scheduling, unsubscribe tokens
    └── web/                  # React frontend
        └── src/
            ├── pages/        # 19 page components
            ├── components/   # Feature & UI components
            ├── hooks/        # TanStack Query hooks
            ├── contexts/     # Auth context provider
            └── lib/          # API client, Supabase, utilities
```

## Key Features

### Bank Statement AI Pipeline

```mermaid
flowchart LR
    Upload[PDF / CSV Upload<br/><i>Batch support</i>] --> Extract[Text Extraction<br/><i>pdf-parse or UTF-8</i>]
    Extract --> Parse[Transaction Parsing<br/><i>GPT-4o-mini</i>]
    Parse --> Classify[Categorization<br/><i>GPT-4o-mini</i>]
    Classify --> Match[Record Matching<br/><i>Jaccard Similarity</i>]
    Match --> DB[(Database)]
    Match --> Bills[Bill Detection<br/><i>Pattern Analysis</i>]
    Match --> Income[Income Detection<br/><i>Pattern Analysis</i>]
    Bills --> DB
    Income --> DB
    DB --> Reports[Auto-Generate<br/>Reports]

    style Upload fill:#e3f2fd
    style Extract fill:#fff3e0
    style Parse fill:#fff3e0
    style Classify fill:#fff3e0
    style Match fill:#f3e5f5
    style Bills fill:#fce4ec
    style Income fill:#fce4ec
    style DB fill:#e8f5e9
    style Reports fill:#e8f5e9
```

Upload one or more bank statements -- PDFs or CSVs (batch upload with drag-and-drop support) -- and the pipeline:
1. Extracts raw text from the file (pdf-parse for PDFs, direct UTF-8 read for CSVs)
2. Uses GPT-4o-mini to identify individual transactions (with auto-detected bank name and statement month)
3. Classifies each transaction into user-defined categories
4. Matches transactions to existing expenses/income records using string similarity and amount proximity
5. Deduplicates transactions against existing records (by date, description, amount, and type) to prevent duplicates across uploads
6. Detects recurring bill patterns and creates auto-tracked expenses
7. Detects recurring income sources and creates auto-tracked income entries
8. Auto-generates monthly reports for all months with transaction data
9. Retries failed steps with exponential backoff for resilient processing

Your bank statement is deleted after processing -- only extracted transaction data is stored, never the original file. When uploading CSVs, bank name suggestions from previous uploads are shown for convenience.

### Automatic Bill Detection

```mermaid
flowchart TB
    Txns[12 Months of Transactions] --> Norm[Normalize Descriptions<br/><i>Strip refs, punctuation</i>]
    Norm --> Group[Group by Similarity<br/><i>Jaccard threshold 0.6</i>]
    Group --> Filter{2+ occurrences?<br/>Amounts within 20%?}
    Filter -->|Yes| Detect[Detect Interval<br/><i>Weekly · Biweekly · Monthly<br/>Quarterly · Annually</i>]
    Filter -->|No| Skip[Skip]
    Detect --> Upsert[Upsert Expense<br/><i>Map category · Set next due date</i>]
    Upsert --> Expire{Stale bills?<br/><i>Last seen > 2x interval</i>}
    Expire -->|Yes| End[Set end_date]
    Expire -->|No| Active[Keep active]

    style Txns fill:#e3f2fd
    style Detect fill:#fff3e0
    style Upsert fill:#e8f5e9
    style End fill:#fce4ec
```

After each bank statement upload, the system analyzes all user transactions to:
- Group similar transaction descriptions (e.g., "NETFLIX COM 12345" and "NETFLIX COM 67890")
- Detect recurring patterns with configurable tolerance for amount variation (20%)
- Automatically create or update tracked bills with projected next due dates
- Expire bills that stop appearing (staleness threshold: 2x the billing interval)
- Re-activate previously expired bills when the pattern reappears
- Never modify manually-created expenses

Auto-detected bills appear in the Upcoming Bills dashboard widget and Expenses page with an "Auto" badge. AI-generated friendly names (e.g., "Netflix" instead of "NETFLIX COM 12345") are displayed throughout the UI and PDF exports.

### Automatic Income Detection

The same pattern analysis runs for income transactions:
- Groups similar credit transactions across months
- Detects recurring income patterns (payroll, freelance payments, etc.)
- Creates auto-tracked income entries with friendly names
- Attributes income to household members when applicable

### Financial Goals

```mermaid
flowchart LR
    subgraph Types["Goal Types"]
        Budget[Budget<br/><i>Spending cap per category</i>]
        SavingsAmt[Savings Amount<br/><i>Target $ per month</i>]
        SavingsRate[Savings Rate<br/><i>Target % of income</i>]
        Emergency[Emergency Fund<br/><i>Months of expenses</i>]
        DebtPayoff[Debt Payoff<br/><i>Linked to a debt</i>]
        TargetSavings[Target Savings<br/><i>Cumulative target with deadline</i>]
    end

    subgraph AI["AI-Powered"]
        Suggest[Goal Suggestions<br/><i>Priority waterfall</i>]
    end

    subgraph Tracking["Progress Tracking"]
        Status[Status Indicators<br/><i>On Track · Warning · Over Budget</i>]
        History[Historical Charts<br/><i>Monthly progress bars</i>]
        Log[Manual Savings Log]
    end

    Budget --> Status
    SavingsAmt --> Status
    SavingsRate --> Status
    Emergency --> Status
    DebtPayoff --> Status
    TargetSavings --> Status
    Suggest --> Types
    Status --> History

    style Types fill:#e3f2fd
    style AI fill:#fff3e0
    style Tracking fill:#e8f5e9
```

- **Budget** -- Set spending caps per category and track actual vs. target
- **Savings amount** -- Define a specific dollar amount to save each month
- **Savings rate** -- Target a percentage of income to save
- **Emergency fund** -- Build an emergency fund measured in months of expenses
- **Debt payoff** -- Track payoff progress for a linked debt
- **Target savings** -- Set a cumulative savings target with an optional deadline
- AI-powered goal suggestions with a priority waterfall based on current financial data
- Progress bars with color-coded status indicators
- Historical charts showing month-by-month performance

### Debt Tracking

- Track debts across 7 types: credit card, student loan, mortgage, auto loan, personal loan, medical, other
- Server-side payoff projections with avalanche (highest interest first) and snowball (lowest balance first) strategies
- Interest cost calculations showing total interest paid over the life of each debt
- Extra payment simulation -- see how additional monthly payments accelerate payoff
- Link debts to debt payoff goals for integrated progress tracking
- Personal and household debt support

### Financial Health Score

```mermaid
flowchart LR
    subgraph Factors["5 Scoring Factors"]
        SR[Savings Rate<br/><i>max 25 pts</i>]
        NR[Needs Ratio<br/><i>max 20 pts</i>]
        WR[Wants Ratio<br/><i>max 15 pts</i>]
        EF[Emergency Fund<br/><i>max 20 pts</i>]
        DTI[Debt-to-Income<br/><i>max 20 pts</i>]
    end

    SR --> Score[Composite Score<br/><i>0–100</i>]
    NR --> Score
    WR --> Score
    EF --> Score
    DTI --> Score

    Score --> Rating{Rating}
    Rating -->|80-100| Good[Good]
    Rating -->|60-79| Ok[Ok]
    Rating -->|40-59| Warning[Warning]
    Rating -->|0-39| Critical[Critical]

    style Factors fill:#e3f2fd
    style Score fill:#e8f5e9
    style Good fill:#c8e6c9
    style Ok fill:#fff9c4
    style Warning fill:#ffe0b2
    style Critical fill:#ffcdd2
```

- Composite 0--100 score calculated from 5 weighted factors
- Each factor rated independently: good, ok, warning, or critical
- Displayed as a gauge widget on the dashboard
- Included in PDF report exports
- Recalculated with each report generation

### Spending Allocation (50/30/20)

- Categories auto-classified as needs, wants, savings, or other via the `budget_class` column
- Actual spending compared against the 50/30/20 benchmark (50% needs, 30% wants, 20% savings)
- Visual allocation bar on the dashboard and in PDF exports
- Breakdown included in monthly report data

### Household Finance Sharing

```mermaid
flowchart TB
    HH[Household]
    H[Head of Household]
    M1[Member 1]
    M2[Member 2]

    HH --> H
    HH --> M1
    HH --> M2

    H -->|"income: all<br/>expenses: all"| Pool[Shared Pool]
    M1 -->|"income: partial<br/>expenses: category"| Pool
    M2 -->|"income: none<br/>expenses: none"| Private[Private Only]

    Pool --> HHReport[Household Report]
    Private -.->|excluded| HHReport

    style HH fill:#e3f2fd
    style Pool fill:#e8f5e9
    style HHReport fill:#fff3e0
```

- Create or join a household via invite code
- Each member configures sharing preferences (all, none, partial/category)
- Household dashboard shows aggregate finances and member contributions
- Household reports aggregate shared data only
- Head of household manages invitations and member removal (max 10 members)
- Ownership transfer -- head of household can transfer control to another member
- Members can leave a household (ownership auto-transfers if head leaves)
- Income attribution -- track income from non-household sources with custom names (e.g., roommate contributions)

### AI-Powered Reports

```mermaid
flowchart LR
    subgraph Data
        Txns[Transactions]
        Inc[Income Entries]
        Exp[Expenses]
        Debts[Debts]
        Prev[Previous Report]
    end

    subgraph Computation
        Totals[Totals & Ratios]
        Categories[Category Breakdown]
        Allocation[Spending Allocation<br/><i>50/30/20</i>]
        Health[Health Score]
        DebtSum[Debt Summary]
        MoM[Month-over-Month]
    end

    subgraph Output
        Report[Report Data]
        Insights[Insights<br/><i>GPT-4o-mini</i>]
    end

    Txns --> Totals
    Inc --> Totals
    Exp --> Totals
    Exp --> Categories
    Exp --> Allocation
    Debts --> DebtSum
    Debts --> Health
    Totals --> Health
    Prev --> MoM
    Totals --> Report
    Categories --> Report
    Allocation --> Report
    Health --> Report
    DebtSum --> Report
    MoM --> Report
    Report --> Insights

    style Insights fill:#fce4ec
```

- Personal and household monthly reports
- Savings rate, expense-to-income ratio, category breakdowns
- Spending allocation breakdown (needs / wants / savings vs. 50/30/20 benchmark)
- Outstanding debt summary with payoff projections
- Financial health score (0--100)
- Month-over-month trend comparison
- AI-generated bullet-point financial insights
- Auto-generated after bank statement processing and during onboarding
- Rate limited to 2 manual refreshes per 24 hours in production; automated via cron

### PDF Export

Download comprehensive PDF reports from both personal and household dashboards:

| Section | Contents |
|---------|----------|
| **Financial Health Score** | Gauge visualization of composite 0--100 score |
| **Financial Summary** | Total income, expenses, net, savings rate |
| **Spending Allocation** | Needs / wants / savings bar vs. 50/30/20 benchmark |
| **Month-over-Month Trends** | Income and expense percentage changes |
| **Insights** | AI-generated bullet-point financial analysis |
| **Expense Breakdown** | Category-by-category spending table with percentages |
| **Outstanding Debts** | Debt balances, interest rates, and minimum payments |
| **Recurring Bills** | All tracked bills with amounts, frequency, and next due dates |
| **Income Sources** | All income entries with frequency and household attribution |
| **Subscriptions Paid** | Active recurring expenses for the month with total cost and % of expenses |
| **Goal Progress** | Visual progress bars for each goal with on-track/behind status |
| **Savings Opportunities** | Data-driven recommendations for high-spend categories, subscription burden, and savings rate gaps |
| **Member Contributions** | Per-member income and expense totals (household reports only) |

### Dashboard

The personal dashboard provides an at-a-glance financial overview with a global time period filter that persists across navigation:

| Widget | Description |
|--------|-------------|
| **Health Score** | Financial health gauge (0--100) with factor breakdown |
| **Summary Cards** | Total income, expenses, savings rate, net position |
| **Spending Allocation** | Needs / wants / savings bar vs. 50/30/20 benchmark |
| **Income vs Expenses** | Bar chart comparing monthly totals |
| **Spending by Category** | Donut chart with category breakdown |
| **Top Expenses** | Horizontal bar chart of highest spending categories |
| **Upcoming Bills** | Recurring bills with due dates and auto-detection badges |
| **Insights** | Personalized financial observations from GPT-4o-mini |
| **Export PDF** | Download a comprehensive monthly report as PDF |

### Global Time Period Filter

A persistent time period filter is available across dashboards, transactions, income, and expenses pages:
- Presets: This Month, Last Month, Last 3 Months, This Year, Last Year, All Time
- Specific month selection via `month:YYYY-MM` format
- Smart auto-detection defaults to the most recent month with data
- Filter state persists in the URL across page navigation

### Email Reports

- Weekly scheduled email reports with PDF attachments delivered via Resend
- Users configure preferred day and time in their profile settings
- Emails include a summary of the latest monthly report with a link to the full dashboard
- One-click unsubscribe via tokenized links
- Dispatched by cron job with deduplication to prevent duplicate sends

### Subscription Tiers

| Feature | Free | Starter | Pro |
|---------|------|---------|-----|
| Bank statement uploads | 2/month | Unlimited | Unlimited |
| AI categorization | -- | Yes | Yes |
| Email reports | -- | Yes | Yes |
| Goals & debts | -- | Yes | Yes |
| Household features | -- | -- | Yes |
| Plaid integration | -- | -- | Yes |

- Managed via Stripe Checkout and Customer Portal
- Subscription status synced in real-time via Stripe webhooks
- Tier enforcement via `requireTier` middleware on protected routes
- In development (no `STRIPE_SECRET_KEY`), all users default to Pro tier

### Admin Dashboard

- **Stats overview** -- Total users, active users, statement uploads, LLM token usage
- **User trends** -- Signups and activity over time
- **User management** -- View all users with subscription tier, last active date, and admin controls
- Protected by `requireAdmin` middleware (based on `is_admin` column on profiles)

### Guided Onboarding

```mermaid
flowchart LR
    Welcome[Welcome] --> Upload[Upload Statement<br/><i>or skip</i>]
    Upload --> Process[Processing<br/><i>AI pipeline runs</i>]
    Process --> Review[Review<br/>Transactions]
    Review --> House[Household<br/><i>Create or join</i>]
    House --> Done[Complete]

    style Welcome fill:#e3f2fd
    style Process fill:#fff3e0
    style Done fill:#e8f5e9
```

New users are guided through a multi-step onboarding flow:
1. Welcome introduction
2. Bank statement upload -- PDF or CSV (skippable)
3. AI processing with real-time progress
4. Review parsed and categorized transactions
5. Create or join a household (optional)
6. Setup complete

### Additional Features

- **Dark mode** -- System, light, and dark themes with full chart support
- **Profile management** -- Avatar upload, display name editing
- **Transaction browser** -- Filter by type, time period, and description search with global time period context
- **Category management** -- Create, edit, delete, and share categories with household
- **Batch bank statement upload** -- Drag-and-drop multiple PDFs or CSVs with per-file status tracking and sequential processing
- **Transaction deduplication** -- Automatic dedup across uploads prevents duplicate transactions when re-uploading or uploading overlapping statements
- **Invite code registration** -- Gated signup via invite codes (max 3 active codes per user)
- **Privacy-first design** -- Bank statements are deleted after processing; only extracted data is stored
- **Responsive design** -- Mobile-friendly layout across all pages

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.3+
- A [Supabase](https://supabase.com) project (PostgreSQL + Auth + Storage)
- An [OpenAI API key](https://platform.openai.com)

### Installation

```bash
git clone https://github.com/mjmitchell86/Spendoza.git
cd Spendoza
bun install
```

### Environment Variables

Create `.env` files in the relevant packages:

**packages/api/.env**
```env
PORT=3001
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
OPENAI_API_KEY=sk-...
CRON_SECRET=your-cron-secret
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
```

**packages/web/.env**
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Development

```bash
bun run dev        # Start all packages in dev mode (Turborepo)
bun run build      # Build all packages
bun run test       # Run all tests
bun run typecheck  # Type-check all packages
bun run lint       # Lint all packages
bun run format     # Format with Prettier
```

Per-package development:

```bash
cd packages/api && bun run dev    # API server only (port 3001)
cd packages/web && bun run dev    # Vite dev server only (port 5173)
```

Seed a test user with 6 months of realistic mock bank data:

```bash
cd packages/api && bun run seed   # Creates test user with transactions from 3 banks
```

## API Endpoints

| Group | Base Path | Auth | Endpoints |
|-------|-----------|------|-----------|
| Health | `/api/health` | Public | health check |
| Auth | `/api/auth` | Public | signup, login, logout, waitlist |
| Profile | `/api/profile` | Required | get, update, complete onboarding, upload avatar |
| Billing | `/api/billing` | Required | checkout, portal, subscription |
| Categories | `/api/categories` | Required | CRUD |
| Income | `/api/income` | Required | CRUD |
| Expenses | `/api/expenses` | Required | CRUD (auto-filters expired bills) |
| Bank Statements | `/api/bank-statements` | Required | upload, list, get detail, reprocess |
| Transactions | `/api/transactions` | Required | list, update, attribute, bulk-attribute |
| Households | `/api/households` | Required + Pro | create, get, invite, join, remove, sharing, transfer ownership, leave |
| Invite Codes | `/api/invite-codes` | Required | create, list, delete (max 3 active per user) |
| Reports | `/api/reports` | Mixed | personal, household, generate, generate-all (cron), export/personal (PDF), export/household (PDF) |
| Dashboard | `/api/dashboard` | Required | personal summary, household summary |
| Goals | `/api/goals` | Required + Starter | CRUD, progress tracking, log savings, AI suggestions |
| Debts | `/api/debts` | Required + Starter | CRUD, payoff projections (avalanche & snowball) |
| Emails | `/api/emails` | Mixed | dispatch (cron), send, unsubscribe (public) |
| Internal | `/api/internal` | CRON_SECRET | pipeline processing |
| Webhooks | `/api/webhooks` | Public (Stripe signature) | Stripe webhook handler |
| Admin | `/api/admin` | Required + Admin | stats, trends, user management |

## Database Schema

```mermaid
erDiagram
    profiles ||--o| households : "belongs to"
    profiles ||--o{ categories : "owns"
    profiles ||--o{ expenses : "owns"
    profiles ||--o{ income_entries : "owns"
    profiles ||--o{ bank_statements : "uploads"
    profiles ||--o{ goals : "owns"
    profiles ||--o{ debts : "owns"
    profiles ||--o| subscriptions : "has"
    bank_statements ||--o{ transactions : "contains"
    categories ||--o{ expenses : "categorizes"
    categories ||--o{ goals : "tracks"
    transactions }o--o| expenses : "matched to"
    transactions }o--o| income_entries : "matched to"
    reports }o--|| profiles : "for user"
    reports }o--|| households : "for household"
    households ||--o{ household_invitations : "has"
    goals }o--o| debts : "pays off"

    profiles {
        uuid id PK
        string display_name
        string avatar_url
        boolean onboarding_completed
        uuid household_id FK
        enum income_sharing_mode
        enum expense_sharing_mode
        string theme_preference
        enum subscription_tier
        boolean is_admin
        boolean disabled
        boolean email_reports_enabled
        string timezone
    }

    households {
        uuid id PK
        string name
        uuid head_of_household_id FK
        string invite_code
    }

    categories {
        uuid id PK
        uuid user_id FK
        string name
        boolean is_system_default
        enum budget_class
    }

    expenses {
        uuid id PK
        uuid user_id FK
        uuid category_id FK
        number amount
        enum frequency
        enum recurrence_interval
        date next_due_date
        date end_date
        boolean auto_detected
        timestamp last_seen_at
        string friendly_name
    }

    income_entries {
        uuid id PK
        uuid user_id FK
        number amount
        enum frequency
        date effective_date
        string attributed_to_name
    }

    bank_statements {
        uuid id PK
        uuid user_id FK
        string file_hash
        string file_type
        enum status
        date statement_month
        string bank_name
    }

    transactions {
        uuid id PK
        uuid bank_statement_id FK
        uuid user_id FK
        number amount
        enum type
        string ai_category
    }

    reports {
        uuid id PK
        enum entity_type
        uuid entity_id
        date report_month
        json report_data
        string ai_insights
    }

    goals {
        uuid id PK
        uuid user_id FK
        uuid category_id FK
        uuid debt_id FK
        enum type
        number target_amount
        date target_date
    }

    debts {
        uuid id PK
        uuid user_id FK
        enum entity_type
        uuid entity_id
        string name
        enum debt_type
        number original_balance
        number current_balance
        number interest_rate
        number minimum_payment
        integer due_date_day
    }

    subscriptions {
        uuid id PK
        uuid user_id FK
        string stripe_customer_id
        string stripe_subscription_id
        enum tier
        enum status
        timestamp current_period_end
        boolean cancel_at_period_end
    }

    llm_usage_log {
        uuid id PK
        uuid user_id FK
        string model
        integer input_tokens
        integer output_tokens
        string operation
        timestamp created_at
    }
```

## CI/CD

```mermaid
flowchart LR
    subgraph PR["Pull Request"]
        Check[Typecheck + Test]
    end

    subgraph Test["Push to test"]
        TCheck[Typecheck + Test]
        TCheck --> TMigrate[Run Migrations]
        TMigrate --> DAPI[Deploy API<br/>to Vercel Test]
        TMigrate --> DWeb[Deploy Web<br/>to Vercel Test]
    end

    subgraph Prod["Push to main"]
        PCheck[Typecheck + Test]
        PCheck --> PMigrate[Run Migrations]
        PMigrate --> PAPI[Deploy API<br/>to Vercel Prod]
        PMigrate --> PWeb[Deploy Web<br/>to Vercel Prod]
    end

    style PR fill:#e3f2fd
    style Test fill:#fff3e0
    style Prod fill:#e8f5e9
```

Three GitHub Actions workflows:
- **PR Check** -- Runs typecheck + test on every pull request
- **Test Deploy** -- On push to `test` branch: checks, runs Supabase migrations, then deploys both packages to Vercel test environment
- **Prod Deploy** -- On push to `main` branch: checks, runs Supabase migrations, then deploys to Vercel production

## Git Workflow

```mermaid
flowchart LR
    Feature["feat/branch"] -->|PR| Test[test branch]
    Test -->|auto-deploy| TestEnv[Test Environment]
    Test -->|promote| Main[main branch]
    Main -->|auto-deploy| Prod[Production]

    style Feature fill:#e3f2fd
    style Test fill:#fff3e0
    style Main fill:#e8f5e9
    style Prod fill:#e8f5e9
```

1. Create a feature branch from `test`
2. Develop and test locally
3. Push and open a PR against `test` (`gh pr create --base test`)
4. After review, merge to `test` (auto-deploys to test environment)
5. Promote `test` to `main` for production deployment

## Monthly Cost Breakdown

_Last updated: February 2026_

### Fixed Costs

| Service | Plan | Monthly Cost | Notes |
|---------|------|-------------|-------|
| **Vercel** | Pro | $20 | Hosting for 4 projects (web + API, test + prod) |
| **Supabase** | Pro (x2) | $50 | Test and prod databases ($25/project) |
| **Resend** | Free | $0 | Email delivery (3,000 emails/mo free tier) |
| **Claude** | Max 5x | $100 | AI-assisted development |
| **Domain** | spendoza.io | ~$4 | ~$50/year for .io domain |
| | | **$174** | |

### Variable / Usage-Based Costs

| Service | Usage | Est. Monthly Cost |
|---------|-------|-------------------|
| **OpenAI (gpt-5-mini)** | Bank statement parsing, classification, insights, goal suggestions, friendly name generation | $1--5 |
| **Vercel** | Serverless function execution beyond included credits | $0--5 |
| **Supabase** | Storage and bandwidth overages | $0--5 |
| | | **$1--15** |

### Estimated Total: ~$175--185/mo

> **Cost optimization note:** Pausing the test Supabase project when not actively developing saves $25/mo. OpenAI usage is negligible at low user counts -- gpt-5-mini costs $0.25/1M input tokens and $2.00/1M output tokens.

## Package Documentation

- [`packages/shared/README.md`](packages/shared/README.md) -- Schemas, types, constants, and entity relationships
- [`packages/api/README.md`](packages/api/README.md) -- API endpoints, middleware, AI pipeline, and services
- [`packages/web/README.md`](packages/web/README.md) -- Pages, components, hooks, and data flow
