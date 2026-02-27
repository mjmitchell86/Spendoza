# Spendoza Break-Even & Profitability Analysis

_February 2026_

---

## 1. Cost Structure

### Fixed Operational Costs (monthly)

These costs are incurred regardless of user count.

| Service | Cost | Notes |
|---------|------|-------|
| Vercel Pro | $20 | 4 projects (web + API, test + prod) |
| Supabase Pro (prod) | $25 | 8 GB database, 100K MAUs, 100 GB storage included |
| Supabase Pro (test) | $25 | Can pause when not developing to save $25/mo |
| Domain (spendoza.io) | $4 | ~$50/year |
| Resend | $0 | Free tier: 3,000 emails/mo |
| **Total (with test)** | **$74** | |
| **Total (prod only)** | **$49** | Pausing test Supabase |

> **Development cost (not operational):** Claude Max $100/mo for AI-assisted development. This is a founder/developer expense, not a per-user operational cost, and is excluded from break-even calculations.

### Per-User Variable Costs (monthly)

#### Scenario A: PDF Upload Only (current model)

| Service | Per-User Cost | Basis |
|---------|---------------|-------|
| OpenAI (gpt-5-mini) | $0.05--0.15 | Statement parsing, categorization, insights, goals |
| Vercel compute | ~$0.01 | Serverless function execution |
| Supabase | ~$0.01 | Storage/bandwidth (negligible within Pro limits) |
| Resend | $0.00 | Weekly emails within free tier |
| **Total** | **~$0.10** | |

#### Scenario B: With Plaid Integration

Plaid's Transactions product uses a **subscription billing model** -- a monthly fee per connected Item (bank connection) for as long as it exists. Pricing is volume-dependent and negotiable.

| Service | Per-User Cost | Basis |
|---------|---------------|-------|
| Plaid Transactions | $1.00--3.00 | ~2 bank links/user at $0.50--1.50/Item/mo |
| OpenAI (gpt-5-mini) | $0.02--0.05 | Reduced (Plaid provides merchant/category data) |
| Vercel compute | ~$0.02 | More API calls from webhook processing |
| Supabase | ~$0.01 | Additional transaction storage |
| Resend | $0.00 | Weekly emails within free tier |
| **Total (optimistic)** | **~$1.00** | Volume discount, efficient linking |
| **Total (mid-range)** | **~$2.00** | Standard Plaid pricing |
| **Total (conservative)** | **~$3.00** | Higher per-item cost, 3 bank links |

### Scaling Thresholds

Costs that step up at specific user counts:

| Threshold | Trigger | Additional Cost |
|-----------|---------|-----------------|
| ~750 users | Resend free tier exceeded (3,000 emails at 4/user/mo) | +$20/mo (Pro: 50K emails) |
| ~12,500 users | Resend Pro exceeded | +$90/mo (Scale: 100K emails) |
| ~2,000 users | Supabase storage/bandwidth overages likely | +$10--25/mo estimated |
| ~5,000 users | Vercel compute overages possible | +$10--20/mo estimated |

---

## 2. Break-Even Analysis

### Without Plaid (PDF upload model)

Fixed operational cost: **$49/mo** (prod Supabase only)
Per-user variable cost: **$0.10/mo**

| Subscription Price | Contribution/User | Break-Even Users | Break-Even Revenue |
|-------------------|-------------------|------------------|-------------------|
| **$1.99/mo** | $1.89 | **26** | $52/mo |
| **$2.99/mo** | $2.89 | **17** | $51/mo |
| **$3.99/mo** | $3.89 | **13** | $52/mo |
| **$4.99/mo** | $4.89 | **11** | $55/mo |

> Break-even is very achievable without Plaid. Even at $1.99, only 26 paying users are needed to cover operational costs.

### With Plaid (mid-range estimate: $2.00/user variable cost)

Fixed operational cost: **$49/mo**
Per-user variable cost: **$2.00/mo**

| Subscription Price | Contribution/User | Break-Even Users | Break-Even Revenue |
|-------------------|-------------------|------------------|-------------------|
| **$1.99/mo** | -$0.01 | **Never** | N/A |
| **$2.99/mo** | $0.99 | **50** | $150/mo |
| **$3.99/mo** | $1.99 | **25** | $100/mo |
| **$4.99/mo** | $2.99 | **17** | $85/mo |

> **Critical:** At $1.99/mo with Plaid, every user is a net loss. The minimum viable price with Plaid is ~$3.00/mo.

### With Plaid (optimistic: $1.00/user variable cost)

Fixed operational cost: **$49/mo**
Per-user variable cost: **$1.00/mo**

| Subscription Price | Contribution/User | Break-Even Users | Break-Even Revenue |
|-------------------|-------------------|------------------|-------------------|
| **$1.99/mo** | $0.99 | **50** | $100/mo |
| **$2.99/mo** | $1.99 | **25** | $75/mo |
| **$3.99/mo** | $2.99 | **17** | $68/mo |
| **$4.99/mo** | $3.99 | **13** | $65/mo |

---

## 3. Profitability Analysis

### Monthly Profit by User Count (Without Plaid, $0.10/user variable cost)

| Users | $1.99/mo | $2.99/mo | $3.99/mo | $4.99/mo |
|-------|----------|----------|----------|----------|
| 10 | -$30 | -$20 | -$10 | $0 |
| 25 | -$2 | $23 | $48 | $73 |
| 50 | $46 | $96 | $146 | $196 |
| 100 | $140 | $240 | $340 | $440 |
| 250 | $424 | $674 | $924 | $1,174 |
| 500 | $896 | $1,396 | $1,896 | $2,396 |
| 1,000 | $1,841 | $2,841 | $3,841 | $4,841 |

