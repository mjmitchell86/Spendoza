# Weekly Email PDF Reports - Design Document

**Date:** 2026-02-26
**Status:** Approved

---

## 1. Overview

Proactively deliver weekly Spendoza financial reports to users via email every Saturday at 9am in their local timezone. Emails include an HTML summary with key financial metrics and AI insights, plus the full PDF report as an attachment. Reports are only sent when new transaction data and a fresh AI report are available since the last email.

### Goals

- Increase user engagement through proactive weekly delivery
- Provide value without requiring users to log in
- Support both personal and household report contexts
- Respect user preferences (opt-in/out, timezone)

---

## 2. Architecture

### Two-Stage Dispatch Pattern

Uses the same `pg_net` trigger pattern as the existing bank statement pipeline:

1. **Dispatcher** (`POST /api/emails/dispatch-weekly`) — Called hourly by pg_cron. Identifies users eligible for an email this hour based on timezone + Saturday + new data availability. Inserts one row per eligible email into `email_jobs`.

2. **Worker** (`POST /api/emails/send`) — Triggered per job via `pg_net` database trigger on `email_jobs` INSERT. Generates the PDF in-memory, builds the HTML email, and sends via Resend. Updates job status and logs the send.

```
pg_cron (hourly) → POST /api/emails/dispatch-weekly
  ├─ Query users where Saturday 9am falls in current UTC hour
  ├─ Check: new transactions + fresh AI report since last email
  └─ INSERT into email_jobs (one per user × report type)

pg_net trigger on email_jobs → POST /api/emails/send
  ├─ Generate PDF in-memory (reuses buildReportPdf)
  ├─ Build HTML email with key metrics
  ├─ Send via Resend with PDF attachment
  └─ Update email_jobs.status + INSERT email_report_log
```

### Email Service

- **Provider:** Resend
- **From address:** `no-reply@spendoza.io` (same for test and production)
- **Domain:** spendoza.io (configured in Vercel)
- **Template:** React Email for HTML content

---

## 3. Database Schema Changes

### 3.1 Add columns to `profiles`

```sql
ALTER TABLE profiles
  ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/New_York',
  ADD COLUMN email_reports_enabled BOOLEAN NOT NULL DEFAULT true;
```

- `timezone`: IANA timezone string (e.g., `America/Chicago`), auto-detected from browser on signup/login
- `email_reports_enabled`: User toggle for weekly emails, default enabled

### 3.2 New table: `email_jobs`

```sql
CREATE TABLE email_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entity_type entity_type NOT NULL,  -- 'user' or 'household'
  entity_id UUID NOT NULL,           -- user_id or household_id
  report_month DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, processing, sent, failed
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
```

With a `pg_net` trigger on INSERT that calls `POST /api/emails/send` with the job ID.

### 3.3 New table: `email_report_log`

```sql
CREATE TABLE email_report_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entity_type entity_type NOT NULL,
  entity_id UUID NOT NULL,
  report_month DATE NOT NULL,
  email_subject TEXT,
  email_preview TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, entity_type, entity_id, report_month)
);
```

### 3.4 New pg_cron job

```sql
-- Hourly cron to dispatch weekly email reports
SELECT cron.schedule(
  'weekly-email-dispatch',
  '0 * * * *',  -- Every hour
  $$SELECT net.http_post(
    url := current_setting('app.settings.api_base_url') || '/api/emails/dispatch-weekly',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret')
    ),
    body := '{}'::jsonb
  )$$
);
```

---

## 4. Eligibility Logic

For each user where `email_reports_enabled = true`:

1. **Saturday 9am in their timezone?** — Convert current UTC hour to user's IANA timezone. If it's Saturday and hour = 9, eligible.
2. **New transactions?** — `EXISTS(SELECT 1 FROM transactions WHERE user_id = $1 AND created_at > last_sent_at)`
3. **Fresh AI report?** — `reports.generated_at > last_sent_at` for the user's current-month report
4. **Not already emailed?** — No matching row in `email_report_log` for this month

All 4 conditions must be true. Same logic applies for household reports (check any household member has new transactions).

---

## 5. Email Content

### HTML Email (React Email template)

- **Header:** Spendoza branding + "Your Weekly Financial Report — [Month Year]"
- **Metric Cards:** Total Income, Total Expenses, Net Savings, Savings Rate
- **AI Insights:** Top 2-3 bullet points from the report's `ai_insights`
- **CTA Button:** "View Full Report in Spendoza" → links to app report page
- **Footer:** "You're receiving this because you enabled Spendoza Reports. [Unsubscribe]"

### PDF Attachment

Generated in-memory using the existing `buildReportPdf()` function with the same rich layout (metric cards, bar charts, styled tables, goal progress, etc.). Attached as `spendoza-report-YYYY-MM.pdf`.

---

## 6. Frontend Changes

### 6.1 Onboarding (Complete step)

Add below the existing completion message:
- Toggle: "Email me weekly Spendoza Reports" (default: on)
- Auto-detect timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone` and POST to `/api/profile`

### 6.2 Profile Page

New section: **"Notifications"** (between Appearance and Account):
- Toggle: "Weekly Email Reports" with subtitle "Receive your report every Saturday at 9am"
- Timezone display with edit capability (dropdown of IANA timezones)

### 6.3 Unsubscribe Endpoint

`GET /api/emails/unsubscribe?token=...`
- Token: signed JWT containing `{ userId, action: 'unsubscribe' }`
- Sets `email_reports_enabled = false`
- Returns simple HTML confirmation page

---

## 7. API Endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/emails/dispatch-weekly` | CRON_SECRET | Hourly dispatcher — finds eligible users, creates jobs |
| POST | `/api/emails/send` | CRON_SECRET | Worker — processes one email job |
| GET | `/api/emails/unsubscribe` | Signed token | Toggle off email reports for a user |

---

## 8. Dependencies

- `resend` — Email sending API
- `@react-email/components` — HTML email templates
- `jsonwebtoken` — Signed unsubscribe tokens (already may be available via Supabase)
