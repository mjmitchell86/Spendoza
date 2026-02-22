# Spendoza Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a full-stack personal and household finance tracker with AI-powered bank statement parsing, deployed to Vercel with Supabase backend.

**Architecture:** Bun workspaces monorepo with Turborepo orchestration. Express API (packages/api) serves a REST API consumed by a Vite React SPA (packages/web). Shared types and Zod schemas live in packages/shared. Supabase provides auth, Postgres, storage, and cron. LangChain + OpenAI handle bank statement parsing and report insights.

**Tech Stack:** Bun, Express, React, Vite, TypeScript, shadcn/ui, Tailwind CSS, Recharts, TanStack Query, Zod, LangChain, OpenAI, Supabase, Turborepo, Vercel, GitHub Actions

**Design Doc:** `docs/plans/2026-02-22-spendoza-design.md`

---

## Phase 1: Monorepo Scaffolding & Tooling

### Task 1: Initialize monorepo root

**Files:**
- Create: `package.json`
- Create: `turbo.json`
- Create: `.gitignore`
- Create: `tsconfig.base.json`
- Create: `.prettierrc`
- Create: `.eslintrc.json`
- Create: `CLAUDE.md`

**Step 1: Initialize Bun workspace root**

```bash
bun init -y
```

**Step 2: Configure package.json as workspace root**

```json
{
  "name": "spendoza",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "turbo": "^2",
    "prettier": "^3",
    "typescript": "^5"
  }
}
```

**Step 3: Configure Turborepo**

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

**Step 4: Create base tsconfig**

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

**Step 5: Create .gitignore**

```
node_modules/
dist/
.turbo/
.env
.env.local
.env.*.local
*.log
.DS_Store
.vercel
```

**Step 6: Install dependencies**

```bash
bun install
```

**Step 7: Create CLAUDE.md**

Write project conventions, tech stack summary, and common commands.

**Step 8: Commit**

```bash
git add -A
git commit -m "chore: initialize monorepo with Bun workspaces and Turborepo"
```

---

### Task 2: Scaffold shared package

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`

**Step 1: Create package structure**

```bash
mkdir -p packages/shared/src
```

**Step 2: Create package.json**

```json
{
  "name": "@spendoza/shared",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "echo 'no lint configured yet'"
  },
  "dependencies": {
    "zod": "^3"
  }
}
```

**Step 3: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

**Step 4: Create src/index.ts with placeholder export**

```typescript
export const SPENDOZA_VERSION = "0.0.1";
```

**Step 5: Install deps and commit**

```bash
bun install
git add packages/shared
git commit -m "chore: scaffold shared package"
```

---

### Task 3: Scaffold API package

**Files:**
- Create: `packages/api/package.json`
- Create: `packages/api/tsconfig.json`
- Create: `packages/api/src/index.ts`
- Create: `packages/api/.env.example`

**Step 1: Create package structure**

```bash
mkdir -p packages/api/src/{routes,services,middleware,ai}
mkdir -p packages/api/supabase/migrations
```

**Step 2: Create package.json**

```json
{
  "name": "@spendoza/api",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target node",
    "start": "bun dist/index.js",
    "typecheck": "tsc --noEmit",
    "lint": "echo 'no lint configured yet'",
    "test": "bun test"
  },
  "dependencies": {
    "@spendoza/shared": "workspace:*",
    "@supabase/supabase-js": "^2",
    "express": "^4",
    "cors": "^2",
    "helmet": "^8",
    "express-rate-limit": "^7",
    "zod": "^3",
    "langchain": "^0.3",
    "@langchain/openai": "^0.3",
    "@langchain/community": "^0.3"
  },
  "devDependencies": {
    "@types/express": "^4",
    "@types/cors": "^2",
    "typescript": "^5"
  }
}
```

**Step 3: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

**Step 4: Create minimal Express server**

```typescript
// packages/api/src/index.ts
import express from "express";
import cors from "cors";
import helmet from "helmet";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Spendoza API running on port ${PORT}`);
});

export default app;
```

**Step 5: Create .env.example**

```
PORT=3001
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
OPENAI_API_KEY=
```

**Step 6: Install deps and verify**

```bash
bun install
cd packages/api && bun run dev
# Verify GET http://localhost:3001/api/health returns { status: "ok" }
# Ctrl+C to stop
```

**Step 7: Commit**

```bash
git add packages/api .gitignore
git commit -m "chore: scaffold API package with Express + health endpoint"
```

---

### Task 4: Scaffold web package

**Files:**
- Create: `packages/web/` (via Vite scaffolding)
- Modify: `packages/web/package.json` (add workspace dep)
- Modify: `packages/web/vite.config.ts` (add API proxy)

**Step 1: Scaffold Vite React app**

```bash
cd packages && bun create vite web --template react-ts
cd web && bun install
```

**Step 2: Add workspace dependency to shared**

Add to `packages/web/package.json` dependencies:
```json
"@spendoza/shared": "workspace:*"
```

**Step 3: Install Tailwind CSS and shadcn/ui prerequisites**

```bash
cd packages/web
bun add tailwindcss @tailwindcss/vite
bun add -D @types/node
```

Set up Tailwind per shadcn/ui docs for Vite: update `vite.config.ts`, add `@import "tailwindcss"` to CSS, configure path aliases.

**Step 4: Initialize shadcn/ui**

```bash
bunx shadcn@latest init
```

