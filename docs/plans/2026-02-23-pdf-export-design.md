# PDF Export Monthly Report — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Export monthly financial reports as downloadable PDFs containing dashboard summary, AI insights, expense breakdown, recurring bills, and income sources.

**Architecture:** Backend generates PDFs via PDFKit. Two new GET endpoints (`/api/reports/export/personal` and `/api/reports/export/household`) return `application/pdf`. If a cached report exists with `has_new_data = false`, use it; otherwise generate fresh via `generateUserReport`/`generateHouseholdReport`. Frontend adds "Export PDF" buttons next to existing "Refresh Report" buttons on both dashboards.

**Tech Stack:** PDFKit (server-side PDF generation), Express streaming response, browser-triggered download via blob URL.

---

## Task 1: Install PDFKit dependency

**Files:**
- Modify: `packages/api/package.json`

**Step 1: Install pdfkit**

Run: `cd packages/api && bun add pdfkit`

**Step 2: Install types**

Run: `cd packages/api && bun add -d @types/pdfkit`

**Step 3: Verify install**

Run: `cd packages/api && bun run typecheck`
Expected: PASS

---

## Task 2: Create PDF builder service

**Files:**
- Create: `packages/api/src/services/pdf-report.service.ts`

**Step 1: Create the PDF builder service**

This service takes report data + supplementary data (expenses, income entries) and returns a PDFKit document streamed into a buffer.

