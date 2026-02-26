# Weekly Email PDF Reports Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Proactively email users their Spendoza financial PDF reports every Saturday at 9am in their timezone, with an HTML summary and PDF attachment, using a queue-based dispatcher/worker pattern.

**Architecture:** Hourly pg_cron calls a dispatcher endpoint that identifies eligible users (Saturday 9am in their timezone, new data available). For each eligible user, it inserts a job into `email_jobs`. A pg_net trigger on that table fires a worker endpoint per job that generates the PDF, builds the HTML email via React Email, and sends via Resend. Users control this via a toggle on onboarding and profile pages.

**Tech Stack:** Resend (email API), React Email (HTML templates), pg_cron + pg_net (scheduling/dispatch), PDFKit (existing PDF generation), Zod (validation), Express (API routes)

---

### Task 1: Database Migration — Profile Columns + Email Tables

**Files:**
- Create: `packages/api/supabase/migrations/00013_weekly_email_reports.sql`

**Step 1: Write the migration SQL**

Create `packages/api/supabase/migrations/00013_weekly_email_reports.sql`:

```sql
-- Add timezone and email preference to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/New_York',
  ADD COLUMN IF NOT EXISTS email_reports_enabled BOOLEAN NOT NULL DEFAULT true;

-- Email job queue (dispatcher inserts, pg_net trigger fires worker)
CREATE TABLE email_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entity_type entity_type NOT NULL,
  entity_id UUID NOT NULL,
  report_month DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_email_jobs_status ON email_jobs(status) WHERE status = 'pending';

-- Email send log (tracks what was sent, prevents duplicates)
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

CREATE INDEX idx_email_report_log_user ON email_report_log(user_id);

-- pg_net trigger: dispatch worker for each new email job
CREATE OR REPLACE FUNCTION dispatch_email_job()
RETURNS TRIGGER AS $$
DECLARE
  _api_base_url TEXT;
  _cron_secret TEXT;
BEGIN
  IF NEW.status = 'pending' THEN
    SELECT decrypted_secret INTO _api_base_url
    FROM vault.decrypted_secrets WHERE name = 'api_base_url';

    SELECT decrypted_secret INTO _cron_secret
    FROM vault.decrypted_secrets WHERE name = 'cron_secret';

    PERFORM net.http_post(
      url := _api_base_url || '/api/emails/send',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _cron_secret
      ),
      body := jsonb_build_object('job_id', NEW.id::text)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_dispatch_email_job
  AFTER INSERT ON email_jobs
  FOR EACH ROW
  EXECUTE FUNCTION dispatch_email_job();

-- Hourly cron job to dispatch weekly emails
SELECT cron.schedule(
  'weekly-email-dispatch',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.api_base_url') || '/api/emails/dispatch-weekly',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- RLS policies for email tables
ALTER TABLE email_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_report_log ENABLE ROW LEVEL SECURITY;

-- Only service role can access these tables (no client access needed)
CREATE POLICY "Service role only" ON email_jobs FOR ALL USING (false);
CREATE POLICY "Service role only" ON email_report_log FOR ALL USING (false);
```

**Step 2: Verify migration file exists and is syntactically valid**