_Formula: (price - $0.10) x users - $49 fixed. Resend upgrade (+$20) applied at 750+ users._

### Monthly Profit by User Count (With Plaid, $2.00/user variable cost)

| Users | $2.99/mo | $3.99/mo | $4.99/mo | $6.99/mo |
|-------|----------|----------|----------|----------|
| 10 | -$39 | -$29 | -$19 | $1 |
| 25 | -$24 | $1 | $26 | $76 |
| 50 | $1 | $51 | $101 | $201 |
| 100 | $50 | $150 | $250 | $450 |
| 250 | $199 | $449 | $699 | $1,199 |
| 500 | $446 | $946 | $1,446 | $2,446 |
| 1,000 | $921 | $1,921 | $2,921 | $4,921 |

_Formula: (price - $2.00) x users - $49 fixed. Resend upgrade (+$20) applied at 750+ users._

### Annual Revenue Projections (Without Plaid)

| Users | $1.99/mo | $2.99/mo | $3.99/mo | $4.99/mo |
|-------|----------|----------|----------|----------|
| 50 | $552 | $1,152 | $1,752 | $2,352 |
| 100 | $1,680 | $2,880 | $4,080 | $5,280 |
| 250 | $5,088 | $8,088 | $11,088 | $14,088 |
| 500 | $10,752 | $16,752 | $22,752 | $28,752 |
| 1,000 | $22,092 | $34,092 | $46,092 | $58,092 |

### Annual Revenue Projections (With Plaid)

| Users | $2.99/mo | $3.99/mo | $4.99/mo | $6.99/mo |
|-------|----------|----------|----------|----------|
| 50 | $12 | $612 | $1,212 | $2,412 |
| 100 | $600 | $1,800 | $3,000 | $5,400 |
| 250 | $2,388 | $5,388 | $8,388 | $14,388 |
| 500 | $5,352 | $11,352 | $17,352 | $29,352 |
| 1,000 | $11,052 | $23,052 | $35,052 | $59,052 |

---

## 4. Recommended Pricing Strategy

### Option A: Tiered Model (Recommended)

| Tier | Price | Features | Target |
|------|-------|----------|--------|
| **Free** | $0 | PDF upload (2 statements/mo), basic dashboard, manual categorization | Trial / low-usage |
| **Starter** | $1.99/mo | Unlimited PDF uploads, AI categorization, weekly email reports, goals | Budget-conscious users |
| **Pro** | $4.99/mo | Everything in Starter + Plaid bank linking (up to 3 accounts), household features | Power users |

**Why this works:**
- Free tier drives adoption with zero cost to serve
- $1.99 Starter is profitable at just 26 users (no Plaid costs)
- $4.99 Pro covers Plaid costs with healthy ~$2.00/user margin
- Users self-select: casual users stay on Starter, engaged users upgrade for Plaid convenience

**Projected blended economics (at 100 users, 60/30/10 split):**
- 10 free users: $0 revenue, ~$1/mo cost
- 60 Starter users: $119/mo revenue, $6/mo variable cost
- 30 Pro users: $150/mo revenue, $60/mo variable cost (Plaid)
- **Total: $269/mo revenue, $116/mo cost (fixed + variable) = $153/mo profit**

### Option B: Flat Rate (Simpler)

| Price | Model | Break-Even |
|-------|-------|------------|
| **$2.99/mo** | All features including Plaid | 50 users (Plaid) or 17 users (no Plaid) |

Simpler but lower margin. Only viable if Plaid costs come in at the optimistic end (~$1.00/user).

### Option C: Annual Discount

Offer 2 months free on annual billing to improve cash flow and reduce churn:

| Tier | Monthly | Annual (per month) | Annual Total |
|------|---------|-------------------|-------------|
| Starter | $1.99 | $1.66 | $19.90/yr |
| Pro | $4.99 | $4.16 | $49.90/yr |

---

## 5. Key Insights

1. **$1.99/mo is viable without Plaid** -- break-even at just 26 users with strong unit economics ($1.89 contribution margin)

2. **$1.99/mo is NOT viable with Plaid** -- Plaid's subscription costs ($1-3/user/mo) make $1.99 a loss leader or break-even at best

3. **Tiered pricing is the clear winner** -- lets budget users pay $1.99 (PDF-only, high margin) while Plaid users pay enough to cover the integration cost

4. **Plaid pricing is negotiable** -- volume commitments and longer contracts can reduce per-Item costs significantly. Negotiate before launch.

5. **The first 50 users are most expensive** -- fixed costs dominate. After break-even, margins improve rapidly since variable costs are low.

6. **1,000 users at the tiered model generates ~$2,500-4,000/mo profit** -- meaningful side-project income without requiring massive scale

---

## Sources

- [Plaid Pricing](https://plaid.com/pricing/) -- official pricing page
- [Plaid Billing Documentation](https://plaid.com/docs/account/billing/) -- billing models explained
- [Supabase Pricing](https://supabase.com/pricing) -- plan limits and overage costs
- [Resend Pricing](https://resend.com/pricing) -- email delivery plans
- [Spendoza Plaid Integration Plan](./plaid-integration-plan.md) -- internal cost projections