```typescript
import PDFDocument from "pdfkit";
import type { ReportData } from "../ai/report-insights";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface PdfReportInput {
  title: string; // e.g. "Personal" or household name
  month: string; // e.g. "January 2026"
  reportData: ReportData;
  aiInsights: string | null;
  recurringBills: Array<{
    description: string;
    friendly_name: string | null;
    amount: number;
    recurrence_interval: string | null;
    next_due_date: string | null;
  }>;
  incomeSources: Array<{
    source_name: string;
    amount: number;
    frequency: string;
    attributed_to_name: string | null;
  }>;
  memberContributions?: Array<{
    display_name: string;
    income: number;
    expenses: number;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMonth(monthStr: string): string {
  const d = new Date(monthStr + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

const COLORS = {
  primary: "#1a1a2e",
  accent: "#16a34a",
  danger: "#dc2626",
  muted: "#6b7280",
  divider: "#e5e7eb",
  headerBg: "#f9fafb",
};

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------
export function buildReportPdf(input: PdfReportInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Uint8Array[] = [];

    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // --- Header ---
    doc
      .fontSize(22)
      .fillColor(COLORS.primary)
      .text("Spendoza", { align: "center" });
    doc
      .fontSize(14)
      .fillColor(COLORS.muted)
      .text(`${input.title} — Monthly Report`, { align: "center" });
    doc
      .fontSize(11)
      .text(input.month, { align: "center" });
    doc.moveDown(1.5);

    // --- Summary Cards ---
    drawSectionHeader(doc, "Financial Summary");

    const net = input.reportData.total_income - input.reportData.total_expenses;
    const summaryRows = [
      ["Total Income", formatCurrency(input.reportData.total_income)],
      ["Total Expenses", formatCurrency(input.reportData.total_expenses)],
      ["Net", formatCurrency(net)],
      ["Savings Rate", `${input.reportData.savings_rate.toFixed(1)}%`],
    ];
    drawKeyValueTable(doc, summaryRows, pageWidth);
    doc.moveDown(0.5);

    // Month-over-month trends
    if (input.reportData.month_over_month) {
      const mom = input.reportData.month_over_month;
      doc
        .fontSize(9)
        .fillColor(COLORS.muted)
        .text(
          `Month-over-month: Income ${mom.income_change >= 0 ? "+" : ""}${mom.income_change.toFixed(1)}% | Expenses ${mom.expense_change >= 0 ? "+" : ""}${mom.expense_change.toFixed(1)}%`
        );
      doc.moveDown(1);
    }

    // --- AI Insights ---
    if (input.aiInsights) {
      drawSectionHeader(doc, "AI Insights");
      const lines = input.aiInsights
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      for (const line of lines) {
        doc.fontSize(10).fillColor(COLORS.primary).text(line, { indent: 10 });
        doc.moveDown(0.3);
      }
      doc.moveDown(0.8);
    }

    // --- Expense Breakdown by Category ---
    if (input.reportData.by_category.length > 0) {
      drawSectionHeader(doc, "Expense Breakdown by Category");
      const headers = ["Category", "Amount", "%"];
      const rows = input.reportData.by_category.map((c) => [
        c.category,
        formatCurrency(c.amount),
        `${c.percentage.toFixed(1)}%`,
      ]);
      drawTable(doc, headers, rows, [0.55, 0.25, 0.2], pageWidth);
      doc.moveDown(1);
    }

    // --- Recurring Bills ---
    if (input.recurringBills.length > 0) {
      drawSectionHeader(doc, "Recurring Bills");
      const headers = ["Bill", "Amount", "Frequency", "Next Due"];
      const rows = input.recurringBills.map((b) => [
        b.friendly_name || b.description,
        formatCurrency(b.amount),
        b.recurrence_interval ?? "—",
        b.next_due_date ? new Date(b.next_due_date + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC" }) : "—",
      ]);
      drawTable(doc, headers, rows, [0.35, 0.2, 0.2, 0.25], pageWidth);
      doc.moveDown(1);
    }

    // --- Income Sources ---
    if (input.incomeSources.length > 0) {
      drawSectionHeader(doc, "Income Sources");
      const headers = ["Source", "Amount", "Frequency", "Attributed To"];
      const rows = input.incomeSources.map((i) => [
        i.source_name,
        formatCurrency(i.amount),
        i.frequency,
        i.attributed_to_name ?? "Self",
      ]);
      drawTable(doc, headers, rows, [0.3, 0.2, 0.2, 0.3], pageWidth);
      doc.moveDown(1);
    }

    // --- Member Contributions (household only) ---
    if (input.memberContributions && input.memberContributions.length > 0) {
      drawSectionHeader(doc, "Member Contributions");
      const headers = ["Member", "Income", "Expenses"];
      const rows = input.memberContributions.map((m) => [
        m.display_name,
        formatCurrency(m.income),
        formatCurrency(m.expenses),
      ]);
      drawTable(doc, headers, rows, [0.4, 0.3, 0.3], pageWidth);
      doc.moveDown(1);
    }

    // --- Footer ---
    doc
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(
        `Generated by Spendoza on ${new Date().toLocaleDateString("en-US")}`,
        { align: "center" }
      );

    doc.end();
  });
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

function drawSectionHeader(doc: PDFKit.PDFDocument, title: string) {
  doc
    .fontSize(13)
    .fillColor(COLORS.primary)
    .text(title);
  doc
    .moveTo(doc.x, doc.y + 2)
    .lineTo(doc.x + 200, doc.y + 2)
    .strokeColor(COLORS.accent)
    .lineWidth(1.5)
    .stroke();
  doc.moveDown(0.6);
}

function drawKeyValueTable(
  doc: PDFKit.PDFDocument,
  rows: string[][],
  pageWidth: number
) {
  for (const [label, value] of rows) {
    const y = doc.y;
    doc.fontSize(10).fillColor(COLORS.muted).text(label, doc.page.margins.left, y, {
      width: pageWidth * 0.6,
      continued: false,
    });
    doc.fontSize(10).fillColor(COLORS.primary).text(value, doc.page.margins.left + pageWidth * 0.6, y, {
      width: pageWidth * 0.4,
      align: "right",
    });
    doc.moveDown(0.1);
  }
}

function drawTable(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][],
  colWidths: number[],
  pageWidth: number
) {
  const startX = doc.page.margins.left;

  // Header row
  let x = startX;
  for (let i = 0; i < headers.length; i++) {
    doc.fontSize(9).fillColor(COLORS.muted).text(headers[i], x, doc.y, {
      width: pageWidth * colWidths[i],
      continued: false,
    });
    x += pageWidth * colWidths[i];
  }
  doc.moveDown(0.2);

  // Divider
  doc
    .moveTo(startX, doc.y)
    .lineTo(startX + pageWidth, doc.y)
    .strokeColor(COLORS.divider)
    .lineWidth(0.5)
    .stroke();
  doc.moveDown(0.3);

  // Data rows
  for (const row of rows) {
    // Check for page break
    if (doc.y > doc.page.height - doc.page.margins.bottom - 30) {
      doc.addPage();
    }

    const rowY = doc.y;
    x = startX;
    for (let i = 0; i < row.length; i++) {
      doc.fontSize(9).fillColor(COLORS.primary).text(row[i], x, rowY, {
        width: pageWidth * colWidths[i],
        continued: false,
      });
      x += pageWidth * colWidths[i];
    }
    doc.moveDown(0.1);
  }
}
```