Select: New York style, Zinc base color, CSS variables.

**Step 5: Add TanStack Query and React Router**

```bash
bun add @tanstack/react-query react-router-dom
bun add -D @tanstack/react-query-devtools
```

**Step 6: Add Recharts**

```bash
bun add recharts
```

**Step 7: Add Supabase client**

```bash
bun add @supabase/supabase-js
```

**Step 8: Configure API proxy in vite.config.ts**

```typescript
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
```

**Step 9: Set up basic App.tsx with providers**

```typescript
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-background text-foreground">
          <h1 className="text-2xl font-bold p-8">Spendoza</h1>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
```

**Step 10: Verify dev server runs**

```bash
cd packages/web && bun run dev
# Visit http://localhost:5173, confirm "Spendoza" heading renders
```

**Step 11: Commit**

```bash
git add packages/web
git commit -m "chore: scaffold web package with Vite, React, shadcn/ui, TanStack Query"
```

---

## Phase 2: Supabase Setup & Database Schema

### Task 5: Create Supabase projects

**This task is manual / uses Supabase MCP tools.**

**Step 1: Create two Supabase projects**

- `spendoza-test` (test environment)
- `spendoza-prod` (production environment)

Use the Supabase MCP `create_project` tool or Supabase dashboard.

**Step 2: Record project credentials**

For each project, store in `.env.local` files:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Create `packages/api/.env` (gitignored) with test project credentials for local dev.
Create `packages/web/.env` (gitignored) with test project SUPABASE_URL and SUPABASE_ANON_KEY.

**Step 3: Commit env examples**

```bash
git add packages/api/.env.example packages/web/.env.example
git commit -m "chore: add env examples for Supabase credentials"
```

---

### Task 6: Create database schema migration — core tables

**Files:**
- Create: `packages/api/supabase/migrations/00001_initial_schema.sql`

**Step 1: Write the migration SQL**

This migration creates all core tables with enums, constraints, RLS policies, triggers, and default category seeding. See the design doc (Section 4) for the full schema. Key elements:

- Custom enums: `income_sharing_mode`, `expense_sharing_mode`, `frequency_type`, `expense_frequency`, `recurrence_interval`, `invitation_status`, `statement_status`, `transaction_type`, `entity_type`
- Tables: `profiles`, `households`, `household_invitations`, `categories`, `income_entries`, `expenses`, `bank_statements`, `transactions`, `reports`, `report_requests`
- Auto-create profile on auth.users insert (trigger)
- Seed default categories on profile creation (trigger)
- Household member count limit trigger (max 10)
- RLS policies on all tables
- `UNIQUE(user_id, file_hash)` on bank_statements
- Indexes on foreign keys and common query patterns

**Step 2: Apply migration to test project**

```bash
# Using Supabase MCP apply_migration tool against test project
```

**Step 3: Verify tables exist**

```bash
# Using Supabase MCP list_tables tool
```

**Step 4: Commit**

```bash
git add packages/api/supabase/migrations/
git commit -m "feat: add initial database schema migration"
```

---

### Task 7: Create Supabase storage bucket and RLS

**Step 1: Create storage bucket via migration or Supabase dashboard**

Create bucket `bank-statements` with:
- Public: false
- File size limit: 10MB
- Allowed MIME types: `application/pdf`

**Step 2: Add storage RLS policies**

```sql
-- Users can upload to their own folder
CREATE POLICY "Users can upload own statements"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'bank-statements' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Users can read their own files
CREATE POLICY "Users can read own statements"
ON storage.objects FOR SELECT
USING (bucket_id = 'bank-statements' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Users can delete their own files
CREATE POLICY "Users can delete own statements"
ON storage.objects FOR DELETE
USING (bucket_id = 'bank-statements' AND (storage.foldername(name))[1] = auth.uid()::text);
```

**Step 3: Commit**

```bash
git add packages/api/supabase/migrations/
git commit -m "feat: add bank-statements storage bucket with RLS"
```

---

### Task 8: Set up pg_cron for monthly report generation

**Step 1: Enable pg_cron extension**

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

**Step 2: Create cron job**

```sql
-- Fire on the 1st of every month at 2:00 AM UTC
SELECT cron.schedule(
  'monthly-report-generation',
  '0 2 1 * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.api_base_url') || '/api/reports/generate-all',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret')
    ),
    body := jsonb_build_object('triggered_by', 'pg_cron')
  );
  $$
);
```

Note: This uses `pg_net` extension (bundled with Supabase) to make HTTP calls. The `cron_secret` is a shared secret between the cron job and the API for authentication.

**Step 3: Commit**

```bash
git add packages/api/supabase/migrations/
git commit -m "feat: add pg_cron job for monthly report generation"
```

---

## Phase 3: Shared Types & Validation Schemas

### Task 9: Define shared Zod schemas and TypeScript types

**Files:**
- Create: `packages/shared/src/schemas/profile.ts`
- Create: `packages/shared/src/schemas/household.ts`
- Create: `packages/shared/src/schemas/category.ts`
- Create: `packages/shared/src/schemas/income.ts`
- Create: `packages/shared/src/schemas/expense.ts`
- Create: `packages/shared/src/schemas/bank-statement.ts`
- Create: `packages/shared/src/schemas/transaction.ts`
- Create: `packages/shared/src/schemas/report.ts`
- Create: `packages/shared/src/schemas/index.ts`
- Create: `packages/shared/src/constants.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Create constants**

```typescript
// packages/shared/src/constants.ts
export const MAX_HOUSEHOLD_MEMBERS = 10;
export const MAX_MANUAL_REPORTS_PER_MONTH = 2;
export const MAX_BANK_STATEMENT_SIZE_MB = 10;

