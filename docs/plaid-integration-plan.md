# Plaid Integration Planning Document

**Date:** 2026-02-24
**Updated:** 2026-02-26
**Status:** Proposal / Discovery

---

## 1. Executive Summary

Spendoza currently relies on users uploading PDF bank statements, which are then processed through an async AI pipeline (text extraction → transaction parsing → classification → matching → bill/income detection → report generation). This works but introduces friction: users must manually download and upload statements, data is only as fresh as the last upload, and PDF parsing is inherently fragile across different bank formats.

Integrating [Plaid](https://plaid.com) would allow users to link their bank accounts directly, enabling automatic, near-real-time transaction syncing without manual uploads. This document explores the technical requirements, architectural changes, cost implications, and rollout strategy for adding Plaid as a transaction data source.

**Subscription Tier:** Plaid is gated to the **Pro** tier ($4.99/mo). The `TIER_LIMITS` in `packages/shared/src/schemas/subscription.ts` already defines `plaid: true` only for Pro. The `requireTier("pro")` middleware will protect all `/api/plaid/*` routes.

---

## 2. How Plaid Works

### Core Flow

1. **Frontend:** User clicks "Link Account" → Plaid Link (a drop-in UI widget) opens → user authenticates with their bank.
2. **Token Exchange:** Plaid Link returns a `public_token` to the frontend → frontend sends it to our API → API exchanges it for a persistent `access_token` via `/item/public_token/exchange`.
3. **Transaction Sync:** API calls `/transactions/sync` with the `access_token` to fetch transactions. A cursor-based pagination model tracks what's already been fetched.
4. **Ongoing Updates:** Plaid checks institutions 1–4 times per day. We receive a `SYNC_UPDATES_AVAILABLE` webhook when new data is ready, then call `/transactions/sync` again.

### Key Concepts

| Term | Description |
|------|-------------|
| **Item** | A single bank connection (one user + one institution). One Item can contain multiple accounts (checking, savings, credit card). |
| **Access Token** | A long-lived secret tied to an Item. Must be stored securely server-side. Never expires unless explicitly rotated or removed. |
| **Link Token** | A short-lived, single-use token created server-side to initialize the Plaid Link widget on the frontend. |
| **Cursor** | A string returned by `/transactions/sync` that marks the last sync point. Store per-Item to enable incremental fetching. |
| **Webhook** | HTTP POST from Plaid to our server when new data is available, an Item needs re-authentication, etc. |

### What Plaid Provides Per Transaction

- Transaction date (posted and authorized)
- Amount
- Merchant name (cleaned)
- Raw description
- Plaid category hierarchy (e.g., `Food and Drink > Restaurants`)
- Location (city, region, postal code — when available)
- Payment channel (online, in-store, other)
- Pending status
- Account ID (which account within the Item)
- Unique `transaction_id` for deduplication

---

## 3. Current Architecture & What Needs to Change

### Current Data Flow

```
User uploads PDF → Supabase Storage
  → bank_statements row created (status: 'uploaded')
  → pg_net trigger fires → POST /api/internal/process-step
  → Async AI Pipeline (4 steps via ai-pipeline.service.ts):
      1. extract_text (pdfjs-dist via ai/pdf-parser.ts)
      2. extract_transactions (OpenAI structured output via ai/transaction-classifier.ts)
      3. classify_transactions (GPT-4o-mini, 20-txn batches via ai/transaction-classifier.ts)
      4. match_and_insert (deterministic via ai/expense-matcher.ts)
  → transactions table (tied to bank_statement_id)
  → bill-detection.service.ts (auto-detect recurring expenses)
  → income-detection.service.ts (auto-detect recurring income)
  → report.service.ts (generate/update monthly report)
  → goal-suggestions via ai/goal-suggestions.ts
  → email.service.ts (weekly PDF email reports via Resend)
```

### Current Transactions Table Schema

```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_statement_id UUID NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  attributed_to_user_id UUID REFERENCES profiles(id),
  date DATE NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  type transaction_type NOT NULL,  -- 'credit' | 'debit'
  ai_category TEXT,
  matched_expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
  matched_income_id UUID REFERENCES income_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Indexes: bank_statement_id, user_id, attributed_to_user_id
```

### Current Schema Constraints

- `bank_statement_id UUID NOT NULL` — every transaction **must** belong to a bank statement
- No concept of a linked account, Plaid Item, or external transaction ID
- No field for Plaid's richer metadata (merchant name, location, pending status, Plaid category)
- `matched_expense_id` and `matched_income_id` already support linking to auto-detected bills/income

### Proposed New Data Flow (Plaid Path)

```
User links account via Plaid Link (Pro tier required)
  → POST /api/plaid/exchange-token
  → API stores encrypted access_token + Item/Account metadata
  → Initial sync: /transactions/sync → transform → insert into transactions (source: 'plaid')
  → Run existing downstream pipeline:
      - ai/transaction-classifier.ts (classify with user's categories)
      - ai/expense-matcher.ts (match to existing expenses)
      - bill-detection.service.ts (detect recurring expenses)
      - income-detection.service.ts (detect recurring income)
      - report.service.ts (update monthly report)
  → Ongoing: Plaid webhook fires → incremental /transactions/sync → same pipeline
```

### 3.1 Database Schema Changes

#### New Tables

```sql
-- Migration: 00017_plaid_integration.sql

-- Plaid Items: one per bank connection per user
CREATE TABLE plaid_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plaid_item_id TEXT NOT NULL UNIQUE,        -- Plaid's Item ID
  access_token TEXT NOT NULL,                 -- encrypted at rest via AES-256
  institution_id TEXT,                        -- Plaid institution ID
  institution_name TEXT,                      -- e.g., "Chase", "Bank of America"
  sync_cursor TEXT,                           -- cursor for /transactions/sync
  status TEXT NOT NULL DEFAULT 'active',      -- active | requires_reauth | removed
  consent_expires_at TIMESTAMPTZ,            -- when user consent expires
  error_code TEXT,                            -- last Plaid error code if any
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Plaid Accounts: individual accounts within an Item
CREATE TABLE plaid_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plaid_item_id UUID NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
  plaid_account_id TEXT NOT NULL UNIQUE,      -- Plaid's account ID
  name TEXT NOT NULL,                          -- e.g., "Checking ...1234"
  official_name TEXT,                          -- full name from bank
  type TEXT NOT NULL,                          -- depository, credit, loan, etc.
  subtype TEXT,                                -- checking, savings, credit card, etc.
  mask TEXT,                                   -- last 4 digits
  is_shared_account BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plaid_items_user ON plaid_items(user_id);
CREATE INDEX idx_plaid_accounts_item ON plaid_accounts(plaid_item_id);
```

#### Modify Existing Tables

```sql
-- Make bank_statement_id nullable so Plaid transactions don't need one
ALTER TABLE transactions
  ALTER COLUMN bank_statement_id DROP NOT NULL;

-- Add Plaid-specific fields to transactions
ALTER TABLE transactions
  ADD COLUMN plaid_account_id UUID REFERENCES plaid_accounts(id) ON DELETE SET NULL,
  ADD COLUMN plaid_transaction_id TEXT UNIQUE,  -- for deduplication
  ADD COLUMN merchant_name TEXT,
  ADD COLUMN plaid_category TEXT,               -- Plaid's own category
  ADD COLUMN is_pending BOOLEAN DEFAULT false,
  ADD COLUMN source TEXT NOT NULL DEFAULT 'statement';  -- 'statement' | 'plaid'

CREATE INDEX idx_transactions_plaid_account ON transactions(plaid_account_id);
CREATE INDEX idx_transactions_plaid_txn_id ON transactions(plaid_transaction_id);
CREATE INDEX idx_transactions_source ON transactions(source);

-- Ensure existing data integrity: all existing rows are 'statement' source
-- (handled by DEFAULT 'statement' on the new column)
```

#### RLS Policies

```sql
-- Plaid Items: users can only access their own
ALTER TABLE plaid_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own plaid items"
  ON plaid_items FOR ALL USING (user_id = auth.uid());

-- Plaid Accounts: access through Item ownership
ALTER TABLE plaid_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own plaid accounts"
  ON plaid_accounts FOR ALL
  USING (plaid_item_id IN (
    SELECT id FROM plaid_items WHERE user_id = auth.uid()
  ));
```

### 3.2 New API Endpoints

All routes mounted at `/api/plaid` with `requireAuth` and `requireTier("pro")` middleware, matching the pattern used for `/api/households` and `/api/goals` in `packages/api/src/index.ts`.

```typescript
// In index.ts:
import plaidRouter from "./routes/plaid";
app.use("/api/plaid", requireAuth, requireTier("pro"), plaidRouter);

// Plaid webhook is separate — no auth, raw body, signature verification
// Must be registered BEFORE express.json(), alongside Stripe webhooks
app.use("/api/webhooks/plaid", express.raw({ type: "application/json" }), plaidWebhookRouter);
```

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/plaid/create-link-token` | requireAuth + Pro | Generate a Plaid Link token for the frontend |
| `POST` | `/api/plaid/exchange-token` | requireAuth + Pro | Exchange `public_token` for `access_token`, create Item + Accounts |
| `GET` | `/api/plaid/items` | requireAuth + Pro | List user's linked accounts with account details |
| `DELETE` | `/api/plaid/items/:id` | requireAuth + Pro | Unlink an account (calls `/item/remove` on Plaid) |
| `POST` | `/api/plaid/items/:id/sync` | requireAuth + Pro | Manually trigger a transaction sync |
| `POST` | `/api/plaid/items/:id/relink` | requireAuth + Pro | Generate a Link token in update mode for re-authentication |
| `POST` | `/api/webhooks/plaid` | Plaid signature | Receive Plaid webhooks (no user auth — verified by Plaid signature) |

### 3.3 Backend Services

#### New: `packages/api/src/services/plaid.service.ts`

Follows the existing service pattern (see `ai-pipeline.service.ts`, `bill-detection.service.ts`):

1. **`exchangeToken(publicToken, userId)`** — Exchange public token, create plaid_items + plaid_accounts rows, trigger initial sync.
2. **`syncTransactions(plaidItemId)`** — Call `/transactions/sync` with stored cursor. Transform Plaid transactions → our transactions table format. Handle added/modified/removed. Update cursor.
3. **`processNewTransactions(transactions, userId)`** — After inserting Plaid transactions, run the existing downstream pipeline:
   - `classifyTransactions()` from `ai/transaction-classifier.ts` (map Plaid categories to user's categories, or use AI if needed)
   - `matchExpenses()` from `ai/expense-matcher.ts`
   - `detectBills()` from `bill-detection.service.ts`
   - `detectIncome()` from `income-detection.service.ts`
   - `generateUserReport()` from `report.service.ts`
4. **`unlinkItem(plaidItemId)`** — Call Plaid `/item/remove`, mark as 'removed' in DB.
5. **`handleWebhook(event)`** — Dispatcher for webhook event types.

#### New: `packages/api/src/lib/plaid.ts`

Plaid client initialization (similar to how Stripe is initialized in `billing.ts`):

```typescript
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const isProduction = process.env.VERCEL_ENV === "production";

const configuration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || "sandbox"],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": process.env.PLAID_SECRET,
    },
  },
});