**Step 2: Verify typecheck**

Run: `bun run typecheck`
Expected: PASS

---

## Task 3: Add export routes to reports router

**Files:**
- Modify: `packages/api/src/routes/reports.ts`

**Step 1: Add the export route handlers**

Add these imports at the top of the file:

```typescript
import { buildReportPdf } from "../services/pdf-report.service";
import { generateUserReport, generateHouseholdReport } from "../services/report.service";
```

Note: `generateUserReport` and `generateHouseholdReport` are already imported. No change needed for those.

Add after the existing `/generate-all` route (before `export default router`):

```typescript
// ---------------------------------------------------------------------------
// GET /export/personal — download personal report as PDF
// ---------------------------------------------------------------------------
router.get("/export/personal", requireAuth, async (req: Request, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const month = parseMonth(req.query.month as string | undefined);

  // 1. Try cached report
  let report = await supabaseAdmin
    .from("reports")
    .select("*")
    .eq("entity_type", "user")
    .eq("entity_id", user.id)
    .eq("report_month", month)
    .maybeSingle()
    .then((r) => r.data);

  // 2. Generate if missing or stale
  if (!report || report.has_new_data) {
    try {
      report = await generateUserReport(user.id, new Date(month + "T00:00:00Z"), true);
    } catch (err) {
      console.error("[pdf-export] report generation failed:", err);
      return res.status(500).json({ error: "Failed to generate report" });
    }
  }

  if (!report?.report_data) {
    return res.status(404).json({ error: "No report data available for this month" });
  }

  // 3. Fetch supplementary data: recurring bills + income sources
  const [{ data: bills }, { data: income }] = await Promise.all([
    supabaseAdmin
      .from("expenses")
      .select("description, friendly_name, amount, recurrence_interval, next_due_date")
      .eq("user_id", user.id)
      .eq("frequency", "recurring"),
    supabaseAdmin
      .from("income_entries")
      .select("source_name, amount, frequency, attributed_to_name")
      .eq("user_id", user.id),
  ]);

  // 4. Get user display name
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  // 5. Build PDF
  const reportData = report.report_data as import("../ai/report-insights").ReportData;
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
    recurringBills: bills ?? [],
    incomeSources: income ?? [],
  });

  // 6. Stream PDF response
  const filename = `spendoza-report-${month.slice(0, 7)}.pdf`;
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": pdfBuffer.length.toString(),
  });
  return res.send(pdfBuffer);
});

// ---------------------------------------------------------------------------
// GET /export/household — download household report as PDF
// ---------------------------------------------------------------------------
router.get("/export/household", requireAuth, async (req: Request, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const month = parseMonth(req.query.month as string | undefined);

  // 1. Resolve household
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();

  if (!profile?.household_id) {
    return res.status(400).json({ error: "You are not a member of a household" });
  }

  const householdId = profile.household_id;

  // 2. Get household name
  const { data: household } = await supabaseAdmin
    .from("households")
    .select("name")
    .eq("id", householdId)
    .single();

  // 3. Try cached report
  let report = await supabaseAdmin
    .from("reports")
    .select("*")
    .eq("entity_type", "household")
    .eq("entity_id", householdId)
    .eq("report_month", month)
    .maybeSingle()
    .then((r) => r.data);

  // 4. Generate if missing or stale
  if (!report || report.has_new_data) {
    try {
      report = await generateHouseholdReport(householdId, new Date(month + "T00:00:00Z"), true);
    } catch (err) {
      console.error("[pdf-export] household report generation failed:", err);
      return res.status(500).json({ error: "Failed to generate report" });
    }
  }

  if (!report?.report_data) {
    return res.status(404).json({ error: "No report data available for this month" });
  }

  // 5. Fetch household members
  const { data: members } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name")
    .eq("household_id", householdId);

  const memberIds = (members ?? []).map((m) => m.id);

  // 6. Fetch recurring bills + income for all members
  const [{ data: bills }, { data: income }] = await Promise.all([
    supabaseAdmin
      .from("expenses")
      .select("description, friendly_name, amount, recurrence_interval, next_due_date")
      .in("user_id", memberIds)
      .eq("frequency", "recurring"),
    supabaseAdmin
      .from("income_entries")
      .select("source_name, amount, frequency, attributed_to_name")
      .in("user_id", memberIds),
  ]);

  // 7. Compute member contributions from report data or transactions
  // The household dashboard already computes these — replicate the pattern
  const monthStart = month;
  const nextMonth = new Date(new Date(month + "T00:00:00Z").getFullYear(), new Date(month + "T00:00:00Z").getMonth() + 1, 1)
    .toISOString().slice(0, 10);

  const memberContributions: Array<{ display_name: string; income: number; expenses: number }> = [];
  for (const member of members ?? []) {
    const { data: txns } = await supabaseAdmin
      .from("transactions")
      .select("amount, type")
      .eq("user_id", member.id)
      .gte("date", monthStart)
      .lt("date", nextMonth);

    let memberIncome = 0;
    let memberExpenses = 0;
    for (const t of txns ?? []) {
      if (t.type === "credit") memberIncome += t.amount;
      else memberExpenses += Math.abs(t.amount);
    }
    memberContributions.push({
      display_name: member.display_name,
      income: memberIncome,
      expenses: memberExpenses,
    });
  }

  // 8. Build PDF
  const reportData = report.report_data as import("../ai/report-insights").ReportData;
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
    recurringBills: bills ?? [],
    incomeSources: income ?? [],
    memberContributions,
  });

  const filename = `spendoza-household-report-${month.slice(0, 7)}.pdf`;
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": pdfBuffer.length.toString(),
  });
  return res.send(pdfBuffer);
});
```

