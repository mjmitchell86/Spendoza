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

    const pageWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // --- Header ---
    doc.fontSize(22).fillColor(COLORS.primary).text("Spendoza", {
      align: "center",
    });
    doc
      .fontSize(14)
      .fillColor(COLORS.muted)
      .text(`${input.title} — Monthly Report`, { align: "center" });
    doc.fontSize(11).text(input.month, { align: "center" });
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
        b.next_due_date
          ? new Date(b.next_due_date + "T00:00:00Z").toLocaleDateString(
              "en-US",
              { timeZone: "UTC" }
            )
          : "—",
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
  doc.fontSize(13).fillColor(COLORS.primary).text(title);
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
    doc
      .fontSize(10)
      .fillColor(COLORS.muted)
      .text(label, doc.page.margins.left, y, {
        width: pageWidth * 0.6,
        continued: false,
      });
    doc
      .fontSize(10)
      .fillColor(COLORS.primary)
      .text(value, doc.page.margins.left + pageWidth * 0.6, y, {
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
    doc
      .fontSize(9)
      .fillColor(COLORS.muted)
      .text(headers[i], x, doc.y, {
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
    if (doc.y > doc.page.height - doc.page.margins.bottom - 30) {
      doc.addPage();
    }

    const rowY = doc.y;
    x = startX;
    for (let i = 0; i < row.length; i++) {
      doc
        .fontSize(9)
        .fillColor(COLORS.primary)
        .text(row[i], x, rowY, {
          width: pageWidth * colWidths[i],
          continued: false,
        });
      x += pageWidth * colWidths[i];
    }
    doc.moveDown(0.1);
  }
}