export const plaidClient = isProduction ? new PlaidApi(configuration) : null;
```

#### New: `packages/api/src/lib/encryption.ts`

AES-256-GCM encryption utility for Plaid access tokens:

```typescript
export function encrypt(plaintext: string): string;
export function decrypt(ciphertext: string): string;
```

### 3.4 Shared Schema Changes

New file: `packages/shared/src/schemas/plaid.ts`

Following existing patterns (Zod schemas + TypeScript interfaces, exported from `packages/shared/src/index.ts`):

```typescript
import { z } from "zod";

// Request validation schemas (used by validate() middleware)
export const exchangeTokenSchema = z.object({
  public_token: z.string(),
  institution_id: z.string().optional(),
  institution_name: z.string().optional(),
});
export type ExchangeTokenInput = z.infer<typeof exchangeTokenSchema>;

export const syncItemSchema = z.object({
  plaid_item_id: z.string().uuid(),
});

// Response types
export interface PlaidItem {
  id: string;
  user_id: string;
  institution_id: string | null;
  institution_name: string | null;
  status: "active" | "requires_reauth" | "removed";
  last_synced_at: string | null;
  accounts: PlaidAccount[];
  created_at: string;
  updated_at: string;
}

export interface PlaidAccount {
  id: string;
  plaid_account_id: string;
  name: string;
  official_name: string | null;
  type: string;
  subtype: string | null;
  mask: string | null;
  is_shared_account: boolean;
}
```

Also update `packages/shared/src/schemas/transaction.ts` to include the new source-related fields:

```typescript
// Add to existing Transaction interface
export interface Transaction {
  // ... existing fields ...
  plaid_account_id: string | null;
  plaid_transaction_id: string | null;
  merchant_name: string | null;
  plaid_category: string | null;
  is_pending: boolean;
  source: "statement" | "plaid";
}
```

### 3.5 Frontend Changes

Following existing patterns: TanStack Query hooks in `packages/web/src/hooks/`, pages in `packages/web/src/pages/`, shadcn/ui components.

| Component | Location | Change |
|-----------|----------|--------|
| New: `use-plaid.ts` | `packages/web/src/hooks/` | TanStack Query hooks for Plaid items, link token, exchange, sync, unlink |
| New: `linked-accounts.tsx` | `packages/web/src/pages/` | Page listing connected bank accounts, sync status, unlink/re-auth buttons |
| New: `PlaidLinkButton` | `packages/web/src/components/` | Uses `react-plaid-link` to render the Plaid Link widget |
| New: Re-auth banner | `packages/web/src/components/` | sonner toast or persistent banner when an Item needs re-auth |
| Modified: `transactions.tsx` | `packages/web/src/pages/` | Add `source` column/indicator (Plaid vs. Statement). Filter by source. Show merchant_name when available. |
| Modified: `dashboard.tsx` | `packages/web/src/pages/` | No code change needed — dashboard queries transactions table which will include Plaid data |
| Modified: `household-dashboard.tsx` | `packages/web/src/pages/` | Plaid shared accounts with attribution work same as statement shared accounts |
| Modified: `onboarding.tsx` | `packages/web/src/pages/` | Add optional "Link Bank Account" step alongside PDF upload |
| Modified: `pricing.tsx` | `packages/web/src/pages/` | Already lists Plaid as a Pro feature |
| Modified: Sidebar/nav | | Add "Linked Accounts" link (Pro tier only) |

### 3.6 Integration with Existing Features

| Feature | Integration Point | Notes |
|---------|-------------------|-------|
| **Bill detection** | `bill-detection.service.ts` | Runs on Plaid transactions same as statement transactions. Source field allows filtering. |
| **Income detection** | `income-detection.service.ts` | Same — recurring credits from Plaid are detected. |
| **Report generation** | `report.service.ts` | Reports query transactions table regardless of source. No changes needed to `generateUserReport()`. |
| **AI classification** | `ai/transaction-classifier.ts` | Plaid provides its own category. Option: use Plaid category directly, map to user's categories, or still run AI classifier. Recommend: map Plaid category to closest user category, fall back to AI for unmapped. |
| **Expense matching** | `ai/expense-matcher.ts` | Works on Plaid transactions same as statement transactions. |
| **Household attribution** | `transactions.ts` routes | `PUT /:id/attribute` and `POST /bulk-attribute` work on any transaction regardless of source. Plaid shared accounts use `is_shared_account` on plaid_accounts. |
| **PDF email reports** | `email.service.ts` | Reports include all transactions. Plaid data flows through automatically. |
| **Goal suggestions** | `ai/goal-suggestions.ts` | Based on report data which includes all transactions. No changes needed. |
| **Dashboard** | `dashboard.ts` route | Queries transactions table. Plaid data included automatically. |
| **Transaction list** | `transactions.ts` route | Add `source` filter param. Show merchant_name for Plaid transactions. |
| **CSV/PDF export** | Existing export functionality | Include source column in exports. |

### 3.7 Security Considerations

| Concern | Mitigation |
|---------|------------|
| **Access token storage** | Encrypt `access_token` at rest using AES-256-GCM via `lib/encryption.ts`. Store encryption key in `PLAID_TOKEN_ENCRYPTION_KEY` env var, not in code or DB. |
| **Webhook verification** | Verify Plaid webhook signatures using the `/webhook_verification_key/get` endpoint. Register webhook route with `express.raw()` body parser alongside existing Stripe webhook in `index.ts`. |
| **Token exposure** | Access tokens never leave the server. Frontend only sees Link tokens (short-lived) and public tokens (single-use). |
| **Data minimization** | Only request the `transactions` product. Don't request `auth`, `identity`, or `assets` unless needed later. |
| **RLS** | Plaid Items and Accounts protected by row-level security, matching existing patterns from `00001_initial_schema.sql` and `00004_security_performance_fixes.sql`. |
| **Tier gating** | `requireTier("pro")` middleware prevents free/starter users from accessing Plaid endpoints. Already defined in `TIER_LIMITS`. |
| **Non-production bypass** | Follow the Stripe pattern: in non-production (`VERCEL_ENV !== "production"`), use Plaid Sandbox mode with test credentials. |

---

## 4. Cost Analysis

### Plaid Pricing Model

Plaid does not publicly list exact prices. The following ranges are based on industry reports and publicly available information.

#### Development & Testing (Free)

| Environment | Details |
|-------------|---------|
| **Sandbox** | Unlimited API calls, fake institutions, mock data. No cost. |
| **Development** | Real bank data, up to **100 live Items** (connected accounts). No cost. Ideal for testing with personal accounts. |
| **Production (Free Tier)** | Up to **200 API calls** per product with live data. Enough to validate the integration with real users. |

#### Production Pricing

Plaid uses a **per-Item** billing model for the Transactions product:

| Billing Type | Detail |
|-------------|--------|
| **One-time fee** per Item | Charged once when a user successfully links an account. Estimated **$0.50–$2.00** per link. |
| **Reconnection** | If a user's Item breaks and they re-authenticate, it may count as a new Item (varies by contract). Estimated 15–25% annual reconnection rate. |

There is **no per-API-call fee** for `/transactions/sync` or `/transactions/get` — the cost is per connected Item, not per request.

#### Cost Projections

| Scale | Connected Items | Est. One-Time Cost | Est. Annual Reconnection Cost | Total Year 1 |
|-------|----------------|--------------------|-----------------------------|---------------|
| Personal use (1–2 users) | 5–10 | $2.50–$20 | $0.50–$5 | **$3–$25** |
| Small group (10 users) | 30–50 | $15–$100 | $5–$25 | **$20–$125** |
| Growth (100 users) | 300–500 | $150–$1,000 | $45–$250 | **$200–$1,250** |
| Scale (1,000 users) | 1,500–3,000 | $750–$6,000 | $225–$1,500 | **$1,000–$7,500** |

> **Note:** These are rough estimates. Actual pricing depends on your contract with Plaid. Contact Plaid's sales team for exact quotes. Volume discounts are available with a Growth ($100/mo minimum) or Custom plan.

#### Revenue Offset

With Pro tier at $4.99/mo, Plaid costs per user are offset quickly:

| Users | Monthly Pro Revenue | Annual Revenue | Plaid Year 1 Cost | Net |
|-------|--------------------|-----------------|--------------------|-----|
| 10 | $49.90 | $598.80 | $20–$125 | **+$474–$579** |
| 100 | $499 | $5,988 | $200–$1,250 | **+$4,738–$5,788** |

#### Additional Costs to Factor In

| Item | Estimate |
|------|----------|
| **Plaid access token encryption** | No additional cost (use existing infrastructure) |
| **Webhook endpoint hosting** | Already covered by Vercel (existing deployment) |
| **Additional Supabase storage** | Minimal — Plaid transactions are just rows, no file storage |
| **Development time** | The primary cost — see implementation scope below |

### Cost Comparison: Plaid vs. Current Approach

| Factor | PDF Upload (Current) | Plaid |
|--------|---------------------|-------|
| **Per-statement cost** | OpenAI API calls for parsing (~$0.01–$0.05 per statement) | $0 after initial Item link |
| **Per-user cost** | Scales with upload frequency | ~$1–$4 one-time per bank link |
| **Data freshness** | Manual, days/weeks stale | Near real-time (1–4x daily auto-sync) |
| **User friction** | High (download PDF, upload, wait) | Low (one-time link, then automatic) |
| **Bank coverage** | Any bank that produces a PDF | 12,000+ US/CA/EU institutions |
| **Parsing reliability** | Varies by bank PDF format | Structured API data, no parsing errors |

### Recommendation

For a **personal/household** project, the Development environment (free, up to 100 Items) is sufficient for an extended period. You can test with real accounts at zero cost. If the project grows to serve external users, Plaid's Pay-as-You-Go tier keeps costs proportional to usage with no upfront commitment.

---

## 5. Implementation Phases

### Phase 1: Foundation (Database + Shared Schemas + Plaid Client)

- [ ] Create migration `00017_plaid_integration.sql` for `plaid_items`, `plaid_accounts`, `transactions` alterations, and RLS policies
- [ ] Add `plaid` (plaid-node SDK) to `packages/api/package.json`
- [ ] Create `packages/api/src/lib/plaid.ts` — Plaid client initialization (sandbox for non-production, matching Stripe pattern)
- [ ] Create `packages/api/src/lib/encryption.ts` — AES-256-GCM encrypt/decrypt for access tokens
- [ ] Add Zod schemas + interfaces to `packages/shared/src/schemas/plaid.ts`
- [ ] Update `packages/shared/src/schemas/transaction.ts` with Plaid fields (source, merchant_name, plaid_transaction_id, etc.)
- [ ] Export new schemas from `packages/shared/src/index.ts`
- [ ] Add env vars to `.env.example` and `.env`

### Phase 2: API Routes + Sync Service

- [ ] Create `packages/api/src/services/plaid.service.ts` — token exchange, sync, unlink, webhook handler
- [ ] Create `packages/api/src/routes/plaid.ts` — all CRUD endpoints with `validate()` middleware
- [ ] Create `packages/api/src/routes/plaid-webhook.ts` — webhook receiver with signature verification
- [ ] Register routes in `packages/api/src/index.ts`:
  - `/api/plaid` with `requireAuth`, `requireTier("pro")`
  - `/api/webhooks/plaid` with `express.raw()` before `express.json()` (same pattern as Stripe)
- [ ] Implement initial sync → transform Plaid transactions → insert into transactions table with `source: 'plaid'`
- [ ] Implement incremental sync with cursor management
- [ ] Handle pending → posted transition (update existing transaction amount, clear is_pending)
- [ ] Handle transaction removals (Plaid can retract transactions)

### Phase 3: Downstream Pipeline Integration

- [ ] After Plaid sync inserts transactions, run existing classification pipeline:
  - Map Plaid's category to closest user category (deterministic first pass)
  - Fall back to `ai/transaction-classifier.ts` for unmapped categories
- [ ] Run `ai/expense-matcher.ts` on new Plaid transactions
- [ ] Run `bill-detection.service.ts` on new Plaid transactions
- [ ] Run `income-detection.service.ts` on new Plaid transactions (credits)
- [ ] Trigger `report.service.ts` report update after sync completes
- [ ] Handle webhook events:
  - `SYNC_UPDATES_AVAILABLE` → trigger incremental sync
  - `ITEM_LOGIN_REQUIRED` → mark Item as `requires_reauth`
  - `ITEM_ERROR` → store error code, mark status

### Phase 4: Frontend

- [ ] Add `react-plaid-link` to `packages/web/package.json`
- [ ] Create `packages/web/src/hooks/use-plaid.ts` — TanStack Query hooks (useQuery/useMutation) for:
  - `usePlaidItems()` — list linked accounts
  - `useCreateLinkToken()` — get link token for widget
  - `useExchangeToken()` — exchange public token after linking
  - `useSyncItem()` — manual sync trigger
  - `useUnlinkItem()` — unlink account
- [ ] Create `packages/web/src/pages/linked-accounts.tsx` — manage connected accounts
- [ ] Create `PlaidLinkButton` component using `react-plaid-link`
- [ ] Add "Linked Accounts" to sidebar navigation (Pro tier only, use `useSubscription()` hook to gate visibility)
- [ ] Update `packages/web/src/pages/transactions.tsx`:
  - Add `source` column indicator
  - Show `merchant_name` when available
  - Add source filter (All / Statement / Plaid)
- [ ] Update `packages/web/src/pages/onboarding.tsx`:
  - Add optional "Link Bank Account" step alongside existing PDF upload step
- [ ] Add re-auth notification: use `sonner` toast when any Item has `status: 'requires_reauth'`

### Phase 5: Polish & Coexistence

- [ ] Ensure PDF upload and Plaid paths coexist cleanly (users may want both)
- [ ] Deduplicate transactions if the same transaction appears via both PDF and Plaid (match by date + amount + description similarity)
- [ ] Update `packages/web/src/pages/household-dashboard.tsx` — Plaid shared accounts with attribution follow same pattern as statement shared accounts
- [ ] Write tests for:
  - Plaid route endpoints (following existing test patterns)
  - plaid.service.ts sync logic
  - Encryption utility
  - Webhook signature verification
- [ ] Update `.env.example` files for both api and web packages
- [ ] Run `bun run typecheck && bun run lint && bun run test` to verify

---

## 6. Environment Variables Required

```env
# Plaid Configuration
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_secret
PLAID_ENV=sandbox              # sandbox | development | production
PLAID_WEBHOOK_URL=https://test.spendoza.io/api/webhooks/plaid  # or spendoza.io for prod