export const SYSTEM_CATEGORIES = [
  "Housing", "Utilities", "Groceries", "Transportation",
  "Healthcare", "Insurance", "Entertainment", "Dining Out",
  "Personal", "Savings", "Debt Payments", "Subscriptions", "Other"
] as const;
```

**Step 2: Create Zod schemas for each entity**

Each schema file exports:
- A creation schema (for API input validation)
- An update schema (partial of creation)
- An output type (inferred from Zod)

Example for expenses:

```typescript
// packages/shared/src/schemas/expense.ts
import { z } from "zod";

export const expenseFrequency = z.enum(["one_time", "recurring"]);
export const recurrenceInterval = z.enum(["weekly", "biweekly", "monthly", "quarterly", "annually"]);

export const createExpenseSchema = z.object({
  category_id: z.string().uuid(),
  description: z.string().min(1).max(500),
  amount: z.number().positive(),
  frequency: expenseFrequency,
  recurrence_interval: recurrenceInterval.nullable().optional(),
  next_due_date: z.string().date(),
  end_date: z.string().date().nullable().optional(),
});

export const updateExpenseSchema = createExpenseSchema.partial();

export type CreateExpense = z.infer<typeof createExpenseSchema>;
export type UpdateExpense = z.infer<typeof updateExpenseSchema>;
```

Follow this pattern for all entities. Include attribution fields (`attributed_to_user_id`) in income and transaction schemas.

**Step 3: Create barrel export**

```typescript
// packages/shared/src/index.ts
export * from "./schemas/index";
export * from "./constants";
```

**Step 4: Run typecheck**

```bash
cd packages/shared && bun run typecheck
```

**Step 5: Commit**

```bash
git add packages/shared/
git commit -m "feat: add shared Zod schemas, types, and constants"
```

---

## Phase 4: API Foundation

### Task 10: Supabase client setup and auth middleware

**Files:**
- Create: `packages/api/src/lib/supabase.ts`
- Create: `packages/api/src/middleware/auth.ts`
- Modify: `packages/api/src/index.ts`

**Step 1: Write test for auth middleware**

```typescript
// packages/api/src/middleware/__tests__/auth.test.ts
import { describe, it, expect } from "bun:test";
// Test that middleware rejects requests without Authorization header
// Test that middleware rejects invalid tokens
// Test that middleware attaches user to request on valid token
```

**Step 2: Run test to verify it fails**

```bash
cd packages/api && bun test src/middleware/__tests__/auth.test.ts
```

**Step 3: Create Supabase client helper**

```typescript
// packages/api/src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export function createSupabaseClient(accessToken: string) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    }
  );
}
```

**Step 4: Implement auth middleware**

```typescript
// packages/api/src/middleware/auth.ts
import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase";

export interface AuthenticatedRequest extends Request {
  user: { id: string; email: string };
  accessToken: string;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authorization header" });
  }

  const token = authHeader.split(" ")[1];
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  (req as AuthenticatedRequest).user = { id: user.id, email: user.email! };
  (req as AuthenticatedRequest).accessToken = token;
  next();
}
```

**Step 5: Run tests to verify they pass**

```bash
cd packages/api && bun test
```

**Step 6: Wire middleware into Express app**

Update `packages/api/src/index.ts` to import CORS origins from env, set up rate limiting, and prepare route mounting.

**Step 7: Commit**

```bash
git add packages/api/src/
git commit -m "feat: add Supabase client and auth middleware"
```

---

### Task 11: Zod validation middleware

**Files:**
- Create: `packages/api/src/middleware/validate.ts`

**Step 1: Write validation middleware**

```typescript
// packages/api/src/middleware/validate.ts
import type { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: "Validation failed",
          details: error.errors,
        });
      }
      next(error);
    }
  };
}
```

**Step 2: Commit**

```bash
git add packages/api/src/middleware/validate.ts
git commit -m "feat: add Zod validation middleware"
```

---

## Phase 5: Auth Routes

### Task 12: Auth routes (signup, login, logout)

**Files:**
- Create: `packages/api/src/routes/auth.ts`
- Test: `packages/api/src/routes/__tests__/auth.test.ts`

**Step 1: Write tests for auth routes**

Test signup with valid email/password returns 201 + user.
Test signup with invalid email returns 400.
Test login with valid credentials returns 200 + session.
Test login with wrong password returns 401.
Test logout returns 200.

**Step 2: Run tests to verify they fail**

**Step 3: Implement auth routes**

```typescript
// packages/api/src/routes/auth.ts
import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { validate } from "../middleware/validate";
import { signupSchema, loginSchema } from "@spendoza/shared";

const router = Router();

router.post("/signup", validate(signupSchema), async (req, res) => {
  const { email, password, display_name } = req.body;
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name },
  });
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ user: data.user });
});

router.post("/login", validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: error.message });
  res.json({ session: data.session, user: data.user });
});

router.post("/logout", async (req, res) => {
  // Client-side token invalidation; server is stateless
  res.json({ message: "Logged out" });
});