**Step 2: Verify typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 3: Commit backend**

```
git add packages/api/
git commit -m "feat: add PDF export endpoints for personal and household reports"
```

---

## Task 4: Add apiClientBlob helper

**Files:**
- Modify: `packages/web/src/lib/api.ts`

**Step 1: Add blob download helper**

Add after the existing `apiClient` function:

```typescript
export async function apiClientBlob(path: string): Promise<Blob> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const response = await fetch(`${API_BASE}/api${path}`, {
    headers: {
      Authorization: `Bearer ${session?.access_token}`,
    },
  });
  if (!response.ok) {
    let message = "API request failed";
    try {
      const error = await response.json();
      message = error.error || message;
    } catch {
      // Response may not be JSON
    }
    throw new Error(message);
  }
  return response.blob();
}
```

**Step 2: Verify typecheck**

Run: `bun run typecheck`
Expected: PASS

---

## Task 5: Add useExportReport hook

**Files:**
- Create: `packages/web/src/hooks/use-export-report.ts`

**Step 1: Create the hook**

```typescript
import { useMutation } from "@tanstack/react-query";
import { apiClientBlob } from "@/lib/api";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function useExportPersonalReport() {
  return useMutation({
    mutationFn: async (month?: string) => {
      const params = month ? `?month=${month}` : "";
      const blob = await apiClientBlob(`/reports/export/personal${params}`);
      const filename = `spendoza-report-${month?.slice(0, 7) ?? "current"}.pdf`;
      downloadBlob(blob, filename);
    },
  });
}

export function useExportHouseholdReport() {
  return useMutation({
    mutationFn: async (month?: string) => {
      const params = month ? `?month=${month}` : "";
      const blob = await apiClientBlob(`/reports/export/household${params}`);
      const filename = `spendoza-household-report-${month?.slice(0, 7) ?? "current"}.pdf`;
      downloadBlob(blob, filename);
    },
  });
}
```

