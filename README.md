# Spendoza

Personal and household finance tracker with AI-powered bank statement processing, expense categorization, and financial insights.

## Overview

Spendoza helps individuals and households track income, expenses, and savings. Upload a bank statement PDF and the AI pipeline extracts transactions, classifies them into categories, and matches them against existing records. Monthly reports with AI-generated insights keep you informed about your financial health.

```mermaid
flowchart TB
    subgraph Client["Frontend (React + Vite)"]
        UI[Dashboard & Pages]
        RQ[TanStack Query]
        SBAuth[Supabase Auth SDK]
    end

    subgraph Server["Backend (Express)"]
        MW[Middleware Layer<br/>Auth · Validation · Rate Limit]
        Routes[Route Handlers]
        Services[Services]
        AI[AI Pipeline<br/>PDF Parse · Classify · Match · Insights]
    end

    subgraph External["External Services"]
        SB[(Supabase<br/>PostgreSQL + Storage + Auth)]
        OAI[OpenAI<br/>GPT-4o-mini]
    end

    UI --> RQ
    RQ --> MW
    SBAuth --> SB
    MW --> Routes
    Routes --> Services
    Services --> SB
    AI --> OAI
    Services --> AI

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
    │   └── src/schemas/      # 9 schema modules
    ├── api/                  # Express backend
    │   └── src/
    │       ├── routes/       # 10 route modules
    │       ├── services/     # Business logic
    │       ├── ai/           # AI pipeline modules
    │       ├── middleware/    # Auth, validation, error handling
    │       └── lib/          # Supabase client
    └── web/                  # React frontend
        └── src/
            ├── pages/        # 10 page components
            ├── components/   # Feature & UI components
            ├── hooks/        # TanStack Query hooks
            ├── contexts/     # Auth context provider
            └── lib/          # API client, Supabase, utilities
```

## Key Features

### Bank Statement AI Pipeline

```mermaid
flowchart LR
    PDF[PDF Upload] --> Extract[Text Extraction<br/><i>pdf-parse</i>]
    Extract --> Parse[Transaction Parsing<br/><i>GPT-4o-mini</i>]
    Parse --> Classify[Categorization<br/><i>GPT-4o-mini</i>]
    Classify --> Match[Record Matching<br/><i>Jaccard Similarity</i>]
    Match --> DB[(Database)]

    style PDF fill:#e3f2fd
    style Extract fill:#fff3e0
    style Parse fill:#fff3e0
    style Classify fill:#fff3e0
    style Match fill:#f3e5f5
    style DB fill:#e8f5e9
```

Upload a bank statement PDF and the pipeline:
1. Extracts raw text from the PDF
2. Uses GPT-4o-mini to identify individual transactions
3. Classifies each transaction into user-defined categories
4. Matches transactions to existing expenses/income records using string similarity and amount proximity

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
- Household reports aggregate shared data only
- Head of household manages invitations and member removal (max 10 members)

### AI-Powered Reports

```mermaid
flowchart LR
    subgraph Data
        Inc[Income Entries]
        Exp[Expenses]
        Prev[Previous Report]
    end

    subgraph Computation
        Totals[Totals & Ratios]
        Categories[Category Breakdown]
        MoM[Month-over-Month]
    end

    subgraph Output
        Report[Report Data]
        Insights[AI Insights<br/><i>GPT-4o-mini</i>]
    end

    Inc --> Totals
    Exp --> Totals
    Exp --> Categories
    Prev --> MoM
    Totals --> Report
    Categories --> Report
    MoM --> Report
    Report --> Insights

    style Insights fill:#fce4ec
```

- Personal and household monthly reports
- Savings rate, expense-to-income ratio, category breakdowns
- Month-over-month trend comparison
- AI-generated bullet-point financial insights
- Rate limited to 2 manual refreshes per month; automated via cron

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

## API Endpoints

| Group | Base Path | Auth | Endpoints |
|-------|-----------|------|-----------|
| Auth | `/api/auth` | Public | signup, login, logout |
| Profile | `/api/profile` | Required | get, update, complete onboarding |
| Categories | `/api/categories` | Required | CRUD |
| Income | `/api/income` | Required | CRUD |
| Expenses | `/api/expenses` | Required | CRUD |
| Bank Statements | `/api/bank-statements` | Required | upload, list, get detail |
| Transactions | `/api/transactions` | Required | list, update, attribute, bulk-attribute |
| Households | `/api/households` | Required | create, get, invite, join, remove, sharing |
| Reports | `/api/reports` | Mixed | personal, household, generate, generate-all (cron) |
| Dashboard | `/api/dashboard` | Required | personal summary, household summary |

## Database Schema

```mermaid
erDiagram
    profiles ||--o| households : "belongs to"
    profiles ||--o{ categories : "owns"
    profiles ||--o{ expenses : "owns"
    profiles ||--o{ income_entries : "owns"
    profiles ||--o{ bank_statements : "uploads"
    bank_statements ||--o{ transactions : "contains"
    categories ||--o{ expenses : "categorizes"
    transactions }o--o| expenses : "matched to"
    transactions }o--o| income_entries : "matched to"
    reports }o--|| profiles : "for user"
    reports }o--|| households : "for household"
    households ||--o{ household_invitations : "has"

    profiles {
        uuid id PK
        string display_name
        boolean onboarding_completed
        uuid household_id FK
        enum income_sharing_mode
        enum expense_sharing_mode
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
    }

    expenses {
        uuid id PK
        uuid user_id FK
        uuid category_id FK
        number amount
        enum frequency
        date next_due_date
    }

    income_entries {
        uuid id PK
        uuid user_id FK
        number amount
        enum frequency
        date effective_date
    }

    bank_statements {
        uuid id PK
        uuid user_id FK
        string file_hash
        enum status
        date statement_month
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
```

## CI/CD

```mermaid
flowchart LR
    subgraph PR["Pull Request"]
        Check[Typecheck + Test]
    end

    subgraph Test["Push to test"]
        TCheck[Typecheck + Test]
        TCheck --> DAPI[Deploy API<br/>to Vercel Test]
        TCheck --> DWeb[Deploy Web<br/>to Vercel Test]
    end

    subgraph Prod["Push to main"]
        PCheck[Typecheck + Test]
        PCheck --> PAPI[Deploy API<br/>to Vercel Prod]
        PCheck --> PWeb[Deploy Web<br/>to Vercel Prod]
    end

    style PR fill:#e3f2fd
    style Test fill:#fff3e0
    style Prod fill:#e8f5e9
```

Three GitHub Actions workflows:
- **PR Check** -- Runs typecheck + test on every pull request
- **Test Deploy** -- On push to `test` branch: checks then deploys both packages to Vercel test environment
- **Prod Deploy** -- On push to `main` branch: checks then deploys to Vercel production

## Git Workflow

1. Create a feature branch from `test`
2. Develop and test locally
3. Push and open a PR against `test` (`gh pr create --base test`)
4. After review, merge to `test` (auto-deploys to test environment)
5. Promote `test` to `main` for production deployment

## Package Documentation

- [`packages/shared/README.md`](packages/shared/README.md) -- Schemas, types, constants, and entity relationships
- [`packages/api/README.md`](packages/api/README.md) -- API endpoints, middleware, AI pipeline, and services
- [`packages/web/README.md`](packages/web/README.md) -- Pages, components, hooks, and data flow