export default router;
```

**Step 4: Mount auth routes in index.ts**

```typescript
import authRoutes from "./routes/auth";
app.use("/api/auth", authRoutes);
```

**Step 5: Run tests, verify pass**

**Step 6: Commit**

```bash
git add packages/api/src/routes/
git commit -m "feat: add auth routes (signup, login, logout)"
```

---

## Phase 6: Profile & Categories CRUD

### Task 13: Profile routes

**Files:**
- Create: `packages/api/src/routes/profile.ts`
- Test: `packages/api/src/routes/__tests__/profile.test.ts`

Implement:
- `GET /api/profile` — get authenticated user's profile
- `PUT /api/profile` — update display_name, sharing preferences
- `PUT /api/profile/onboarding` — mark onboarding complete

All routes use `requireAuth` middleware. Profile is auto-created by DB trigger on signup.

**Step 1-5: TDD cycle** (write test, verify fail, implement, verify pass, commit)

---

### Task 14: Categories CRUD routes

**Files:**
- Create: `packages/api/src/routes/categories.ts`
- Test: `packages/api/src/routes/__tests__/categories.test.ts`

Implement:
- `GET /api/categories` — list user's categories (system defaults + custom)
- `POST /api/categories` — create custom category
- `PUT /api/categories/:id` — update (name, icon, is_shared_with_household)
- `DELETE /api/categories/:id` — delete (only custom, not system defaults)

**Step 1-5: TDD cycle**

---

## Phase 7: Income & Expenses CRUD

### Task 15: Income routes

**Files:**
- Create: `packages/api/src/routes/income.ts`
- Test: `packages/api/src/routes/__tests__/income.test.ts`

Implement:
- `GET /api/income` — list income entries (includes entries attributed to this user by others)
- `POST /api/income` — create income entry (with optional `attributed_to_user_id`)
- `PUT /api/income/:id` — update income entry (attributed user can also edit)
- `DELETE /api/income/:id` — delete (only owner)

Income attribution validation: `attributed_to_user_id` must be a member of the same household.

**Step 1-5: TDD cycle**

---

### Task 16: Expenses routes

**Files:**
- Create: `packages/api/src/routes/expenses.ts`
- Test: `packages/api/src/routes/__tests__/expenses.test.ts`

Implement:
- `GET /api/expenses` — list expenses (filterable by category, frequency, date range)
- `POST /api/expenses` — create expense
- `PUT /api/expenses/:id` — update expense
- `DELETE /api/expenses/:id` — delete expense

**Step 1-5: TDD cycle**

---

## Phase 8: Bank Statement Upload & AI Pipeline

### Task 17: Bank statement upload route

**Files:**
- Create: `packages/api/src/routes/bank-statements.ts`
- Create: `packages/api/src/services/bank-statement.service.ts`
- Test: `packages/api/src/routes/__tests__/bank-statements.test.ts`

Implement:
- `POST /api/bank-statements/upload` — accept PDF, compute SHA-256 hash, check for duplicates, upload to Supabase Storage at `{user_id}/statements/{filename}`, create bank_statements record with status 'uploaded'. Accepts `is_shared_account` boolean and `account_label` string.
- `GET /api/bank-statements` — list user's bank statements
- `GET /api/bank-statements/:id` — get statement with parsed transactions
- `POST /api/bank-statements/:id/reprocess` — re-trigger AI parsing

Upload flow:
1. Receive multipart/form-data with PDF file + metadata (bank_name, statement_month, is_shared_account, account_label)
2. Compute SHA-256 of file buffer
3. Check `UNIQUE(user_id, file_hash)` — return 409 if duplicate
4. Upload to Supabase Storage
5. Insert bank_statements row with status 'uploaded'
6. Trigger async AI processing (Task 18)
7. Return 201 with statement ID

**Step 1-5: TDD cycle**

---

### Task 18: AI pipeline — PDF extraction and transaction parsing

**Files:**
- Create: `packages/api/src/ai/pdf-parser.ts`
- Create: `packages/api/src/ai/transaction-classifier.ts`
- Create: `packages/api/src/ai/expense-matcher.ts`
- Create: `packages/api/src/services/ai-pipeline.service.ts`
- Test: `packages/api/src/ai/__tests__/pdf-parser.test.ts`
- Test: `packages/api/src/ai/__tests__/transaction-classifier.test.ts`

**Step 1: PDF text extraction**

Use LangChain's PDF loader to extract text from the bank statement PDF downloaded from Supabase Storage.

```typescript
// packages/api/src/ai/pdf-parser.ts
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { ChatOpenAI } from "@langchain/openai";

