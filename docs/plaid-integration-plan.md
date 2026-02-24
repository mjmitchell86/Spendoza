# Plaid Integration Planning Document

**Date:** 2026-02-24
**Status:** Proposal / Discovery

---

## 1. Executive Summary

Spendoza currently relies on users uploading PDF bank statements, which are then processed through an AI pipeline (text extraction → transaction parsing → classification → matching). This works but introduces friction: users must manually download and upload statements, data is only as fresh as the last upload, and PDF parsing is inherently fragile across different bank formats.

Integrating [Plaid](https://plaid.com) would allow users to link their bank accounts directly, enabling automatic, near-real-time transaction syncing without manual uploads. This document explores the technical requirements, architectural changes, cost implications, and rollout strategy for adding Plaid as a transaction data source.

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
User uploads PDF
  → Supabase Storage
  → AI Pipeline (4 steps):
      1. extract_text (pdf-parser)
      2. extract_transactions (OpenAI)
      3. classify_transactions (OpenAI)
      4. match_and_insert (deterministic)
  → transactions table (tied to bank_statement_id)
  → bill detection + report generation
```

### Current Schema Constraints

The `transactions` table currently has:
- `bank_statement_id UUID NOT NULL` — every transaction **must** belong to a bank statement
- No concept of a linked account, Plaid Item, or external transaction ID
- No field for Plaid's richer metadata (merchant name, location, pending status, Plaid category)

### Proposed New Data Flow (Plaid Path)

```
User links account via Plaid Link
  → API stores access_token + Item metadata
  → Initial sync: /transactions/sync → transform → insert
  → Ongoing: webhook fires → /transactions/sync (incremental) → transform → insert
  → Same downstream pipeline: classification, matching, bill detection, reports
```

### 3.1 Database Schema Changes

#### New Tables

```sql
-- Plaid Items: one per bank connection per user
CREATE TABLE plaid_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plaid_item_id TEXT NOT NULL UNIQUE,        -- Plaid's Item ID
  access_token TEXT NOT NULL,                 -- encrypted at rest
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

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/plaid/create-link-token` | Generate a Plaid Link token for the frontend |
| `POST` | `/api/plaid/exchange-token` | Exchange `public_token` for `access_token`, create Item + Accounts |
| `GET` | `/api/plaid/items` | List user's linked accounts |
| `DELETE` | `/api/plaid/items/:id` | Unlink an account (calls `/item/remove` on Plaid) |
| `POST` | `/api/plaid/items/:id/sync` | Manually trigger a transaction sync |
| `POST` | `/api/plaid/webhook` | Receive Plaid webhooks (no auth — verified by Plaid signature) |
| `POST` | `/api/plaid/items/:id/relink` | Generate a Link token in update mode for re-authentication |

### 3.3 Backend Service: Plaid Sync

A new `plaid.service.ts` would handle:

1. **Initial Sync** — After linking, fetch all available transactions (up to 2 years depending on institution). Paginate using `has_more` flag. Transform Plaid transactions into our `transactions` table format. Run classification + matching.
2. **Incremental Sync** — Called via webhook or manually. Uses stored cursor to fetch only new/modified/removed transactions. Handles transaction updates (amount changes on pending → posted) and removals.
3. **Error Handling** — Plaid Items can break (user changes password, bank revokes access). Listen for `ITEM_ERROR` webhooks, update Item status to `requires_reauth`, notify user in the UI.

### 3.4 Frontend Changes

| Component | Change |
|-----------|--------|
| New: `PlaidLinkButton` | Uses `react-plaid-link` to render the Plaid Link widget |
| New: `LinkedAccounts` page | Shows all connected accounts, sync status, ability to unlink or re-authenticate |
| Modified: Transaction list | Add a `source` indicator (Plaid vs. Statement). Support filtering by source. |
| Modified: Dashboard | Account for Plaid-sourced data in spending summaries |
| New: Re-auth banner | Prompt user to re-authenticate when an Item enters error state |

### 3.5 Shared Schema Changes

New Zod schemas in `packages/shared`:

```typescript
// schemas/plaid.ts
export const createLinkTokenResponseSchema = z.object({
  link_token: z.string(),
  expiration: z.string(),
});

export const exchangeTokenSchema = z.object({
  public_token: z.string(),
  institution_id: z.string().optional(),
  institution_name: z.string().optional(),
});

export interface PlaidItem {
  id: string;
  user_id: string;
  institution_name: string | null;
  status: 'active' | 'requires_reauth' | 'removed';
  last_synced_at: string | null;
  accounts: PlaidAccount[];
  created_at: string;
}

export interface PlaidAccount {
  id: string;
  name: string;
  official_name: string | null;
  type: string;
  subtype: string | null;
  mask: string | null;
  is_shared_account: boolean;
}
```

### 3.6 Security Considerations

| Concern | Mitigation |
|---------|------------|
| **Access token storage** | Encrypt `access_token` at rest using AES-256. Store encryption key in environment variable, not in code or DB. |
| **Webhook verification** | Verify Plaid webhook signatures using the `/webhook_verification_key/get` endpoint. Reject unsigned requests. |
| **Token exposure** | Access tokens never leave the server. Frontend only sees Link tokens (short-lived) and public tokens (single-use). |
| **Data minimization** | Only request the `transactions` product. Don't request `auth`, `identity`, or `assets` unless needed later. |
| **RLS** | Plaid Items and Accounts are protected by row-level security, same as existing tables. |

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

### Phase 1: Foundation (Backend + Database)

- [ ] Create database migration for `plaid_items`, `plaid_accounts`, and `transactions` table changes
- [ ] Add `plaid-node` npm package to `packages/api`
- [ ] Implement Plaid client configuration (client ID, secret, environment from env vars)
- [ ] Build `plaid.service.ts` with token exchange, account fetching, and transaction sync
- [ ] Implement access token encryption/decryption utility
- [ ] Add new API routes (`/api/plaid/*`)
- [ ] Add Zod schemas to `packages/shared`

### Phase 2: Webhook & Sync Engine

- [ ] Implement webhook endpoint with signature verification
- [ ] Handle `SYNC_UPDATES_AVAILABLE` webhook → trigger incremental sync
- [ ] Handle `ITEM_ERROR` webhook → mark Item as `requires_reauth`
- [ ] Handle transaction modifications (pending → posted amount changes)
- [ ] Handle transaction removals
- [ ] Integrate synced transactions with existing classification pipeline
- [ ] Integrate synced transactions with expense/income matching

### Phase 3: Frontend

- [ ] Add `react-plaid-link` package to `packages/web`
- [ ] Build "Link Account" flow using Plaid Link widget
- [ ] Build "Linked Accounts" management page (list, status, unlink, re-auth)
- [ ] Add source indicators to transaction list
- [ ] Add re-authentication banner/notification for broken Items
- [ ] Update dashboard to incorporate Plaid-sourced data

### Phase 4: Polish & Coexistence

- [ ] Ensure PDF upload and Plaid paths coexist (users may want both)
- [ ] Deduplicate transactions if the same transaction appears via both PDF and Plaid
- [ ] Update report generation to handle mixed-source data
- [ ] Add Plaid status to the household view (shared accounts)
- [ ] Write tests for all new endpoints and services
- [ ] Document environment variables and Plaid Dashboard setup in README

---

## 6. Environment Variables Required

```env
# Plaid Configuration
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_secret
PLAID_ENV=sandbox              # sandbox | development | production
PLAID_WEBHOOK_URL=https://your-api.vercel.app/api/plaid/webhook

# Encryption for access tokens
PLAID_TOKEN_ENCRYPTION_KEY=your_32_byte_hex_key
```

---

## 7. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Plaid pricing changes | Medium | Medium | Keep PDF upload as a fallback. Don't create a hard dependency. |
| Institution connectivity issues | Medium | Low | Show clear error states in UI. Allow manual sync trigger. |
| User re-authentication churn | Medium | Low | Proactive notifications when Items need re-auth. |
| Data discrepancies between Plaid & PDF | Low | Medium | Build deduplication logic by matching date + amount + description. |
| Access token compromise | Low | High | Encrypt at rest, never log tokens, rotate on suspicion. |
| Plaid rate limits | Low | Low | Respect rate limits, use webhooks instead of polling. |

---

## 8. Alternatives Considered

| Alternative | Pros | Cons |
|-------------|------|------|
| **Plaid** (recommended) | Largest bank coverage (12,000+), mature API, React SDK, strong documentation | Opaque pricing, vendor lock-in |
| **MX** | Strong data enrichment, similar coverage | Higher cost, less developer documentation |
| **Yodlee** | Long-standing provider, screen-scraping fallback | Higher per-connection cost, slower onboarding |
| **Teller** | Developer-friendly, transparent pricing | Smaller bank coverage (~5,000), newer product |
| **SnapTrade** | Open-source client, competitive pricing | Focused more on investment accounts |
| **Keep current PDF approach** | No additional cost, no vendor dependency | High user friction, stale data, fragile parsing |

---

## 9. Decision Points

Before implementation begins, the following decisions should be made:

1. **Scope:** Plaid for personal use only, or plan for multi-user from the start?
2. **Coexistence:** Should Plaid fully replace PDF uploads, or run alongside it?
3. **Classification:** Use Plaid's built-in categories as-is, map them to existing categories, or still run the OpenAI classifier?
4. **Encryption approach:** Use application-level encryption (AES in Node.js) or Supabase Vault for access tokens?
5. **Webhook infrastructure:** Use Vercel's existing API routes for webhooks, or set up a separate always-on endpoint?

---

## 10. References

- [Plaid Pricing (US & Canada)](https://plaid.com/pricing/)
- [Plaid Transactions API Reference](https://plaid.com/docs/api/products/transactions/)
- [Plaid Transactions Integration Guide](https://plaid.com/docs/transactions/)
- [Plaid Link Web Documentation](https://plaid.com/docs/link/web/)
- [react-plaid-link (npm)](https://www.npmjs.com/package/react-plaid-link)
- [react-plaid-link (GitHub)](https://github.com/plaid/react-plaid-link)
- [Plaid Sandbox Overview](https://plaid.com/docs/sandbox/)
- [Plaid Billing & Pricing Docs](https://plaid.com/docs/account/billing/)
- [Plaid Pattern — Example Integration (GitHub)](https://github.com/plaid/pattern)