Run: `bun run typecheck`
Expected: PASS (migration is SQL, doesn't affect TS typecheck, but ensures nothing else broke)

**Step 3: Commit**

```bash
git add packages/api/supabase/migrations/00013_weekly_email_reports.sql
git commit -m "feat: add email_jobs, email_report_log tables and profile timezone/email columns"
```

---

### Task 2: Update Shared Profile Schema

**Files:**
- Modify: `packages/shared/src/schemas/profile.ts`

**Step 1: Add timezone and email_reports_enabled to the Profile interface and updateProfileSchema**

In `packages/shared/src/schemas/profile.ts`, update the `updateProfileSchema` (line 15) to add the new optional fields:

```typescript
export const updateProfileSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  income_sharing_mode: incomeSharingModeSchema.optional(),
  shared_income_amount: z.number().positive().nullable().optional(),
  expense_sharing_mode: expenseSharingModeSchema.optional(),
  avatar_url: z.string().url().nullable().optional(),
  timezone: z.string().min(1).max(100).optional(),
  email_reports_enabled: z.boolean().optional(),
});
```

Update the `Profile` interface (line 28) to add the new fields:

```typescript
export interface Profile {
  id: string;
  display_name: string;
  onboarding_completed: boolean;
  household_id: string | null;
  income_sharing_mode: IncomeSharingMode;
  shared_income_amount: number | null;
  expense_sharing_mode: ExpenseSharingMode;
  avatar_url: string | null;
  timezone: string;
  email_reports_enabled: boolean;
  created_at: string;
  updated_at: string;
}
```

**Step 2: Run typecheck to verify**

Run: `bun run typecheck`
Expected: PASS (or may show downstream errors in web/api that reference Profile — those will be fixed in later tasks)

**Step 3: Commit**

```bash
git add packages/shared/src/schemas/profile.ts
git commit -m "feat: add timezone and email_reports_enabled to profile schema"
```

---

### Task 3: Install Resend + React Email Dependencies

**Files:**
- Modify: `packages/api/package.json`

**Step 1: Install resend in the API package**

Run from repo root:
```bash
cd packages/api && bun add resend
```

**Step 2: Verify installation**

Run: `bun run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/api/package.json bun.lockb
git commit -m "feat: add resend dependency for email sending"
```

---

### Task 4: Email Service — Resend Client + Send Function

**Files:**
- Create: `packages/api/src/services/email.service.ts`
- Create: `packages/api/src/__tests__/unit/email.service.test.ts`

**Step 1: Write the failing test**

Create `packages/api/src/__tests__/unit/email.service.test.ts`:

```typescript
import { describe, it, expect, mock, beforeEach } from "bun:test";

// Mock resend before importing the service
const mockSend = mock(() =>
  Promise.resolve({ data: { id: "email-123" }, error: null })
);
mock.module("resend", () => ({
  Resend: class {
    emails = { send: mockSend };
  },
}));

// Now import the service
const { sendReportEmail } = await import("../../services/email.service");

describe("email.service", () => {
  beforeEach(() => {
    mockSend.mockClear();
    process.env.RESEND_API_KEY = "re_test_123";
  });

  it("sends email with PDF attachment via Resend", async () => {
    const result = await sendReportEmail({
      to: "user@example.com",
      subject: "Your Spendoza Report — January 2026",
      htmlBody: "<h1>Report</h1>",
      pdfBuffer: Buffer.from("fake-pdf"),
      pdfFilename: "spendoza-report-2026-01.pdf",
    });

    expect(result.success).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);

    const callArgs = mockSend.mock.calls[0][0] as any;
    expect(callArgs.from).toBe("Spendoza <no-reply@spendoza.io>");
    expect(callArgs.to).toBe("user@example.com");
    expect(callArgs.subject).toBe("Your Spendoza Report — January 2026");
    expect(callArgs.attachments).toHaveLength(1);
    expect(callArgs.attachments[0].filename).toBe("spendoza-report-2026-01.pdf");
  });

  it("returns error when Resend fails", async () => {
    mockSend.mockImplementationOnce(() =>
      Promise.resolve({ data: null, error: { message: "API key invalid" } })
    );

    const result = await sendReportEmail({
      to: "user@example.com",
      subject: "Test",
      htmlBody: "<h1>Test</h1>",
      pdfBuffer: Buffer.from("fake-pdf"),
      pdfFilename: "test.pdf",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("API key invalid");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/api && bun test src/__tests__/unit/email.service.test.ts`
Expected: FAIL (module not found)

**Step 3: Write the implementation**

Create `packages/api/src/services/email.service.ts`:

```typescript
import { Resend } from "resend";

const FROM_ADDRESS = "Spendoza <no-reply@spendoza.io>";

interface SendReportEmailInput {
  to: string;
  subject: string;
  htmlBody: string;
  pdfBuffer: Buffer;
  pdfFilename: string;
}

interface SendResult {
  success: boolean;
  emailId?: string;
  error?: string;
}

export async function sendReportEmail(
  input: SendReportEmailInput
): Promise<SendResult> {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: input.to,
    subject: input.subject,
    html: input.htmlBody,
    attachments: [
      {
        filename: input.pdfFilename,
        content: input.pdfBuffer,
      },
    ],
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, emailId: data?.id };
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/api && bun test src/__tests__/unit/email.service.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `bun run test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add packages/api/src/services/email.service.ts packages/api/src/__tests__/unit/email.service.test.ts
git commit -m "feat: add email service with Resend integration"
```

---

### Task 5: Email HTML Template Builder

**Files:**
- Create: `packages/api/src/services/email-template.service.ts`
- Create: `packages/api/src/__tests__/unit/email-template.service.test.ts`

**Step 1: Write the failing test**

Create `packages/api/src/__tests__/unit/email-template.service.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { buildReportEmailHtml } from "../../services/email-template.service";

describe("email-template.service", () => {
  it("builds HTML with key financial metrics", () => {
    const html = buildReportEmailHtml({
      userName: "Matt",
      reportTitle: "Personal Report",
      monthLabel: "January 2026",
      totalIncome: 7500,
      totalExpenses: 2200,
      netSavings: 5300,
      savingsRate: 70.67,
      aiInsights: [
        "Your savings rate is strong at 70.67%.",
        "Housing is your largest expense at $1,400.",
      ],
      appReportUrl: "https://spendoza.io/dashboard",
      unsubscribeUrl: "https://api.spendoza.io/api/emails/unsubscribe?token=abc",
    });

    expect(html).toContain("Matt");
    expect(html).toContain("January 2026");
    expect(html).toContain("$7,500");
    expect(html).toContain("$2,200");
    expect(html).toContain("$5,300");
    expect(html).toContain("70.67%");
    expect(html).toContain("Your savings rate is strong");
    expect(html).toContain("Housing is your largest expense");
    expect(html).toContain("spendoza.io/dashboard");
    expect(html).toContain("unsubscribe");
  });

  it("handles missing AI insights gracefully", () => {
    const html = buildReportEmailHtml({
      userName: "Test",
      reportTitle: "Personal Report",
      monthLabel: "Feb 2026",
      totalIncome: 0,
      totalExpenses: 0,
      netSavings: 0,
      savingsRate: 0,
      aiInsights: [],
      appReportUrl: "https://spendoza.io/dashboard",
      unsubscribeUrl: "https://api.spendoza.io/api/emails/unsubscribe?token=xyz",
    });

    expect(html).toContain("Test");
    expect(html).not.toContain("undefined");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/api && bun test src/__tests__/unit/email-template.service.test.ts`
Expected: FAIL (module not found)

**Step 3: Write the implementation**

Create `packages/api/src/services/email-template.service.ts`:

```typescript
interface ReportEmailData {
  userName: string;
  reportTitle: string;
  monthLabel: string;
  totalIncome: number;
  totalExpenses: number;
  netSavings: number;
  savingsRate: number;
  aiInsights: string[];
  appReportUrl: string;
  unsubscribeUrl: string;
}

function formatCurrency(amount: number): string {
  return `$${Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function buildReportEmailHtml(data: ReportEmailData): string {
  const insightsHtml =
    data.aiInsights.length > 0
      ? `
        <div style="background-color:#f0fdf4;border-radius:8px;padding:16px 20px;margin:24px 0;">
          <h3 style="margin:0 0 12px;font-size:16px;color:#166534;">AI Insights</h3>
          <ul style="margin:0;padding-left:20px;color:#15803d;">
            ${data.aiInsights.map((insight) => `<li style="margin-bottom:8px;">${insight}</li>`).join("")}
          </ul>
        </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${data.reportTitle} - ${data.monthLabel}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#10b981,#059669);border-radius:12px 12px 0 0;padding:32px 24px;text-align:center;">
      <h1 style="margin:0;font-size:24px;color:#ffffff;font-weight:700;">Spendoza</h1>
      <p style="margin:8px 0 0;color:#d1fae5;font-size:14px;">Your Weekly Financial Report</p>
    </div>

    <!-- Body -->
    <div style="background-color:#ffffff;padding:32px 24px;border-radius:0 0 12px 12px;">
      <p style="margin:0 0 8px;font-size:16px;color:#27272a;">Hi ${data.userName},</p>
      <p style="margin:0 0 24px;font-size:14px;color:#71717a;">Here's your ${data.reportTitle.toLowerCase()} for <strong>${data.monthLabel}</strong>.</p>

      <!-- Metric Cards -->
      <div style="display:flex;gap:12px;margin-bottom:24px;">
        <div style="flex:1;background-color:#f0fdf4;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:12px;color:#71717a;margin-bottom:4px;">Income</div>
          <div style="font-size:20px;font-weight:700;color:#166534;">${formatCurrency(data.totalIncome)}</div>
        </div>
        <div style="flex:1;background-color:#fef2f2;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:12px;color:#71717a;margin-bottom:4px;">Expenses</div>
          <div style="font-size:20px;font-weight:700;color:#991b1b;">${formatCurrency(data.totalExpenses)}</div>
        </div>
      </div>
      <div style="display:flex;gap:12px;margin-bottom:24px;">
        <div style="flex:1;background-color:#eff6ff;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:12px;color:#71717a;margin-bottom:4px;">Net Savings</div>
          <div style="font-size:20px;font-weight:700;color:#1e40af;">${formatCurrency(data.netSavings)}</div>
        </div>
        <div style="flex:1;background-color:#faf5ff;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:12px;color:#71717a;margin-bottom:4px;">Savings Rate</div>
          <div style="font-size:20px;font-weight:700;color:#6b21a8;">${data.savingsRate.toFixed(2)}%</div>
        </div>
      </div>

      ${insightsHtml}

      <!-- CTA -->
      <div style="text-align:center;margin:32px 0 16px;">
        <a href="${data.appReportUrl}" style="display:inline-block;background-color:#10b981;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
          View Full Report in Spendoza
        </a>
      </div>

      <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;text-align:center;">
        The full PDF report is attached to this email.
      </p>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:24px 0;font-size:12px;color:#a1a1aa;">
      <p style="margin:0;">You're receiving this because you enabled Spendoza Reports.</p>
      <p style="margin:8px 0 0;"><a href="${data.unsubscribeUrl}" style="color:#a1a1aa;text-decoration:underline;">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>`;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/api && bun test src/__tests__/unit/email-template.service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/api/src/services/email-template.service.ts packages/api/src/__tests__/unit/email-template.service.test.ts
git commit -m "feat: add HTML email template builder for weekly reports"
```

---

### Task 6: PDF Generation Helper — Extract Reusable Logic from Reports Route

The export/personal and export/household endpoints in `packages/api/src/routes/reports.ts` (lines 268-417 and 422-624) contain the data-fetching + PDF-building logic inline. We need a reusable function the email worker can call.

**Files:**
- Create: `packages/api/src/services/pdf-export.service.ts`
- Create: `packages/api/src/__tests__/unit/pdf-export.service.test.ts`

**Step 1: Write the failing test**

Create `packages/api/src/__tests__/unit/pdf-export.service.test.ts`:

```typescript
import { describe, it, expect, mock, beforeAll } from "bun:test";

// Mock supabase
const mockFrom = mock(() => ({}));
mock.module("../../lib/supabase", () => ({
  supabaseAdmin: { from: mockFrom },
}));

// Mock report service
mock.module("../../services/report.service", () => ({
  generateUserReport: mock(() =>
    Promise.resolve({
      report_data: {
        total_income: 5000,
        total_expenses: 2000,
        savings_rate: 60,
        expense_to_income_ratio: 0.4,
        by_category: [],
        top_categories: [],
        month_over_month: null,
      },
      ai_insights: "Test insights",
    })
  ),
  generateHouseholdReport: mock(() => Promise.resolve(null)),
}));

// Mock PDF service
const mockBuildPdf = mock(() => Promise.resolve(Buffer.from("fake-pdf")));
mock.module("../../services/pdf-report.service", () => ({
  buildReportPdf: mockBuildPdf,
}));

const { generatePersonalPdfForUser } = await import(
  "../../services/pdf-export.service"
);

describe("pdf-export.service", () => {
  it("exports generatePersonalPdfForUser function", () => {
    expect(typeof generatePersonalPdfForUser).toBe("function");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/api && bun test src/__tests__/unit/pdf-export.service.test.ts`
Expected: FAIL (module not found)

**Step 3: Write the implementation**

Create `packages/api/src/services/pdf-export.service.ts`. Extract the data-fetching and PDF-building logic from `packages/api/src/routes/reports.ts` lines 300-398 (personal) and 476-605 (household) into reusable functions:

```typescript
import { supabaseAdmin } from "../lib/supabase";
import {
  generateUserReport,
  generateHouseholdReport,
} from "./report.service";
import { buildReportPdf } from "./pdf-report.service";
import type { ReportData } from "../ai/report-insights";

// ---------------------------------------------------------------------------
// Helper: build savings recommendations (moved from reports route)
// ---------------------------------------------------------------------------
function buildSavingsRecommendations(
  reportData: ReportData,
  subscriptions: Array<{
    name: string;
    amount: number;
    category: string | null;
    recurrence_interval: string;
  }>
): Array<{
  category: string;
  amount: number;
  percentage: number;
  suggestion: string;
}> {
  if (!reportData.by_category || reportData.by_category.length === 0) return [];

  const total = reportData.total_expenses || 1;

  return reportData.by_category
    .filter((c) => c.percentage > 20)
    .slice(0, 3)
    .map((cat) => {
      const hasSub = subscriptions.some(
        (s) => s.category?.toLowerCase() === cat.category.toLowerCase()
      );
      const suggestion = hasSub
        ? `Review your ${cat.category.toLowerCase()} subscriptions for potential savings.`
        : `Your ${cat.category.toLowerCase()} spending is ${cat.percentage.toFixed(0)}% of total expenses. Look for ways to optimize.`;

      return {
        category: cat.category,
        amount: cat.amount,
        percentage: cat.percentage,
        suggestion,
      };
    });
}

// ---------------------------------------------------------------------------
// Build goal progress from report data + goals rows
// ---------------------------------------------------------------------------
function buildGoalProgress(
  goals: any[],
  reportData: ReportData
): Array<{
  name: string;
  goal_type: string;
  current: number;
  target: number;
  category_name: string | null;
  target_date: string | null;
}> {
  return goals.map((goal: any) => {
    let current = 0;
    if (goal.goal_type === "budget") {
      const catName = goal.categories?.name?.toLowerCase();
      if (catName && reportData.by_category) {
        const match = reportData.by_category.find(
          (c) => c.category?.toLowerCase() === catName
        );
        current = match?.amount ?? 0;
      }
    } else if (goal.goal_type === "monthly_savings") {
      current = reportData.total_income - reportData.total_expenses;
    } else if (goal.goal_type === "total_savings") {
      current = goal.current_amount ?? 0;
    }
    return {
      name: goal.name,
      goal_type: goal.goal_type,
      current,
      target: goal.target_amount,
      category_name: goal.categories?.name ?? null,
      target_date: goal.target_date ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Generate personal PDF for a user
// ---------------------------------------------------------------------------
export async function generatePersonalPdfForUser(
  userId: string,
  month: string // YYYY-MM-DD format
): Promise<{ pdfBuffer: Buffer; reportData: ReportData; aiInsights: string | null } | null> {
  // Get or regenerate report
  let { data: report } = await supabaseAdmin
    .from("reports")
    .select("*")
    .eq("entity_type", "user")
    .eq("entity_id", userId)
    .eq("report_month", month)
    .maybeSingle();

  if (!report || report.has_new_data === true) {
    report = await generateUserReport(userId, new Date(month + "T00:00:00Z"), true);
  }

  if (!report?.report_data) return null;

  const reportData = report.report_data as ReportData;

  // Fetch supplementary data in parallel
  const [
    { data: recurringBills },
    { data: incomeSources },
    { data: profile },
    { data: allRecurringExpenses },
    { data: goals },
  ] = await Promise.all([
    supabaseAdmin
      .from("expenses")
      .select("description, friendly_name, amount, recurrence_interval, next_due_date")
      .eq("user_id", userId)
      .eq("frequency", "recurring"),
    supabaseAdmin
      .from("income_entries")
      .select("source_name, amount, frequency, attributed_to_name")
      .eq("user_id", userId),
    supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .single(),
    supabaseAdmin
      .from("expenses")
      .select("description, friendly_name, amount, recurrence_interval, category_id, categories(name)")
      .eq("user_id", userId)
      .eq("frequency", "recurring")
      .or(`end_date.is.null,end_date.gte.${month}`),
    supabaseAdmin
      .from("goals")
      .select("*, categories(name)")
      .eq("user_id", userId),
  ]);

  const subscriptionsPaid = (allRecurringExpenses ?? []).map((e: any) => ({
    name: e.friendly_name || e.description,
    amount: e.amount ?? 0,
    category: e.categories?.name ?? null,
    recurrence_interval: e.recurrence_interval ?? "monthly",
  }));

  const goalProgress = buildGoalProgress(goals ?? [], reportData);
  const savingsRecommendations = buildSavingsRecommendations(reportData, subscriptionsPaid);

  const monthLabel = new Date(month + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const pdfBuffer = await buildReportPdf({
    title: profile?.display_name ?? "Personal",
    month: monthLabel,
    reportData,
    aiInsights: report.ai_insights ?? null,
    recurringBills: recurringBills ?? [],
    incomeSources: incomeSources ?? [],
    subscriptionsPaid,
    goalProgress,
    savingsRecommendations,
  });

  return { pdfBuffer, reportData, aiInsights: report.ai_insights ?? null };
}

// ---------------------------------------------------------------------------
// Generate household PDF
// ---------------------------------------------------------------------------
export async function generateHouseholdPdfForHousehold(
  householdId: string,
  month: string // YYYY-MM-DD format
): Promise<{ pdfBuffer: Buffer; reportData: ReportData; aiInsights: string | null } | null> {
  const { data: household } = await supabaseAdmin
    .from("households")
    .select("name")
    .eq("id", householdId)
    .single();

  let { data: report } = await supabaseAdmin
    .from("reports")
    .select("*")
    .eq("entity_type", "household")
    .eq("entity_id", householdId)
    .eq("report_month", month)
    .maybeSingle();

  if (!report || report.has_new_data === true) {
    report = await generateHouseholdReport(householdId, new Date(month + "T00:00:00Z"), true);
  }

  if (!report?.report_data) return null;

  const reportData = report.report_data as ReportData;

  const { data: members } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name")
    .eq("household_id", householdId);

  const memberIds = (members ?? []).map((m) => m.id);

  const [
    { data: recurringBills },
    { data: incomeSources },
    { data: allRecurringExpenses },
    { data: goals },
  ] = await Promise.all([
    supabaseAdmin
      .from("expenses")
      .select("description, friendly_name, amount, recurrence_interval, next_due_date")
      .in("user_id", memberIds)
      .eq("frequency", "recurring"),
    supabaseAdmin
      .from("income_entries")
      .select("source_name, amount, frequency, attributed_to_name")
      .in("user_id", memberIds),
    supabaseAdmin
      .from("expenses")
      .select("description, friendly_name, amount, recurrence_interval, category_id, categories(name)")
      .in("user_id", memberIds)
      .eq("frequency", "recurring")
      .or(`end_date.is.null,end_date.gte.${month}`),
    supabaseAdmin
      .from("goals")
      .select("*, categories(name)")
      .in("user_id", memberIds),
  ]);

  const subscriptionsPaid = (allRecurringExpenses ?? []).map((e: any) => ({
    name: e.friendly_name || e.description,
    amount: e.amount ?? 0,
    category: e.categories?.name ?? null,
    recurrence_interval: e.recurrence_interval ?? "monthly",
  }));

  const goalProgress = buildGoalProgress(goals ?? [], reportData);
  const savingsRecommendations = buildSavingsRecommendations(reportData, subscriptionsPaid);

  // Compute member contributions
  const monthEnd = new Date(
    new Date(month + "T00:00:00Z").getFullYear(),
    new Date(month + "T00:00:00Z").getMonth() + 1,
    0
  )
    .toISOString()
    .slice(0, 10);

  const memberContributions = await Promise.all(
    (members ?? []).map(async (member) => {
      const { data: txns } = await supabaseAdmin
        .from("transactions")
        .select("type, amount")
        .eq("user_id", member.id)
        .gte("date", month)
        .lte("date", monthEnd);

      let income = 0;
      let expenses = 0;
      for (const t of txns ?? []) {
        if (t.type === "credit") income += Number(t.amount);
        else if (t.type === "debit") expenses += Number(t.amount);
      }

      return { display_name: member.display_name ?? "Unknown", income, expenses };
    })
  );

  const monthLabel = new Date(month + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const pdfBuffer = await buildReportPdf({
    title: household?.name ?? "Household",
    month: monthLabel,
    reportData,
    aiInsights: report.ai_insights ?? null,
    recurringBills: recurringBills ?? [],
    incomeSources: incomeSources ?? [],
    memberContributions,
    subscriptionsPaid,
    goalProgress,
    savingsRecommendations,
  });

  return { pdfBuffer, reportData, aiInsights: report.ai_insights ?? null };
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/api && bun test src/__tests__/unit/pdf-export.service.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `bun run test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add packages/api/src/services/pdf-export.service.ts packages/api/src/__tests__/unit/pdf-export.service.test.ts
git commit -m "feat: extract reusable PDF generation helpers from reports route"
```

---

### Task 7: Unsubscribe Token Utilities

**Files:**
- Create: `packages/api/src/lib/unsubscribe-token.ts`
- Create: `packages/api/src/__tests__/unit/unsubscribe-token.test.ts`

**Step 1: Write the failing test**

Create `packages/api/src/__tests__/unit/unsubscribe-token.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "../../lib/unsubscribe-token";

describe("unsubscribe-token", () => {
  beforeEach(() => {
    process.env.UNSUBSCRIBE_SECRET = "test-secret-key-at-least-32-chars-long!!";
  });

  it("creates and verifies a valid token", () => {
    const token = createUnsubscribeToken("user-123");
    const result = verifyUnsubscribeToken(token);
    expect(result).toEqual({ valid: true, userId: "user-123" });
  });

  it("rejects a tampered token", () => {
    const token = createUnsubscribeToken("user-123");
    const tampered = token.slice(0, -5) + "xxxxx";
    const result = verifyUnsubscribeToken(tampered);
    expect(result.valid).toBe(false);
  });

  it("rejects a completely invalid token", () => {
    const result = verifyUnsubscribeToken("not-a-real-token");
    expect(result.valid).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/api && bun test src/__tests__/unit/unsubscribe-token.test.ts`
Expected: FAIL (module not found)

**Step 3: Write the implementation**

Create `packages/api/src/lib/unsubscribe-token.ts`:

Use HMAC-based tokens (simpler and stateless, no JWT dependency needed):

```typescript
import { createHmac } from "crypto";

function getSecret(): string {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) throw new Error("UNSUBSCRIBE_SECRET env var not set");
  return secret;
}

export function createUnsubscribeToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, ts: Date.now() })).toString("base64url");
  const signature = createHmac("sha256", getSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyUnsubscribeToken(
  token: string
): { valid: true; userId: string } | { valid: false } {
  try {
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return { valid: false };

    const expectedSig = createHmac("sha256", getSecret()).update(payload).digest("base64url");
    if (signature !== expectedSig) return { valid: false };

    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!data.uid) return { valid: false };

    return { valid: true, userId: data.uid };
  } catch {
    return { valid: false };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/api && bun test src/__tests__/unit/unsubscribe-token.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/api/src/lib/unsubscribe-token.ts packages/api/src/__tests__/unit/unsubscribe-token.test.ts
git commit -m "feat: add HMAC-based unsubscribe token utilities"
```

---

### Task 8: Email Routes — Dispatcher, Worker, Unsubscribe

**Files:**
- Create: `packages/api/src/routes/emails.ts`
- Modify: `packages/api/src/index.ts`
- Create: `packages/api/src/__tests__/integration/email-flow.test.ts`

**Step 1: Write the failing test**

Create `packages/api/src/__tests__/integration/email-flow.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, mock, beforeEach } from "bun:test";
import type { Server } from "http";

const TEST_USER_ID = "user-email-1";
const TEST_EMAIL = "email-test@example.com";
const CRON_SECRET = "test-cron-secret-email";
const TEST_HOUSEHOLD_ID = "hh-email-1";

let adminResults: Record<string, any> = {};
const adminCalls: Array<{ table: string; op: string; args?: any }> = [];

function buildChain(results: Record<string, any>, calls: typeof adminCalls) {
  return (table: string) => {
    const cfg = results[table] || {};

    const makeEqChain = (depth = 0): any => ({
      eq: (...args: any[]) => makeEqChain(depth + 1),
      gte: (...args: any[]) => makeEqChain(depth + 1),
      gt: (...args: any[]) => makeEqChain(depth + 1),
      lte: (...args: any[]) => makeEqChain(depth + 1),
      lt: (...args: any[]) => makeEqChain(depth + 1),
      or: (...args: any[]) => makeEqChain(depth + 1),
      is: (...args: any[]) => makeEqChain(depth + 1),
      not: (...args: any[]) => makeEqChain(depth + 1),
      in: (...args: any[]) => makeEqChain(depth + 1),
      order: (...args: any[]) => makeEqChain(depth + 1),
      limit: (...args: any[]) => makeEqChain(depth + 1),
      single: () =>
        Promise.resolve(cfg.selectSingle ?? { data: null, error: null }),
      maybeSingle: () =>
        Promise.resolve(
          cfg.selectMaybeSingle ?? cfg.selectSingle ?? { data: null, error: null }
        ),
      then: (resolve: any, reject?: any) => {
        const result = cfg.selectList ?? { data: [], error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    });

    return {
      select: (...selectArgs: any[]) => {
        calls.push({ table, op: "select", args: selectArgs });
        return makeEqChain();
      },
      insert: (data: any) => {
        calls.push({ table, op: "insert", args: data });
        return {
          select: () => ({
            single: () =>
              Promise.resolve(cfg.insertSingle ?? { data: null, error: null }),
          }),
          then: (resolve: any) =>
            Promise.resolve(cfg.insertResult ?? { data: null, error: null }).then(resolve),
        };
      },
      update: (data: any) => {
        calls.push({ table, op: "update", args: data });
        return makeEqChain();
      },
      upsert: (data: any) => {
        calls.push({ table, op: "upsert", args: data });
        return {
          select: () => ({
            single: () =>
              Promise.resolve(cfg.upsertSingle ?? { data: null, error: null }),
          }),
        };
      },
    };
  };
}

// Mock supabase
mock.module("../../lib/supabase", () => ({
  supabaseAdmin: {
    from: (...args: any[]) => buildChain(adminResults, adminCalls)(...args),
    auth: {
      getUser: () => Promise.resolve({
        data: { user: { id: TEST_USER_ID, email: TEST_EMAIL } },
        error: null,
      }),
      admin: {
        getUserById: () => Promise.resolve({
          data: { user: { email: TEST_EMAIL } },
          error: null,
        }),
      },
    },
  },
}));

// Mock email service
const mockSendEmail = mock(() =>
  Promise.resolve({ success: true, emailId: "email-abc" })
);
mock.module("../../services/email.service", () => ({
  sendReportEmail: mockSendEmail,
}));

// Mock PDF export
mock.module("../../services/pdf-export.service", () => ({
  generatePersonalPdfForUser: mock(() =>
    Promise.resolve({
      pdfBuffer: Buffer.from("fake-pdf"),
      reportData: {
        total_income: 5000,
        total_expenses: 2000,
        savings_rate: 60,
        expense_to_income_ratio: 0.4,
        by_category: [],
        top_categories: [],
        month_over_month: null,
      },
      aiInsights: "Test insights bullet 1.\nTest insights bullet 2.",
    })
  ),
  generateHouseholdPdfForHousehold: mock(() => Promise.resolve(null)),
}));

// Mock unsubscribe token
mock.module("../../lib/unsubscribe-token", () => ({
  createUnsubscribeToken: mock(() => "mock-token"),
  verifyUnsubscribeToken: mock((token: string) => {
    if (token === "valid-token") return { valid: true, userId: TEST_USER_ID };
    return { valid: false };
  }),
}));

// Mock email template
mock.module("../../services/email-template.service", () => ({
  buildReportEmailHtml: mock(() => "<html>mock email</html>"),
}));

let app: any;
let server: Server;

beforeAll(async () => {
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.RESEND_API_KEY = "re_test_123";
  process.env.UNSUBSCRIBE_SECRET = "test-unsub-secret-at-least-32-chars!!!";
  process.env.APP_URL = "https://spendoza.io";
  process.env.API_URL = "https://api.spendoza.io";

  const mod = await import("../../index");
  app = mod.default;
  server = app.listen(0);
});

afterAll(() => {
  server?.close();
});

function getPort(): number {
  const addr = server.address();
  return typeof addr === "object" && addr ? addr.port : 0;
}

describe("POST /api/emails/dispatch-weekly", () => {
  beforeEach(() => {
    adminCalls.length = 0;
    adminResults = {};
  });

  it("returns 401 without CRON_SECRET", async () => {
    const res = await fetch(`http://localhost:${getPort()}/api/emails/dispatch-weekly`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 with valid CRON_SECRET", async () => {
    adminResults = {
      profiles: {
        selectList: { data: [], error: null },
      },
    };

    const res = await fetch(`http://localhost:${getPort()}/api/emails/dispatch-weekly`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CRON_SECRET}`,
      },
    });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/emails/unsubscribe", () => {
  beforeEach(() => {
    adminCalls.length = 0;
    adminResults = {
      profiles: {
        selectSingle: { data: { id: TEST_USER_ID }, error: null },
      },
    };
  });

  it("returns HTML confirmation for valid token", async () => {
    const res = await fetch(
      `http://localhost:${getPort()}/api/emails/unsubscribe?token=valid-token`
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Unsubscribed");
  });

  it("returns 400 for invalid token", async () => {
    const res = await fetch(
      `http://localhost:${getPort()}/api/emails/unsubscribe?token=bad-token`
    );
    expect(res.status).toBe(400);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/api && bun test src/__tests__/integration/email-flow.test.ts`
Expected: FAIL (route not found — 404s)

**Step 3: Write the email routes**

Create `packages/api/src/routes/emails.ts`:

```typescript
import { Router, type Request, type Response } from "express";
import { waitUntil } from "@vercel/functions";
import { supabaseAdmin } from "../lib/supabase";
import { sendReportEmail } from "../services/email.service";
import { buildReportEmailHtml } from "../services/email-template.service";
import {
  generatePersonalPdfForUser,
  generateHouseholdPdfForHousehold,
} from "../services/pdf-export.service";
import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "../lib/unsubscribe-token";

const router = Router();

const APP_URL = () => process.env.APP_URL || "https://spendoza.io";
const API_URL = () => process.env.API_URL || "https://api.spendoza.io";

// ---------------------------------------------------------------------------
// Helper: check if current UTC hour is 9am Saturday in a given IANA timezone
// ---------------------------------------------------------------------------
function isSaturday9am(timezone: string, now: Date = new Date()): boolean {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const weekday = parts.find((p) => p.type === "weekday")?.value;
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "-1", 10);
    return weekday === "Sat" && hour === 9;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helper: get the report month string (YYYY-MM-01) for a user's local "now"
// ---------------------------------------------------------------------------
function getCurrentReportMonth(timezone: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const localDate = formatter.format(now); // YYYY-MM-DD
  return localDate.slice(0, 7) + "-01";
}

// ---------------------------------------------------------------------------
// POST /dispatch-weekly — called by pg_cron every hour
// ---------------------------------------------------------------------------
router.post("/dispatch-weekly", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  if (token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Get all users with email reports enabled
    const { data: users, error } = await supabaseAdmin
      .from("profiles")
      .select("id, timezone, household_id")
      .eq("email_reports_enabled", true);

    if (error || !users) {
      console.error("[dispatch-weekly] Failed to fetch users:", error);
      return res.status(200).json({ dispatched: 0, error: error?.message });
    }

    const now = new Date();
    let dispatched = 0;

    for (const user of users) {
      const tz = user.timezone || "America/New_York";

      // Check if it's Saturday 9am in their timezone
      if (!isSaturday9am(tz, now)) continue;

      const reportMonth = getCurrentReportMonth(tz);

      // Check for new transactions since last email
      const { data: lastLog } = await supabaseAdmin
        .from("email_report_log")
        .select("sent_at")
        .eq("user_id", user.id)
        .eq("entity_type", "user")
        .eq("entity_id", user.id)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastSentAt = lastLog?.sent_at ?? "1970-01-01T00:00:00Z";

      // Check new transactions exist
      const { count: newTxnCount } = await supabaseAdmin
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gt("created_at", lastSentAt);

      if (!newTxnCount || newTxnCount === 0) continue;

      // Check fresh AI report exists
      const { data: freshReport } = await supabaseAdmin
        .from("reports")
        .select("generated_at")
        .eq("entity_type", "user")
        .eq("entity_id", user.id)
        .eq("report_month", reportMonth)
        .gt("generated_at", lastSentAt)
        .maybeSingle();

      if (!freshReport) continue;

      // Check not already emailed for this month
      const { data: alreadySent } = await supabaseAdmin
        .from("email_report_log")
        .select("id")
        .eq("user_id", user.id)
        .eq("entity_type", "user")
        .eq("entity_id", user.id)
        .eq("report_month", reportMonth)
        .maybeSingle();

      if (alreadySent) continue;

      // Create personal email job
      await supabaseAdmin.from("email_jobs").insert({
        user_id: user.id,
        entity_type: "user",
        entity_id: user.id,
        report_month: reportMonth,
      });
      dispatched++;

      // Create household email job if applicable
      if (user.household_id) {
        const { data: hhAlreadySent } = await supabaseAdmin
          .from("email_report_log")
          .select("id")
          .eq("user_id", user.id)
          .eq("entity_type", "household")
          .eq("entity_id", user.household_id)
          .eq("report_month", reportMonth)
          .maybeSingle();

        if (!hhAlreadySent) {
          // Check if household has fresh report
          const { data: hhReport } = await supabaseAdmin
            .from("reports")
            .select("generated_at")
            .eq("entity_type", "household")
            .eq("entity_id", user.household_id)
            .eq("report_month", reportMonth)
            .gt("generated_at", lastSentAt)
            .maybeSingle();

          if (hhReport) {
            await supabaseAdmin.from("email_jobs").insert({
              user_id: user.id,
              entity_type: "household",
              entity_id: user.household_id,
              report_month: reportMonth,
            });
            dispatched++;
          }
        }
      }
    }

    return res.status(200).json({ dispatched });
  } catch (err) {
    console.error("[dispatch-weekly] Error:", err);
    return res.status(200).json({ dispatched: 0, error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /send — called by pg_net trigger per email job
// ---------------------------------------------------------------------------
router.post("/send", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  if (token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { job_id } = req.body;
  if (!job_id) {
    return res.status(400).json({ error: "job_id required" });
  }

  // Process in background so pg_net doesn't wait
  waitUntil(processEmailJob(job_id));

  return res.status(200).json({ message: "Job accepted", job_id });
});

async function processEmailJob(jobId: string): Promise<void> {
  try {
    // Mark as processing
    await supabaseAdmin
      .from("email_jobs")
      .update({ status: "processing" })
      .eq("id", jobId);

    // Fetch job details
    const { data: job } = await supabaseAdmin
      .from("email_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (!job || job.status === "sent") return;

    // Get user's email
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(job.user_id);
    const userEmail = authUser?.user?.email;
    if (!userEmail) throw new Error(`No email for user ${job.user_id}`);

    // Generate PDF
    let result;
    let reportTitle: string;
    if (job.entity_type === "user") {
      result = await generatePersonalPdfForUser(job.user_id, job.report_month);
      reportTitle = "Personal Report";
    } else {
      result = await generateHouseholdPdfForHousehold(job.entity_id, job.report_month);
      reportTitle = "Household Report";
    }

    if (!result) {
      await supabaseAdmin
        .from("email_jobs")
        .update({ status: "failed", error: "No report data available", processed_at: new Date().toISOString() })
        .eq("id", jobId);
      return;
    }

    // Get user display name
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", job.user_id)
      .single();

    const monthLabel = new Date(job.report_month + "T00:00:00Z").toLocaleDateString(
      "en-US",
      { month: "long", year: "numeric", timeZone: "UTC" }
    );

    // Parse AI insights into bullet points
    const aiInsights = result.aiInsights
      ? result.aiInsights
          .split("\n")
          .map((line) => line.replace(/^[-*]\s*/, "").trim())
          .filter(Boolean)
          .slice(0, 3)
      : [];

    const unsubscribeUrl = `${API_URL()}/api/emails/unsubscribe?token=${createUnsubscribeToken(job.user_id)}`;

    const subject = `Your Spendoza ${reportTitle} \u2014 ${monthLabel}`;

    const htmlBody = buildReportEmailHtml({
      userName: profile?.display_name ?? "there",
      reportTitle,
      monthLabel,
      totalIncome: result.reportData.total_income,
      totalExpenses: result.reportData.total_expenses,
      netSavings: result.reportData.total_income - result.reportData.total_expenses,
      savingsRate: result.reportData.savings_rate,
      aiInsights,
      appReportUrl: `${APP_URL()}/dashboard`,
      unsubscribeUrl,
    });

    const pdfFilename =
      job.entity_type === "user"
        ? `spendoza-report-${job.report_month.slice(0, 7)}.pdf`
        : `spendoza-household-report-${job.report_month.slice(0, 7)}.pdf`;

    // Send email
    const sendResult = await sendReportEmail({
      to: userEmail,
      subject,
      htmlBody,
      pdfBuffer: result.pdfBuffer,
      pdfFilename,
    });

    if (!sendResult.success) {
      await supabaseAdmin
        .from("email_jobs")
        .update({ status: "failed", error: sendResult.error, processed_at: new Date().toISOString() })
        .eq("id", jobId);
      return;
    }

    // Log success
    await supabaseAdmin.from("email_report_log").upsert({
      user_id: job.user_id,
      entity_type: job.entity_type,
      entity_id: job.entity_id,
      report_month: job.report_month,
      email_subject: subject,
      email_preview: `Income: $${result.reportData.total_income}, Expenses: $${result.reportData.total_expenses}`,
      sent_at: new Date().toISOString(),
    });

    // Mark job as sent
    await supabaseAdmin
      .from("email_jobs")
      .update({ status: "sent", processed_at: new Date().toISOString() })
      .eq("id", jobId);

    console.log(`[email] Sent ${job.entity_type} report to ${userEmail} for ${job.report_month}`);
  } catch (err) {
    console.error(`[email] Failed to process job ${jobId}:`, err);
    await supabaseAdmin
      .from("email_jobs")
      .update({
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        processed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }
}

// ---------------------------------------------------------------------------
// GET /unsubscribe — one-click unsubscribe from email
// ---------------------------------------------------------------------------
router.get("/unsubscribe", async (req: Request, res: Response) => {
  const tokenStr = req.query.token as string;
  if (!tokenStr) {
    return res.status(400).send("Missing token");
  }

  const result = verifyUnsubscribeToken(tokenStr);
  if (!result.valid) {
    return res.status(400).send("Invalid or expired unsubscribe link");
  }

  await supabaseAdmin
    .from("profiles")
    .update({ email_reports_enabled: false })
    .eq("id", result.userId);

  return res.status(200).send(`
    <!DOCTYPE html>
    <html><head><title>Unsubscribed</title></head>
    <body style="font-family:sans-serif;text-align:center;padding:60px 20px;">
      <h1>Unsubscribed</h1>
      <p>You've been unsubscribed from Spendoza weekly email reports.</p>
      <p>You can re-enable this anytime from your <a href="${APP_URL()}/profile">profile settings</a>.</p>
    </body>
    </html>
  `);
});

export default router;
```

**Step 4: Register the email router in the app**

Modify `packages/api/src/index.ts` — add the import and route registration:

After line 17 (`import internalRouter from "./routes/internal";`), add:
```typescript
import emailsRouter from "./routes/emails";
```

After line 64 (`app.use("/api/goals", requireAuth, goalsRouter);`), add:
```typescript
app.use("/api/emails", emailsRouter);
```

Note: No `requireAuth` — the dispatcher and worker use CRON_SECRET, and unsubscribe uses signed tokens.

**Step 5: Run test to verify it passes**

Run: `cd packages/api && bun test src/__tests__/integration/email-flow.test.ts`
Expected: PASS

**Step 6: Run full test suite**

Run: `bun run test`
Expected: All tests pass

**Step 7: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 8: Commit**

```bash
git add packages/api/src/routes/emails.ts packages/api/src/index.ts packages/api/src/__tests__/integration/email-flow.test.ts
git commit -m "feat: add email dispatch/send/unsubscribe routes"
```

---

### Task 9: Frontend — Auto-Detect Timezone on Auth

**Files:**
- Modify: `packages/web/src/hooks/use-profile.ts`
- Modify: `packages/web/src/components/onboarding/complete-step.tsx`

**Step 1: Add timezone auto-detection to profile hook**

In `packages/web/src/hooks/use-profile.ts`, add a new hook that detects and syncs timezone. Add after the existing `useUploadAvatar` hook:

```typescript
export function useSyncTimezone() {
  const updateProfile = useUpdateProfile();

  return useMutation({
    mutationFn: async () => {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return updateProfile.mutateAsync({ timezone });
    },
  });
}
```

**Step 2: Update onboarding complete step to sync timezone and set email preference**

In `packages/web/src/components/onboarding/complete-step.tsx`, update the component to add an email reports toggle and sync timezone on completion.

Replace the full file content:

```typescript
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiClient } from "@/lib/api";

export function CompleteStep() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailReports, setEmailReports] = useState(true);

  async function handleFinish() {
    setIsSubmitting(true);
    try {
      // Sync timezone and email preference
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await apiClient("/profile", {
        method: "PUT",
        body: JSON.stringify({
          timezone,
          email_reports_enabled: emailReports,
        }),
      });

      await apiClient("/profile/onboarding", { method: "PUT" });
      navigate("/dashboard", { replace: true, state: { onboardingCompleted: true } });
    } catch {
      navigate("/dashboard", { replace: true, state: { onboardingCompleted: true } });
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 py-4 text-center">
      <CheckCircle2 className="size-20 text-green-500" />

      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold tracking-tight">You're All Set!</h2>
        <p className="text-muted-foreground">
          Your account is ready. Head to your dashboard to start tracking your
          finances.
        </p>
      </div>

      {/* Email reports toggle */}
      <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
        <Mail className="size-5 text-muted-foreground" />
        <Label htmlFor="email-reports" className="cursor-pointer text-sm">
          Email me weekly Spendoza Reports
        </Label>
        <Switch
          id="email-reports"
          checked={emailReports}
          onCheckedChange={setEmailReports}
        />
      </div>

      <div className="flex flex-col gap-3">
        <Button size="lg" onClick={handleFinish} disabled={isSubmitting}>
          {isSubmitting ? "Setting up..." : "Go to Dashboard"}
        </Button>
        <p className="text-xs text-muted-foreground">
          You can always update your settings and upload more statements later.
        </p>
      </div>
    </div>
  );
}
```

**Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/web/src/hooks/use-profile.ts packages/web/src/components/onboarding/complete-step.tsx
git commit -m "feat: add email reports toggle to onboarding and auto-detect timezone"
```

---

### Task 10: Frontend — Notifications Section on Profile Page

**Files:**
- Modify: `packages/web/src/pages/profile.tsx`

**Step 1: Add Notifications section between Appearance and Account**

In `packages/web/src/pages/profile.tsx`:

Add `Mail` to the lucide-react imports (line 2):
```typescript
import { Camera, Check, Loader2, Mail, Monitor, Moon, Sun } from "lucide-react";
```

Add `Switch` to the UI imports (after the Label import around line 9):
```typescript
import { Switch } from "@/components/ui/switch";
```

Between the Appearance `</Card>` (line 192) and the Account `<Card>` (line 194), insert the Notifications section:

```tsx
      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <Label htmlFor="email-reports" className="cursor-pointer">
                  Weekly Email Reports
                </Label>
                <p className="text-xs text-muted-foreground">
                  Receive your Spendoza report every Saturday at 9am
                </p>
              </div>
              <Switch
                id="email-reports"
                checked={profile?.email_reports_enabled ?? true}
                onCheckedChange={(checked) =>
                  updateProfile.mutate({ email_reports_enabled: checked })
                }
              />
            </div>
            {profile?.timezone && (
              <div className="text-xs text-muted-foreground">
                Timezone: {profile.timezone}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
```

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/web/src/pages/profile.tsx
git commit -m "feat: add Notifications section with email reports toggle to profile page"
```

---

### Task 11: Refactor Reports Route to Use Shared PDF Export Service

**Files:**
- Modify: `packages/api/src/routes/reports.ts`

Now that `pdf-export.service.ts` exists with `generatePersonalPdfForUser` and `generateHouseholdPdfForHousehold`, refactor the export endpoints in `reports.ts` to use them instead of duplicating the logic. This keeps the code DRY.

**Step 1: Update the export/personal endpoint (lines 268-417)**

Replace the export/personal handler body with:

```typescript
router.get(
  "/export/personal",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { user } = req as AuthenticatedRequest;
      const month = parseMonth(req.query.month as string | undefined);

      const result = await generatePersonalPdfForUser(user.id, month);

      if (!result) {
        return res
          .status(404)
          .json({ error: "No report data available for this month" });
      }

      const filename = `spendoza-report-${month.slice(0, 7)}.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      res.setHeader("Content-Length", result.pdfBuffer.length);

      return res.send(result.pdfBuffer);
    } catch (err) {
      console.error("[export/personal] Error generating PDF:", err);
      return res
        .status(500)
        .json({ error: "Failed to generate PDF report" });
    }
  }
);
```

**Step 2: Update the export/household endpoint (lines 422-624)**

Replace the export/household handler body with:

```typescript
router.get(
  "/export/household",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { user } = req as AuthenticatedRequest;
      const month = parseMonth(req.query.month as string | undefined);

      const { data: userProfile } = await supabaseAdmin
        .from("profiles")
        .select("household_id")
        .eq("id", user.id)
        .single();

      if (!userProfile?.household_id) {
        return res
          .status(400)
          .json({ error: "You are not a member of a household" });
      }

      const result = await generateHouseholdPdfForHousehold(
        userProfile.household_id,
        month
      );

      if (!result) {
        return res
          .status(404)
          .json({ error: "No report data available for this month" });
      }

      const filename = `spendoza-household-report-${month.slice(0, 7)}.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      res.setHeader("Content-Length", result.pdfBuffer.length);

      return res.send(result.pdfBuffer);
    } catch (err) {
      console.error("[export/household] Error generating PDF:", err);
      return res
        .status(500)
        .json({ error: "Failed to generate PDF report" });
    }
  }
);
```

**Step 3: Add the import**

At the top of `packages/api/src/routes/reports.ts`, add:
```typescript
import {
  generatePersonalPdfForUser,
  generateHouseholdPdfForHousehold,
} from "../services/pdf-export.service";
```

**Step 4: Remove the now-unused `buildSavingsRecommendations` function** (lines 17-100) from reports.ts since it's now in pdf-export.service.ts. Also remove the `buildReportPdf` import if no longer used directly in this file.

**Step 5: Run the existing report tests to verify nothing broke**

Run: `cd packages/api && bun test src/__tests__/integration/report-flow.test.ts`
Expected: PASS

**Step 6: Run full test suite**

Run: `bun run test`
Expected: All tests pass

**Step 7: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 8: Commit**

```bash
git add packages/api/src/routes/reports.ts
git commit -m "refactor: use shared pdf-export service in report export endpoints"
```

---

### Task 12: Final Verification

**Step 1: Run full typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 2: Run full test suite**

Run: `bun run test`
Expected: All tests pass

**Step 3: Run lint**

Run: `bun run lint`
Expected: PASS (or only pre-existing warnings)

**Step 4: Verify build**

Run: `bun run build`
Expected: PASS

**Step 5: Review all changes**

Run: `git log --oneline --no-merges HEAD~12..HEAD`

Expected commits (approximately):
1. Migration for email tables + profile columns
2. Shared profile schema update
3. Resend dependency
4. Email service
5. Email template builder
6. PDF export service extraction
7. Unsubscribe token utilities
8. Email routes (dispatcher + worker + unsubscribe)
9. Onboarding email toggle + timezone detection
10. Profile notifications section
11. Reports route refactor

---

## Environment Variables Required

Before deploying, the following env vars must be set:

| Variable | Purpose | Example |
|----------|---------|---------|
| `RESEND_API_KEY` | Resend API key for sending emails | `re_abc123...` |
| `UNSUBSCRIBE_SECRET` | HMAC secret for signed unsubscribe tokens | Random 32+ char string |
| `APP_URL` | Frontend app URL (for CTA links) | `https://spendoza.io` |
| `API_URL` | API URL (for unsubscribe links) | `https://api.spendoza.io` |

Also ensure Supabase Vault secrets are set:
- `api_base_url` — Used by pg_net triggers
- `cron_secret` — Used by pg_cron + pg_net for auth

## Supabase DNS Configuration

Add DNS records for `spendoza.io` in Resend to verify the domain for sending from `no-reply@spendoza.io`. This involves adding SPF, DKIM, and DMARC records to your DNS provider.