export async function extractTransactions(pdfBuffer: Buffer, bankName?: string) {
  // 1. Load PDF text
  // 2. Build prompt with bank-specific hints if bankName provided
  // 3. Use OpenAI structured output to extract transactions
  // 4. Return typed transaction array
}
```

**Step 2: Transaction classification**

```typescript
// packages/api/src/ai/transaction-classifier.ts
export async function classifyTransactions(
  transactions: ParsedTransaction[],
  userCategories: string[]
) {
  // Use OpenAI to classify each transaction into user's categories
  // Return transactions with ai_category field populated
}
```

**Step 3: Expense/income matching**

```typescript
// packages/api/src/ai/expense-matcher.ts
export async function matchTransactions(
  transactions: ClassifiedTransaction[],
  existingExpenses: Expense[],
  existingIncome: IncomeEntry[]
) {
  // Match by description similarity + amount proximity
  // Flag amount differences for recurring expenses
  // Return matched transactions with expense/income IDs
}
```

**Step 4: Pipeline orchestrator**

```typescript
// packages/api/src/services/ai-pipeline.service.ts
export async function processBankStatement(statementId: string) {
  // 1. Update status to 'processing'
  // 2. Download PDF from storage
  // 3. Extract transactions
  // 4. Classify transactions
  // 5. Match to existing expenses/income
  // 6. Insert transaction rows
  // 7. Update status to 'parsed'
  // 8. Store parsed_data JSONB
  // Error: set status to 'failed'
}
```

**Step 5: Tests with mock OpenAI responses**

Test the pipeline with fixture PDF data and mocked LangChain responses.

**Step 6: Commit**

```bash
git add packages/api/src/ai/ packages/api/src/services/
git commit -m "feat: add AI pipeline for bank statement parsing and classification"
```

---

### Task 19: Transaction routes with attribution

**Files:**
- Create: `packages/api/src/routes/transactions.ts`
- Test: `packages/api/src/routes/__tests__/transactions.test.ts`

Implement:
- `GET /api/transactions` — list transactions (filterable by statement, date range, category)
- `PUT /api/transactions/:id` — update category override, matched expense/income
- `PUT /api/transactions/:id/attribute` — assign transaction to a household member (sets `attributed_to_user_id`). Validates: user must be in same household, statement must be `is_shared_account`, requester must be uploader or head of household.
- `POST /api/transactions/bulk-attribute` — bulk assign transactions. Body: `{ attributions: [{ transaction_id, attributed_to_user_id }] }`. Same validation per transaction.

**Step 1-5: TDD cycle**

---

## Phase 9: Households

### Task 20: Household routes

**Files:**
- Create: `packages/api/src/routes/households.ts`
- Create: `packages/api/src/services/household.service.ts`
- Test: `packages/api/src/routes/__tests__/households.test.ts`

Implement:
- `POST /api/households` — create household (user becomes head, generate invite code)
- `GET /api/households/:id` — get household details + member list (members only)
- `POST /api/households/:id/invite` — invite by email (head only, check 10-member limit)
- `POST /api/households/:id/join` — join via invite code (validates invite, sets household_id on profile)
- `DELETE /api/households/:id/members/:userId` — remove member (head only, cannot remove self)
- `PUT /api/households/:id/sharing` — update income/expense sharing preferences for authenticated user

Business logic:
- On join: user configures `income_sharing_mode` and `expense_sharing_mode`
- Invite code is a random 8-character alphanumeric string
- Member count check before invite/join (max 10)
- User can only be in 1 household at a time

**Step 1-5: TDD cycle**

---

## Phase 10: Reports & Dashboard Data

### Task 21: Report generation service

**Files:**
- Create: `packages/api/src/services/report.service.ts`
- Create: `packages/api/src/ai/report-insights.ts`
- Test: `packages/api/src/services/__tests__/report.test.ts`

**Step 1: Data aggregation**

```typescript
// packages/api/src/services/report.service.ts
export async function generateUserReport(userId: string, month: Date) {
  // 1. Check report_requests count (max 2/month for manual triggers)
  // 2. Check has_new_data — if false and previous report exists, return cached
  // 3. Query: total income, total expenses, by category, month-over-month
  // 4. Compute: savings rate, expense-to-income ratio, top categories, trends
  // 5. Call AI insights (Task below)
  // 6. Store report in reports table
  // 7. Return report data
}

export async function generateHouseholdReport(householdId: string, month: Date) {
  // Similar but aggregates shared income/expenses from all members
  // Uses category-based sharing preferences
  // Includes member contribution breakdown
}
```

**Step 2: AI insights**

```typescript
// packages/api/src/ai/report-insights.ts
export async function generateInsights(reportData: ReportData, entityType: "user" | "household") {
  // Send structured summary to OpenAI
  // Request 3-5 bullet-point financial health insights
  // Return text string
}
```

**Step 3: Tests with mocked data**

**Step 4: Commit**

---

### Task 22: Report and dashboard routes

**Files:**
- Create: `packages/api/src/routes/reports.ts`
- Create: `packages/api/src/routes/dashboard.ts`
- Test: `packages/api/src/routes/__tests__/reports.test.ts`

Implement:
- `GET /api/reports/personal` — get latest personal report for current month
- `GET /api/reports/household` — get latest household report (members only)
- `POST /api/reports/generate` — manual trigger (checks 2/month limit, checks has_new_data)
- `POST /api/reports/generate-all` — cron endpoint (authenticated via cron_secret header, generates for ALL users and households)
- `GET /api/dashboard/personal` — returns structured dashboard data from latest report
- `GET /api/dashboard/household` — returns structured household dashboard data

**Step 1-5: TDD cycle**

---

## Phase 11: Frontend — Auth & Layout

### Task 23: Supabase client and auth context

**Files:**
- Create: `packages/web/src/lib/supabase.ts`
- Create: `packages/web/src/lib/api.ts`
- Create: `packages/web/src/contexts/auth-context.tsx`
- Create: `packages/web/src/hooks/use-auth.ts`

**Step 1: Supabase client**

```typescript
// packages/web/src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

**Step 2: API client helper**

```typescript
// packages/web/src/lib/api.ts
import { supabase } from "./supabase";

export async function apiClient(path: string, options?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "API request failed");
  }
  return response.json();
}
```

**Step 3: Auth context with session management**