# Encryption for access tokens
PLAID_TOKEN_ENCRYPTION_KEY=your_32_byte_hex_key
```

**Vercel env vars needed** (both spendoza-api-test and spendoza-api-prod):
- `PLAID_CLIENT_ID`
- `PLAID_SECRET`
- `PLAID_ENV` (sandbox for test, production for prod)
- `PLAID_WEBHOOK_URL` (environment-specific URL)
- `PLAID_TOKEN_ENCRYPTION_KEY`

**Frontend env var** (packages/web):
- No Plaid-specific frontend env vars needed — Link tokens come from the API

---

## 7. File Inventory (New & Modified)

### New Files

| File | Purpose |
|------|---------|
| `packages/api/supabase/migrations/00017_plaid_integration.sql` | Database schema changes |
| `packages/api/src/lib/plaid.ts` | Plaid client initialization |
| `packages/api/src/lib/encryption.ts` | AES-256-GCM for access tokens |
| `packages/api/src/services/plaid.service.ts` | Sync engine, token exchange, webhook handler |
| `packages/api/src/routes/plaid.ts` | Plaid CRUD endpoints |
| `packages/api/src/routes/plaid-webhook.ts` | Plaid webhook receiver |
| `packages/shared/src/schemas/plaid.ts` | Zod schemas + interfaces |
| `packages/web/src/hooks/use-plaid.ts` | TanStack Query hooks |
| `packages/web/src/pages/linked-accounts.tsx` | Linked accounts management page |
| `packages/web/src/components/plaid-link-button.tsx` | Plaid Link widget wrapper |

### Modified Files

| File | Change |
|------|--------|
| `packages/api/src/index.ts` | Register `/api/plaid` and `/api/webhooks/plaid` routes |
| `packages/api/package.json` | Add `plaid` dependency |
| `packages/shared/src/schemas/transaction.ts` | Add Plaid fields to Transaction interface |
| `packages/shared/src/index.ts` | Export new Plaid schemas |
| `packages/web/package.json` | Add `react-plaid-link` dependency |
| `packages/web/src/pages/transactions.tsx` | Source indicator, merchant name, source filter |
| `packages/web/src/pages/onboarding.tsx` | Optional "Link Bank Account" step |
| `packages/web/src/components/sidebar.tsx` (or nav) | "Linked Accounts" link (Pro only) |
| `packages/api/.env.example` | Add Plaid env vars |

---

## 8. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Plaid pricing changes | Medium | Medium | Keep PDF upload as a fallback. Don't create a hard dependency. |
| Institution connectivity issues | Medium | Low | Show clear error states in UI. Allow manual sync trigger. |
| User re-authentication churn | Medium | Low | Proactive notifications (sonner toast) when Items need re-auth. |
| Data discrepancies between Plaid & PDF | Low | Medium | Build deduplication logic by matching date + amount + description. |
| Access token compromise | Low | High | Encrypt at rest with AES-256-GCM, never log tokens, rotate on suspicion. |
| Plaid rate limits | Low | Low | Respect rate limits, use webhooks instead of polling. |
| Vercel function timeout on large initial syncs | Medium | Medium | Paginate sync, process in chunks. Use `@vercel/functions` `waitUntil()` for background processing (already used in AI pipeline). |

---

## 9. Alternatives Considered

| Alternative | Pros | Cons |
|-------------|------|------|
| **Plaid** (recommended) | Largest bank coverage (12,000+), mature API, React SDK, strong documentation | Opaque pricing, vendor lock-in |
| **MX** | Strong data enrichment, similar coverage | Higher cost, less developer documentation |
| **Yodlee** | Long-standing provider, screen-scraping fallback | Higher per-connection cost, slower onboarding |
| **Teller** | Developer-friendly, transparent pricing | Smaller bank coverage (~5,000), newer product |
| **SnapTrade** | Open-source client, competitive pricing | Focused more on investment accounts |
| **Keep current PDF approach** | No additional cost, no vendor dependency | High user friction, stale data, fragile parsing |

---

## 10. Decision Points

Before implementation begins, the following decisions should be made:

1. ~~**Scope:** Plaid for personal use only, or plan for multi-user from the start?~~ → **Decided: Multi-user from the start.** Household shared accounts supported via `is_shared_account` on plaid_accounts + existing attribution system.
2. ~~**Coexistence:** Should Plaid fully replace PDF uploads, or run alongside it?~~ → **Decided: Run alongside.** PDF upload remains for all tiers. Plaid is an additional Pro feature.
3. **Classification:** Use Plaid's built-in categories as-is, map them to existing user categories, or still run the OpenAI classifier?
   - **Recommended:** Map Plaid category to user's closest category (deterministic), fall back to AI classifier for unmapped.
4. **Encryption approach:** Use application-level encryption (AES in Node.js) or Supabase Vault for access tokens?
   - **Recommended:** Application-level AES-256-GCM. Simpler, no Supabase Vault dependency.
5. ~~**Webhook infrastructure:** Use Vercel's existing API routes for webhooks, or set up a separate always-on endpoint?~~ → **Decided: Vercel API routes.** Same pattern as existing Stripe webhook (`express.raw()` + signature verification).

---

## 11. References

- [Plaid Pricing (US & Canada)](https://plaid.com/pricing/)
- [Plaid Transactions API Reference](https://plaid.com/docs/api/products/transactions/)
- [Plaid Transactions Integration Guide](https://plaid.com/docs/transactions/)
- [Plaid Link Web Documentation](https://plaid.com/docs/link/web/)
- [react-plaid-link (npm)](https://www.npmjs.com/package/react-plaid-link)
- [react-plaid-link (GitHub)](https://github.com/plaid/react-plaid-link)
- [Plaid Sandbox Overview](https://plaid.com/docs/sandbox/)
- [Plaid Billing & Pricing Docs](https://plaid.com/docs/account/billing/)
- [Plaid Pattern — Example Integration (GitHub)](https://github.com/plaid/pattern)