**Step 2: Verify typecheck**

Run: `bun run typecheck`
Expected: PASS

---

## Task 6: Add Export PDF button to personal dashboard

**Files:**
- Modify: `packages/web/src/pages/dashboard.tsx`

**Step 1: Add import**

Add to imports:
```typescript
import { Download } from "lucide-react";
import { useExportPersonalReport } from "@/hooks/use-export-report";
```

**Step 2: Add hook call inside component**

Inside the `DashboardPage` component (near the other hooks):
```typescript
const exportReport = useExportPersonalReport();
```

**Step 3: Add button next to Refresh Report**

Find the `<div className="flex flex-col gap-3 sm:flex-row sm:items-center">` that wraps the TimePeriodFilter and Refresh Report button (around line 163). Add the Export PDF button after the Refresh Report button:

```typescript
<Button
  variant="outline"
  onClick={() => exportReport.mutate(selectedMonth)}
  disabled={exportReport.isPending}
>
  <Download className="size-4" />
  {exportReport.isPending ? "Exporting..." : "Export PDF"}
</Button>
```

Note: `selectedMonth` depends on what the dashboard passes to the query. Look at how `timePeriod` maps to a month param for the dashboard hook and pass the same value. If the dashboard hook uses a computed month, extract it to a variable.

**Step 4: Add toast on error**

Import `toast` from sonner and add error handling:
```typescript
const exportReport = useExportPersonalReport();
// If using toast for error feedback:
// onError in the mutation or wrap in try/catch
```

Actually the mutation already throws — the toast should be shown if there's an error. Check if there's an `onError` pattern used elsewhere. If not, add:
```typescript
{exportReport.isError && (
  // The error will be visible via the button state reset
)}
```

The simplest approach: just let the button show "Export PDF" again on failure. The user can retry.

**Step 5: Verify typecheck**

Run: `bun run typecheck`
Expected: PASS

---

## Task 7: Add Export PDF button to household dashboard

**Files:**
- Modify: `packages/web/src/pages/household-dashboard.tsx`

**Step 1: Add import**

Add to imports:
```typescript
import { Download } from "lucide-react";
import { useExportHouseholdReport } from "@/hooks/use-export-report";
```

**Step 2: Add hook call inside component**

Inside the `HouseholdPage` component:
```typescript
const exportHouseholdReport = useExportHouseholdReport();
```

**Step 3: Add button next to Refresh Report**

Find the `<div className="flex justify-end">` in the Dashboard TabsContent (around line 227). Wrap both buttons in a flex gap container and add the Export PDF button:

```typescript
<div className="flex justify-end gap-2">
  <Button
    variant="outline"
    onClick={() => generateReport.mutate()}
    disabled={generateReport.isPending}
  >
    <RefreshCw className={cn("size-4", generateReport.isPending && "animate-spin")} />
    {generateReport.isPending ? "Generating..." : "Refresh Report"}
  </Button>
  <Button
    variant="outline"
    onClick={() => exportHouseholdReport.mutate(undefined)}
    disabled={exportHouseholdReport.isPending}
  >
    <Download className="size-4" />
    {exportHouseholdReport.isPending ? "Exporting..." : "Export PDF"}
  </Button>
</div>
```

**Step 4: Verify typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 5: Commit frontend**

```
git add packages/web/
git commit -m "feat: add Export PDF buttons to personal and household dashboards"
```

---

## Task 8: Final verification

**Step 1: Full typecheck**

Run: `bun run typecheck`
Expected: All 3 packages pass

**Step 2: Run tests**

Run: `bun run test`
Expected: All tests pass (no existing tests broken)

**Step 3: Manual smoke test**

Run: `bun run dev`
- Navigate to personal dashboard → click "Export PDF" → PDF downloads
- Navigate to household dashboard → click "Export PDF" → PDF downloads
- Verify PDF contains: header, summary, AI insights, expense breakdown, recurring bills, income sources