Wraps Supabase auth, provides `user`, `signUp`, `signIn`, `signOut`, `loading` state.

**Step 4: Commit**

---

### Task 24: Auth pages (login, signup)

**Files:**
- Create: `packages/web/src/pages/login.tsx`
- Create: `packages/web/src/pages/signup.tsx`
- Create: `packages/web/src/components/auth-guard.tsx`

**Step 1: Add shadcn/ui components**

```bash
cd packages/web
bunx shadcn@latest add button input label card form
```

**Step 2: Build login page**

Email/password form using shadcn/ui Card + Form components. On submit, call auth context `signIn`. Redirect to dashboard on success.

**Step 3: Build signup page**

Email/password/display_name form. On submit, call auth context `signUp`. Redirect to onboarding wizard on success.

**Step 4: Build AuthGuard component**

Wraps routes that require authentication. Redirects to /login if no session.

**Step 5: Set up routing in App.tsx**

```typescript
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route path="/signup" element={<SignupPage />} />
  <Route element={<AuthGuard />}>
    <Route path="/onboarding" element={<OnboardingPage />} />
    <Route path="/dashboard" element={<DashboardPage />} />
    {/* ... more protected routes */}
  </Route>
</Routes>
```

**Step 6: Commit**

```bash
git add packages/web/src/
git commit -m "feat: add auth pages and routing with AuthGuard"
```

---

### Task 25: App shell layout

**Files:**
- Create: `packages/web/src/components/layout/sidebar.tsx`
- Create: `packages/web/src/components/layout/header.tsx`
- Create: `packages/web/src/components/layout/app-shell.tsx`

**Step 1: Add shadcn/ui components**

```bash
bunx shadcn@latest add avatar dropdown-menu separator sheet sidebar
```

**Step 2: Build sidebar**

Navigation links: Dashboard, Income, Expenses, Bank Statements, Household, Settings. Active route highlighting. Collapsible on mobile.

**Step 3: Build header**

User avatar + dropdown (profile, settings, logout). App title.

**Step 4: Build app shell**

Combines sidebar + header + main content area. Used as layout wrapper for all authenticated routes.

**Step 5: Commit**

---

## Phase 12: Frontend — Core Features

### Task 26: Income management page

**Files:**
- Create: `packages/web/src/pages/income.tsx`
- Create: `packages/web/src/components/income/income-form.tsx`
- Create: `packages/web/src/components/income/income-list.tsx`
- Create: `packages/web/src/hooks/use-income.ts`

**Step 1: TanStack Query hooks**

```typescript
// packages/web/src/hooks/use-income.ts
export function useIncome() { /* GET /api/income */ }
export function useCreateIncome() { /* POST /api/income */ }
export function useUpdateIncome() { /* PUT /api/income/:id */ }
export function useDeleteIncome() { /* DELETE /api/income/:id */ }
```

**Step 2: Income form with attribution**

Form fields: source_name, amount, frequency, effective_date, end_date. If user is in a household: optional `attributed_to_user_id` dropdown showing household members (for marking income as belonging to someone else).

**Step 3: Income list with table**

Sortable/filterable table showing all income entries. Badge for AI-suggested entries. Badge for attributed entries (shows "Belongs to: [name]").

**Step 4: Commit**

---

### Task 27: Expenses management page

**Files:**
- Create: `packages/web/src/pages/expenses.tsx`
- Create: `packages/web/src/components/expenses/expense-form.tsx`
- Create: `packages/web/src/components/expenses/expense-list.tsx`
- Create: `packages/web/src/hooks/use-expenses.ts`

Similar to Task 26 but for expenses. Form includes: description, amount, category (dropdown from user's categories), frequency, recurrence_interval, next_due_date, end_date.

AI-adjusted expenses show original amount with strikethrough and new amount. List is filterable by category and frequency.

**Step 1-4: Build hooks, form, list, commit**

---

### Task 28: Categories management page

**Files:**
- Create: `packages/web/src/pages/categories.tsx`
- Create: `packages/web/src/components/categories/category-form.tsx`
- Create: `packages/web/src/hooks/use-categories.ts`

List all categories with toggle for `is_shared_with_household`. System defaults are marked and cannot be deleted. Custom categories can be created/edited/deleted.

**Step 1-4: Build hooks, form, list, commit**

---

### Task 29: Bank statement upload page

**Files:**
- Create: `packages/web/src/pages/bank-statements.tsx`
- Create: `packages/web/src/components/bank-statements/upload-form.tsx`
- Create: `packages/web/src/components/bank-statements/statement-list.tsx`
- Create: `packages/web/src/components/bank-statements/transaction-review.tsx`
- Create: `packages/web/src/hooks/use-bank-statements.ts`

**Step 1: Upload form**

Drag-and-drop zone for PDF files (support multiple). Fields: bank_name (optional, dropdown of common banks + "Other"), statement_month (date picker), `is_shared_account` toggle, `account_label` text field (shown when shared).

**Step 2: Statement list**

Table of uploaded statements with status badges (uploaded, processing, parsed, failed). Click to view parsed transactions.

**Step 3: Transaction review view**

After AI parsing completes, show transactions in a reviewable list:
- Each transaction shows: date, description, amount, AI-suggested category (editable dropdown), matched expense/income (if any)
- For shared accounts: "Assign to" dropdown for each transaction showing household members
- Bulk actions: select multiple transactions and bulk-assign to a household member
- "Confirm All" button to finalize the review

**Step 4: Commit**

---

### Task 30: Household management page

**Files:**
- Create: `packages/web/src/pages/household.tsx`
- Create: `packages/web/src/components/household/create-household.tsx`
- Create: `packages/web/src/components/household/join-household.tsx`
- Create: `packages/web/src/components/household/member-list.tsx`
- Create: `packages/web/src/components/household/invite-form.tsx`
- Create: `packages/web/src/components/household/sharing-config.tsx`
- Create: `packages/web/src/hooks/use-household.ts`

**Step 1: No-household state**

If user has no household: show two cards — "Create a Household" and "Join a Household".

**Step 2: Create household form**

Name input → creates household → shows invite code to share.

**Step 3: Join household form**

Invite code input → validates → shows sharing configuration before joining.

**Step 4: Sharing configuration**

Income sharing: radio group (all / none / partial with amount input).
Expense sharing: radio group (all / none / by category with category checkboxes).

**Step 5: Member list (head of household view)**

Table of members with display_name, sharing mode summary, "Remove" button. Invite form with email input.

**Step 6: Commit**

---

## Phase 13: Frontend — Dashboards

### Task 31: Personal dashboard

**Files:**
- Create: `packages/web/src/pages/dashboard.tsx`
- Create: `packages/web/src/components/dashboard/income-vs-expenses-chart.tsx`
- Create: `packages/web/src/components/dashboard/spending-by-category-chart.tsx`
- Create: `packages/web/src/components/dashboard/monthly-trend-chart.tsx`
- Create: `packages/web/src/components/dashboard/savings-rate-card.tsx`
- Create: `packages/web/src/components/dashboard/top-expenses-list.tsx`
- Create: `packages/web/src/components/dashboard/upcoming-bills-list.tsx`
- Create: `packages/web/src/components/dashboard/ai-insights-card.tsx`
- Create: `packages/web/src/hooks/use-dashboard.ts`

**Step 1: Dashboard data hook**

```typescript
export function usePersonalDashboard() {
  return useQuery({ queryKey: ["dashboard", "personal"], queryFn: () => apiClient("/dashboard/personal") });
}
```

**Step 2: Build each chart/widget component**

Use Recharts for charts, shadcn/ui Cards for layout. Refer to @frontend-design skill for visual polish.

- **Income vs. Expenses:** `BarChart` with two bars per month (income green, expenses red)
- **Spending by Category:** `PieChart` with tooltips showing category name + amount
- **Monthly Trend:** `LineChart` showing net savings line over 6-12 months
- **Savings Rate:** KPI card with large percentage number + color indicator (green >20%, yellow 5-20%, red <5%)
- **Top Expenses:** Ordered list with amount bars
- **Upcoming Bills:** Date-sorted list with due date, description, amount
- **AI Insights:** Card with bullet points from report.ai_insights

**Step 3: Dashboard layout**

Responsive grid: 2-column on desktop, 1-column on mobile. KPI cards at top, charts in middle, lists at bottom.

**Step 4: Add "Refresh Report" button**

Shows remaining refreshes this month (2 - request_count). Calls `POST /api/reports/generate`. Disabled when at limit.

**Step 5: Commit**

---

### Task 32: Household dashboard

**Files:**
- Create: `packages/web/src/pages/household-dashboard.tsx`
- Create: `packages/web/src/components/dashboard/combined-income-card.tsx`
- Create: `packages/web/src/components/dashboard/combined-expenses-chart.tsx`
- Create: `packages/web/src/components/dashboard/member-contributions-chart.tsx`
- Create: `packages/web/src/components/dashboard/household-savings-rate-card.tsx`
- Create: `packages/web/src/components/dashboard/shared-vs-personal-chart.tsx`
- Create: `packages/web/src/components/dashboard/household-insights-card.tsx`

Similar structure to personal dashboard but uses household report data. Only accessible to household members.

**Step 1-4: Build hooks, charts, layout, commit**

---

## Phase 14: Onboarding Wizard

### Task 33: Onboarding wizard flow

**Files:**
- Create: `packages/web/src/pages/onboarding.tsx`
- Create: `packages/web/src/components/onboarding/welcome-step.tsx`
- Create: `packages/web/src/components/onboarding/upload-step.tsx`
- Create: `packages/web/src/components/onboarding/processing-step.tsx`
- Create: `packages/web/src/components/onboarding/review-step.tsx`
- Create: `packages/web/src/components/onboarding/recurring-step.tsx`
- Create: `packages/web/src/components/onboarding/household-step.tsx`
- Create: `packages/web/src/components/onboarding/complete-step.tsx`

**Step 1: Wizard shell**

Multi-step wizard with progress indicator. Steps:
1. Welcome — app overview, "Get Started" button
2. Upload — bank statement upload (reuse upload-form component), shared account toggle
3. Processing — animated loading state while AI parses
4. Review — transaction review (reuse transaction-review component), income identification, attribution for shared accounts
5. Recurring — mark expenses as recurring vs. one-time
6. Household — create/join or skip
7. Complete — redirect to dashboard

**Step 2: Step navigation**

Forward/back navigation with state preservation. "Skip" option on steps 2-6 (can complete onboarding without uploading). Final step calls `PUT /api/profile/onboarding` to mark complete.

**Step 3: Commit**

---

## Phase 15: CI/CD & Deployment

### Task 34: GitHub Actions workflows

**Files:**
- Create: `.github/workflows/pr-check.yml`
- Create: `.github/workflows/test-deploy.yml`
- Create: `.github/workflows/prod-deploy.yml`

**Step 1: PR check workflow**

```yaml
# .github/workflows/pr-check.yml
name: PR Check
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run lint
      - run: bun run typecheck
      - run: bun run test
```

**Step 2: Test deploy workflow**

```yaml
# .github/workflows/test-deploy.yml
name: Deploy to Test
on:
  push:
    branches: [test]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run lint
      - run: bun run typecheck
      - run: bun run test
      - name: Deploy API to Vercel (test)
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_API_TEST_PROJECT_ID }}
      - name: Deploy Web to Vercel (test)
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_WEB_TEST_PROJECT_ID }}
```

**Step 3: Production deploy workflow**

Same as test but triggers on `main`, uses production Vercel project IDs and Supabase project.

**Step 4: Commit**

```bash
git add .github/
git commit -m "feat: add GitHub Actions CI/CD workflows"
```

---

### Task 35: Vercel project configuration

**Files:**
- Create: `packages/api/vercel.json`
- Create: `packages/web/vercel.json`

**Step 1: API Vercel config**

```json
{
  "buildCommand": "bun run build",
  "outputDirectory": "dist",
  "framework": null,
  "rewrites": [{ "source": "/api/(.*)", "destination": "/api/$1" }]
}
```

**Step 2: Web Vercel config**

```json
{
  "buildCommand": "bun run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }]
}
```

**Step 3: Set up Vercel projects**

Use Vercel MCP tools or dashboard:
- Create `spendoza` project (production) — domain: spendoza.io
- Create `spendoza-test` project (test) — domain: test.spendoza.io
- Set environment variables on each project (SUPABASE_URL, keys, OPENAI_API_KEY, etc.)

**Step 4: Create test branch**

```bash
git checkout -b test
git push -u origin test
git checkout main
```

**Step 5: Commit**

```bash
git add packages/api/vercel.json packages/web/vercel.json
git commit -m "feat: add Vercel project configurations"
```

---

## Phase 16: Polish & Security Hardening

### Task 36: CORS, rate limiting, and error handling

**Files:**
- Modify: `packages/api/src/index.ts`
- Create: `packages/api/src/middleware/error-handler.ts`

**Step 1: Configure CORS properly**

```typescript
app.use(cors({
  origin: [
    "https://spendoza.io",
    "https://test.spendoza.io",
    process.env.NODE_ENV === "development" && "http://localhost:5173",
  ].filter(Boolean) as string[],
  credentials: true,
}));
```

**Step 2: Rate limiting**

```typescript
import rateLimit from "express-rate-limit";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
});
app.use("/api", limiter);

// Stricter limit for auth endpoints
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
app.use("/api/auth", authLimiter);
```

**Step 3: Global error handler**

```typescript
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});
```

**Step 4: Commit**

---

### Task 37: Run Supabase security advisors

**Step 1: Check for security issues**

Use Supabase MCP `get_advisors` tool with type "security" on both projects. Fix any missing RLS policies or other issues.

**Step 2: Check for performance issues**

Use Supabase MCP `get_advisors` tool with type "performance". Add any missing indexes.

**Step 3: Commit any fixes**

---

## Phase 17: End-to-End Testing

### Task 38: Integration tests

**Files:**
- Create: `packages/api/src/__tests__/integration/auth-flow.test.ts`
- Create: `packages/api/src/__tests__/integration/bank-statement-flow.test.ts`
- Create: `packages/api/src/__tests__/integration/household-flow.test.ts`
- Create: `packages/api/src/__tests__/integration/report-flow.test.ts`

**Step 1: Auth flow test**

Signup → Login → Get profile → Update profile → Complete onboarding

**Step 2: Bank statement flow test**

Upload statement → Verify processing → Review transactions → Attribute transactions (shared account)

**Step 3: Household flow test**

Create household → Invite member → Member joins with sharing config → Verify household data aggregation → Remove member

**Step 4: Report flow test**

Generate report → Verify data → Trigger manual refresh → Verify limit enforcement → Verify caching when no new data

**Step 5: Run all tests**

```bash
bun run test
```

**Step 6: Commit**

---

## Summary of Phases

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-4 | Monorepo scaffolding, shared/api/web packages |
| 2 | 5-8 | Supabase projects, schema, storage, cron |
| 3 | 9 | Shared Zod schemas and types |
| 4 | 10-11 | Auth middleware, validation middleware |
| 5 | 12 | Auth routes |
| 6 | 13-14 | Profile and categories CRUD |
| 7 | 15-16 | Income and expenses CRUD |
| 8 | 17-19 | Bank statement upload, AI pipeline, transactions |
| 9 | 20 | Households |
| 10 | 21-22 | Reports and dashboard data |
| 11 | 23-25 | Frontend auth, layout |
| 12 | 26-30 | Frontend core feature pages |
| 13 | 31-32 | Frontend dashboards with charts |
| 14 | 33 | Onboarding wizard |
| 15 | 34-35 | CI/CD and Vercel deployment |
| 16 | 36-37 | Security hardening |
| 17 | 38 | Integration tests |

**Total: 38 tasks across 17 phases**

Each phase builds on the previous. Phases 1-3 must be sequential. After Phase 3, backend (Phases 4-10) and frontend (Phases 11-14) can be partially parallelized. Phase 15-17 come last.
