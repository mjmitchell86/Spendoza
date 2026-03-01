import PDFDocument from "pdfkit";
import type { ReportData } from "../ai/report-insights";

// ---------------------------------------------------------------------------
// Types (unchanged public interface)
// ---------------------------------------------------------------------------
interface PdfReportInput {
  title: string;
  month: string;
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
  subscriptionsPaid: Array<{
    name: string;
    amount: number;
    category: string | null;
    recurrence_interval: string;
  }>;
  goalProgress: Array<{
    name: string;
    goal_type: string;
    current: number;
    target: number;
    category_name: string | null;
    target_date: string | null;
  }>;
  savingsRecommendations: Array<{
    category: string;
    amount: number;
    percentage: number;
    suggestion: string;
  }>;
  allocation?: {
    needs: { amount: number; percentage: number };
    wants: { amount: number; percentage: number };
    savings: { amount: number; percentage: number };
    unclassified: { amount: number; percentage: number };
  };
  healthScore?: {
    score: number;
    previous_score: number | null;
    factors: Record<
      string,
      { value: number; points: number; max: number; rating: string }
    >;
  };
  debts?: Array<{
    name: string;
    debt_type: string;
    current_balance: number;
    interest_rate: number;
    minimum_payment: number;
  }>;
}

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------
const C = {
  headerBg: "#0f766e",
  headerLight: "#14b8a6",
  income: "#10b981",
  incomeBg: "#ecfdf5",
  expense: "#ef4444",
  expenseBg: "#fef2f2",
  net: "#3b82f6",
  netBg: "#eff6ff",
  savings: "#8b5cf6",
  savingsBg: "#f5f3ff",
  amber: "#f59e0b",
  amberBg: "#fffbeb",
  dark: "#1e293b",
  muted: "#64748b",
  divider: "#e2e8f0",
  rowAlt: "#f8fafc",
  white: "#ffffff",
};

const BAR_COLORS = [
  "#10b981", "#3b82f6", "#8b5cf6", "#f59e0b",
  "#ef4444", "#06b6d4", "#ec4899", "#64748b",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmt(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// Active footer context — set per buildReportPdf call for safe page breaks
let activeFooterCtx: {
  doc: PDFKit.PDFDocument;
  generatedDate: string;
  pageCounter: { value: number };
} | null = null;

/** Draw footer on current page and start a new one. */
function newPage(doc: PDFKit.PDFDocument) {
  if (activeFooterCtx) {
    drawPageFooter(
      doc,
      activeFooterCtx.generatedDate,
      activeFooterCtx.pageCounter
    );
  }
  doc.addPage();
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y > doc.page.height - doc.page.margins.bottom - needed) {
    newPage(doc);
  }
}

/** Estimate minimum height to start a section (title + first few rows). */
function sectionStartHeight(rowCount: number, rowHeight = 18): number {
  const visibleRows = Math.min(rowCount, 3);
  return 30 + (visibleRows + 1) * rowHeight + 10;
}

function roundedRect(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fillColor: string
) {
  doc.roundedRect(x, y, w, h, r).fillColor(fillColor).fill();
}

// ---------------------------------------------------------------------------
// Page footer
// ---------------------------------------------------------------------------
function drawPageFooter(
  doc: PDFKit.PDFDocument,
  generatedDate: string,
  pageCounter: { value: number }
) {
  pageCounter.value++;
  const bottom = doc.page.height - 30;
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const pageWidth = right - left;

  // Save current Y position — footer must not disturb the flow cursor
  const savedY = doc.y;

  doc
    .moveTo(left, bottom - 10)
    .lineTo(right, bottom - 10)
    .strokeColor(C.headerBg)
    .lineWidth(0.5)
    .stroke();

  // Use doc._font.encode + addContent to write text without triggering
  // PDFKit's automatic page-break logic. Alternatively, we temporarily
  // shrink the bottom margin so doc.text() thinks it's within bounds.
  const origBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  doc
    .fontSize(7)
    .fillColor(C.muted)
    .text(`Generated by Spendoza on ${generatedDate}`, left, bottom - 6, {
      width: pageWidth,
      align: "center",
      lineBreak: false,
    });

  doc
    .fontSize(7)
    .fillColor(C.muted)
    .text(`Page ${pageCounter.value}`, left, bottom - 6, {
      width: pageWidth,
      align: "right",
      lineBreak: false,
    });

  // Restore margin and Y position
  doc.page.margins.bottom = origBottom;
  doc.y = savedY;
}

// ---------------------------------------------------------------------------
// Drawing: Header banner
// ---------------------------------------------------------------------------
function drawHeaderBanner(
  doc: PDFKit.PDFDocument,
  title: string,
  month: string
) {
  const bannerHeight = 70;
  const pageFullWidth = doc.page.width;

  doc.rect(0, 0, pageFullWidth, bannerHeight).fillColor(C.headerBg).fill();

  doc
    .rect(0, bannerHeight - 4, pageFullWidth, 4)
    .fillColor(C.headerLight)
    .fill();

  doc
    .fontSize(22)
    .fillColor(C.white)
    .text("SPENDOZA", 0, 14, { align: "center", width: pageFullWidth });
  doc
    .fontSize(11)
    .fillColor("#99f6e4")
    .text(title, 0, 38, {
      align: "center",
      width: pageFullWidth,
    });
  doc.fontSize(9).fillColor("#ccfbf1").text(month, 0, 52, {
    align: "center",
    width: pageFullWidth,
  });

  doc.y = bannerHeight + 20;
  doc.x = doc.page.margins.left;
}

// ---------------------------------------------------------------------------
// Drawing: Metric cards (2x2 grid)
// ---------------------------------------------------------------------------
interface MetricCard {
  label: string;
  value: string;
  trend?: string;
  trendPositive?: boolean;
  borderColor: string;
  bgColor: string;
  valueColor: string;
}

function drawMetricCards(doc: PDFKit.PDFDocument, cards: MetricCard[], pageWidth: number) {
  const left = doc.page.margins.left;
  const gap = 10;
  const cardW = (pageWidth - gap) / 2;
  const cardH = 65;
  const startY = doc.y;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = left + col * (cardW + gap);
    const y = startY + row * (cardH + gap);

    roundedRect(doc, x, y, cardW, cardH, 4, card.bgColor);
    roundedRect(doc, x, y, 4, cardH, 2, card.borderColor);

    doc
      .fontSize(8)
      .fillColor(C.muted)
      .text(card.label.toUpperCase(), x + 14, y + 10, {
        width: cardW - 20,
      });

    doc
      .fontSize(20)
      .fillColor(card.valueColor)
      .text(card.value, x + 14, y + 22, {
        width: cardW - 20,
      });

    if (card.trend) {
      const arrow = card.trendPositive ? "+" : "-";
      const trendColor = card.trendPositive ? C.income : C.expense;
      doc
        .fontSize(8)
        .fillColor(trendColor)
        .text(`${arrow} ${card.trend} vs last month`, x + 14, y + 47, {
          width: cardW - 20,
        });
    }
  }

  doc.y = startY + 2 * (cardH + gap) + 5;
}

// ---------------------------------------------------------------------------
// Drawing: Section title
// ---------------------------------------------------------------------------
function drawSectionTitle(doc: PDFKit.PDFDocument, title: string, pageWidth: number) {
  ensureSpace(doc, 120);
  const left = doc.page.margins.left;
  doc.fontSize(13).fillColor(C.dark).text(title, left, doc.y);
  const lineY = doc.y + 3;
  doc
    .moveTo(left, lineY)
    .lineTo(left + pageWidth, lineY)
    .strokeColor(C.headerBg)
    .lineWidth(2)
    .stroke();
  doc.y = lineY + 10;
}

// ---------------------------------------------------------------------------
// Drawing: AI Insights callout box
// ---------------------------------------------------------------------------
function drawInsightsBox(doc: PDFKit.PDFDocument, insights: string, pageWidth: number) {
  const left = doc.page.margins.left;
  const padding = 12;
  const innerWidth = pageWidth - padding * 2 - 4;

  // Measure actual text height including word wrap
  const labelHeight = 16;
  doc.fontSize(9);
  const bodyHeight = doc.heightOfString(insights, { width: innerWidth });
  const boxHeight = Math.max(labelHeight + bodyHeight + padding * 2, 50);

  ensureSpace(doc, boxHeight + 10);

  const boxY = doc.y;

  roundedRect(doc, left, boxY, pageWidth, boxHeight, 4, C.netBg);
  roundedRect(doc, left, boxY, 3, boxHeight, 2, C.net);

  doc
    .fontSize(9)
    .fillColor(C.net)
    .text("INSIGHTS", left + padding + 4, boxY + padding, {
      width: innerWidth,
    });

  doc
    .fontSize(9)
    .fillColor(C.dark)
    .text(insights, left + padding + 4, boxY + padding + labelHeight, {
      width: innerWidth,
    });

  doc.y = boxY + boxHeight + 12;
}

// ---------------------------------------------------------------------------
// Drawing: Horizontal bar chart
// ---------------------------------------------------------------------------
function drawBarChart(
  doc: PDFKit.PDFDocument,
  categories: Array<{ category: string; amount: number; percentage: number }>,
  totalExpenses: number,
  pageWidth: number
) {
  const left = doc.page.margins.left;
  const barMaxWidth = pageWidth * 0.45;
  const rowHeight = 22;
  const labelWidth = pageWidth * 0.28;
  const barStartX = left + labelWidth;
  const amountX = barStartX + barMaxWidth + 8;
  const maxPct = Math.max(...categories.map((c) => c.percentage), 1);

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    ensureSpace(doc, rowHeight + 4);

    const y = doc.y;
    const barColor = BAR_COLORS[i % BAR_COLORS.length];

    doc.fontSize(9).fillColor(C.dark).text(cat.category, left, y + 4, {
      width: labelWidth - 8,
    });

    roundedRect(doc, barStartX, y + 3, barMaxWidth, 14, 3, C.divider);

    const barW = Math.max((cat.percentage / maxPct) * barMaxWidth, 2);
    if (barW > 0) {
      roundedRect(doc, barStartX, y + 3, barW, 14, 3, barColor);
    }

    doc
      .fontSize(9)
      .fillColor(C.dark)
      .text(`${fmt(cat.amount)}  ${cat.percentage.toFixed(1)}%`, amountX, y + 4, {
        width: pageWidth - (amountX - left),
      });

    doc.y = y + rowHeight;
  }

  ensureSpace(doc, 30);
  doc
    .moveTo(left, doc.y + 2)
    .lineTo(left + pageWidth, doc.y + 2)
    .strokeColor(C.divider)
    .lineWidth(1)
    .stroke();
  doc.y += 6;
  doc
    .fontSize(10)
    .fillColor(C.dark)
    .text("Total", left, doc.y, { width: labelWidth - 8 });
  doc
    .fontSize(10)
    .fillColor(C.dark)
    .text(fmt(totalExpenses), amountX, doc.y, {
      width: pageWidth - (amountX - left),
    });
  doc.moveDown(1);
}

// ---------------------------------------------------------------------------
// Drawing: Styled table
// ---------------------------------------------------------------------------
function drawStyledTable(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][],
  colWidths: number[],
  pageWidth: number,
  options?: { boldCols?: number[]; colColors?: Record<number, string> }
) {
  const left = doc.page.margins.left;
  const headerHeight = 20;
  const rowHeight = 18;

  // Ensure header + at least a few data rows fit on the same page
  const minRows = Math.min(rows.length, 3);
  ensureSpace(doc, headerHeight + 2 + minRows * rowHeight);

  const headerY = doc.y;
  roundedRect(doc, left, headerY, pageWidth, headerHeight, 3, C.headerBg);

  let x = left;
  for (let i = 0; i < headers.length; i++) {
    doc
      .fontSize(8)
      .fillColor(C.white)
      .text(headers[i], x + 6, headerY + 5, {
        width: pageWidth * colWidths[i] - 12,
        lineBreak: false,
      });
    x += pageWidth * colWidths[i];
  }
  doc.y = headerY + headerHeight + 2;

  for (let r = 0; r < rows.length; r++) {
    // Measure actual row height by checking max cell text height
    doc.fontSize(8);
    let maxCellH = rowHeight;
    for (let i = 0; i < rows[r].length; i++) {
      const cellW = pageWidth * colWidths[i] - 12;
      const h = doc.heightOfString(rows[r][i], { width: cellW }) + 8;
      if (h > maxCellH) maxCellH = h;
    }

    if (doc.y > doc.page.height - doc.page.margins.bottom - maxCellH - 10) {
      newPage(doc);
    }

    const rowY = doc.y;
    const isAlt = r % 2 === 1;

    if (isAlt) {
      doc.rect(left, rowY, pageWidth, maxCellH).fillColor(C.rowAlt).fill();
    }

    x = left;
    for (let i = 0; i < rows[r].length; i++) {
      const isBold = options?.boldCols?.includes(i);
      const color = options?.colColors?.[i] ?? C.dark;
      if (isBold) doc.font("Helvetica-Bold");
      doc
        .fontSize(8)
        .fillColor(color)
        .text(rows[r][i], x + 6, rowY + 4, {
          width: pageWidth * colWidths[i] - 12,
        });
      if (isBold) doc.font("Helvetica");
      x += pageWidth * colWidths[i];
    }

    doc
      .moveTo(left, rowY + maxCellH)
      .lineTo(left + pageWidth, rowY + maxCellH)
      .strokeColor(C.divider)
      .lineWidth(0.3)
      .stroke();

    doc.y = rowY + maxCellH;
  }

  doc.moveDown(1);
}

// ---------------------------------------------------------------------------
// Drawing: Callout box
// ---------------------------------------------------------------------------
function drawCalloutBox(
  doc: PDFKit.PDFDocument,
  text: string,
  subtext: string | null,
  pageWidth: number,
  borderColor: string,
  bgColor: string
) {
  const left = doc.page.margins.left;
  const boxHeight = subtext ? 38 : 26;
  ensureSpace(doc, boxHeight + 8);

  const y = doc.y;
  roundedRect(doc, left, y, pageWidth, boxHeight, 4, bgColor);
  roundedRect(doc, left, y, 3, boxHeight, 2, borderColor);

  doc.fontSize(9).fillColor(C.dark).text(text, left + 14, y + 8, {
    width: pageWidth - 28,
  });

  if (subtext) {
    doc.fontSize(8).fillColor(C.muted).text(subtext, left + 14, y + 22, {
      width: pageWidth - 28,
    });
  }

  doc.y = y + boxHeight + 8;
}

// ---------------------------------------------------------------------------
// Drawing: Goal progress
// ---------------------------------------------------------------------------
function drawGoalProgress(
  doc: PDFKit.PDFDocument,
  goals: PdfReportInput["goalProgress"],
  pageWidth: number
) {
  const left = doc.page.margins.left;

  for (const goal of goals) {
    ensureSpace(doc, 55);

    const progressPct =
      goal.target > 0 ? Math.min((goal.current / goal.target) * 100, 100) : 0;
    const onTrack =
      goal.goal_type === "budget"
        ? goal.current <= goal.target
        : goal.current >= goal.target;

    const barColor = goal.goal_type === "budget"
      ? (onTrack ? C.income : C.expense)
      : (onTrack ? C.income : C.amber);

    const statusText = onTrack
      ? "On Track"
      : goal.goal_type === "budget"
        ? "Over Budget"
        : "Behind";
    const statusColor = onTrack ? C.income : (goal.goal_type === "budget" ? C.expense : C.amber);
    const statusBg = onTrack ? C.incomeBg : (goal.goal_type === "budget" ? C.expenseBg : C.amberBg);

    doc.fontSize(10).fillColor(C.dark).text(goal.name, left, doc.y, {
      continued: true,
    });
    doc
      .fontSize(8)
      .fillColor(C.muted)
      .text(
        `  (${goal.goal_type.replace("_", " ")}${goal.category_name ? " — " + goal.category_name : ""})`,
        { continued: false }
      );

    const barY = doc.y + 3;
    const barWidth = pageWidth * 0.65;
    const barHeight = 12;

    roundedRect(doc, left, barY, barWidth, barHeight, 4, C.divider);

    const fillWidth = barWidth * (progressPct / 100);
    if (fillWidth > 0) {
      roundedRect(doc, left, barY, Math.max(fillWidth, 8), barHeight, 4, barColor);
    }

    const displayPct =
      goal.goal_type === "budget"
        ? `${((goal.current / (goal.target || 1)) * 100).toFixed(0)}%`
        : `${progressPct.toFixed(0)}%`;
    doc
      .fontSize(11)
      .fillColor(statusColor)
      .text(displayPct, left + barWidth + 10, barY + 1, {
        width: 40,
      });

    const pillX = left + barWidth + 55;
    const pillW = 65;
    const pillH = 14;
    roundedRect(doc, pillX, barY, pillW, pillH, 7, statusBg);
    doc
      .fontSize(7)
      .fillColor(statusColor)
      .text(statusText, pillX, barY + 3, {
        width: pillW,
        align: "center",
      });

    doc.y = barY + barHeight + 4;

    const currentLabel = goal.goal_type === "budget" ? "Spent" : "Saved";
    let detailText = `${currentLabel}: ${fmt(goal.current)} of ${fmt(goal.target)}`;
    if (goal.target_date) {
      const targetDate = new Date(goal.target_date + "T00:00:00Z");
      detailText += ` — Target: ${targetDate.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })}`;
    }
    doc.fontSize(8).fillColor(C.muted).text(detailText, left);
    doc.moveDown(0.7);
  }
}

// ---------------------------------------------------------------------------
// Drawing: Savings cards
// ---------------------------------------------------------------------------
function drawSavingsCards(
  doc: PDFKit.PDFDocument,
  recs: PdfReportInput["savingsRecommendations"],
  pageWidth: number
) {
  const left = doc.page.margins.left;

  doc
    .fontSize(8)
    .fillColor(C.muted)
    .text(
      "Based on your spending patterns, here are areas where you may be able to save:",
      left
    );
  doc.moveDown(0.4);

  for (const rec of recs) {
    const boxH = 36;
    ensureSpace(doc, boxH + 6);
    const y = doc.y;

    roundedRect(doc, left, y, pageWidth, boxH, 4, C.amberBg);
    roundedRect(doc, left, y, 3, boxH, 2, C.amber);

    doc
      .fontSize(9)
      .fillColor(C.dark)
      .text(
        `${rec.category}: ${fmt(rec.amount)} (${rec.percentage.toFixed(1)}% of expenses)`,
        left + 14,
        y + 8,
        { width: pageWidth - 28 }
      );
    doc
      .fontSize(8)
      .fillColor(C.muted)
      .text(`- ${rec.suggestion}`, left + 14, y + 22, {
        width: pageWidth - 28,
      });

    doc.y = y + boxH + 6;
  }
}

// ---------------------------------------------------------------------------
// Drawing: Health Score Gauge
// ---------------------------------------------------------------------------
function drawHealthScoreGauge(
  doc: PDFKit.PDFDocument,
  healthScore: NonNullable<PdfReportInput["healthScore"]>,
  pageWidth: number
) {
  const left = doc.page.margins.left;

  ensureSpace(doc, 160);
  drawSectionTitle(doc, "Financial Health Score", pageWidth);

  const score = healthScore.score;
  const gaugeColor =
    score >= 80 ? C.income : score >= 50 ? C.amber : C.expense;

  // Gauge dimensions
  const gaugeSize = 120;
  const centerX = left + pageWidth / 2;
  const centerY = doc.y + gaugeSize / 2;
  const radius = gaugeSize / 2 - 10;
  const lineWidth = 10;

  // Draw background arc (270 degrees, gap at bottom)
  const startAngle = (3 / 4) * Math.PI; // 135 degrees
  const endAngle = (9 / 4) * Math.PI; // 405 degrees (270 sweep)
  const steps = 60;

  // Background arc
  doc.save();
  doc.lineWidth(lineWidth).strokeColor(C.divider);
  doc.path(describeArc(centerX, centerY, radius, startAngle, endAngle, steps));
  doc.stroke();

  // Filled arc proportional to score
  if (score > 0) {
    const fillAngle = startAngle + (score / 100) * (endAngle - startAngle);
    doc.lineWidth(lineWidth).strokeColor(gaugeColor);
    doc.path(
      describeArc(centerX, centerY, radius, startAngle, fillAngle, steps)
    );
    doc.stroke();
  }
  doc.restore();

  // Score number centered
  doc
    .fontSize(28)
    .fillColor(gaugeColor)
    .text(String(score), centerX - 30, centerY - 16, {
      width: 60,
      align: "center",
    });

  doc
    .fontSize(10)
    .fillColor(C.muted)
    .text("/100", centerX - 25, centerY + 14, {
      width: 50,
      align: "center",
    });

  doc.y = centerY + gaugeSize / 2 + 5;

  // Previous score comparison
  if (healthScore.previous_score !== null) {
    const diff = score - healthScore.previous_score;
    const arrow = diff >= 0 ? "+" : "";
    const diffColor = diff >= 0 ? C.income : C.expense;
    doc
      .fontSize(9)
      .fillColor(diffColor)
      .text(
        `${arrow}${diff} pts vs last month`,
        left,
        doc.y,
        { width: pageWidth, align: "center" }
      );
    doc.moveDown(0.5);
  }

  // Factor breakdown as compact pills
  const factors = Object.entries(healthScore.factors);
  if (factors.length > 0) {
    const pillWidth = Math.min((pageWidth - (factors.length - 1) * 6) / factors.length, 120);
    let x = left + (pageWidth - factors.length * pillWidth - (factors.length - 1) * 6) / 2;
    const pillY = doc.y;

    for (const [name, factor] of factors) {
      const pillColor =
        factor.rating === "good" || factor.rating === "excellent"
          ? C.incomeBg
          : factor.rating === "fair"
            ? C.amberBg
            : C.expenseBg;
      const textColor =
        factor.rating === "good" || factor.rating === "excellent"
          ? C.income
          : factor.rating === "fair"
            ? C.amber
            : C.expense;

      roundedRect(doc, x, pillY, pillWidth, 30, 4, pillColor);
      doc
        .fontSize(7)
        .fillColor(C.muted)
        .text(
          name.replace(/_/g, " ").toUpperCase(),
          x + 4,
          pillY + 4,
          { width: pillWidth - 8, align: "center" }
        );
      doc
        .fontSize(9)
        .fillColor(textColor)
        .text(
          `${factor.points}/${factor.max}`,
          x + 4,
          pillY + 16,
          { width: pillWidth - 8, align: "center" }
        );
      x += pillWidth + 6;
    }

    doc.y = pillY + 38;
  }
}

/** Build an SVG-style path string for an arc. */
function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
  steps: number
): string {
  const parts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + (i / steps) * (endAngle - startAngle);
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    parts.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
  }
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Drawing: Spending Allocation Bar
// ---------------------------------------------------------------------------
function drawAllocationBar(
  doc: PDFKit.PDFDocument,
  allocation: NonNullable<PdfReportInput["allocation"]>,
  pageWidth: number
) {
  const left = doc.page.margins.left;
  ensureSpace(doc, 80);

  // Section title
  drawSectionTitle(doc, "Spending Allocation", pageWidth);

  const barHeight = 14;
  const barY = doc.y;
  const barRadius = 7;

  const segments = [
    { label: "Needs", pct: allocation.needs.percentage, color: "#3b82f6" },
    { label: "Wants", pct: allocation.wants.percentage, color: "#8b5cf6" },
    { label: "Savings", pct: allocation.savings.percentage, color: C.income },
  ];

  // Include unclassified only if meaningful
  if (allocation.unclassified.percentage > 1) {
    segments.push({
      label: "Other",
      pct: allocation.unclassified.percentage,
      color: C.muted,
    });
  }

  // Background bar with rounded ends
  roundedRect(doc, left, barY, pageWidth, barHeight, barRadius, C.divider);

  // Draw segments left-to-right
  let x = left;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segWidth = (seg.pct / 100) * pageWidth;
    if (segWidth < 1) continue;

    // For first and last segments, use rounded rect; middle segments use plain rect
    if (i === 0 && segments.length === 1) {
      roundedRect(doc, x, barY, segWidth, barHeight, barRadius, seg.color);
    } else if (i === 0) {
      // Round left side only — draw a full rounded rect clipped on the right
      doc.save();
      doc.rect(x, barY, segWidth, barHeight).clip();
      roundedRect(doc, x, barY, segWidth + barRadius, barHeight, barRadius, seg.color);
      doc.restore();
    } else if (i === segments.length - 1) {
      // Round right side only
      doc.save();
      doc.rect(x, barY, segWidth, barHeight).clip();
      roundedRect(doc, x - barRadius, barY, segWidth + barRadius, barHeight, barRadius, seg.color);
      doc.restore();
    } else {
      doc.rect(x, barY, segWidth, barHeight).fillColor(seg.color).fill();
    }
    x += segWidth;
  }

  doc.y = barY + barHeight + 8;

  // Labels below
  const labelParts = segments
    .map((s) => `${s.label} ${s.pct.toFixed(0)}%`)
    .join("  |  ");
  doc
    .fontSize(9)
    .fillColor(C.dark)
    .text(labelParts, left, doc.y, { width: pageWidth, align: "center" });
  doc.moveDown(0.3);

  // Benchmark text
  doc
    .fontSize(8)
    .fillColor(C.muted)
    .text("50/30/20 Guideline", left, doc.y, {
      width: pageWidth,
      align: "center",
    });
  doc.moveDown(1);
}

// ---------------------------------------------------------------------------
// Drawing: Debt Section
// ---------------------------------------------------------------------------
function drawDebtSection(
  doc: PDFKit.PDFDocument,
  debts: NonNullable<PdfReportInput["debts"]>,
  pageWidth: number
) {
  if (debts.length === 0) return;

  drawSectionTitle(doc, "Outstanding Debts", pageWidth);

  const headers = ["Name", "Type", "Balance", "APR", "Monthly Payment"];
  const colWidths = [0.25, 0.18, 0.2, 0.12, 0.25];

  const rows = debts.map((d) => [
    d.name,
    d.debt_type.replace(/_/g, " "),
    fmt(d.current_balance),
    `${d.interest_rate.toFixed(1)}%`,
    fmt(d.minimum_payment),
  ]);

  // Total row
  const totalBalance = debts.reduce((sum, d) => sum + d.current_balance, 0);
  const totalPayment = debts.reduce((sum, d) => sum + d.minimum_payment, 0);
  rows.push(["Total", "", fmt(totalBalance), "", fmt(totalPayment)]);

  drawStyledTable(doc, headers, rows, colWidths, pageWidth, {
    boldCols: [0, 2],
  });
}

// ---------------------------------------------------------------------------
// Main builder (same signature as before)
// ---------------------------------------------------------------------------
export function buildReportPdf(input: PdfReportInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pageCounter = { value: 0 };
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Uint8Array[] = [];
    const generatedDate = new Date().toLocaleDateString("en-US");

    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;

    activeFooterCtx = { doc, generatedDate, pageCounter };

    // =====================================================================
    // PAGE 1: Header banner + Metric cards + AI Insights
    // =====================================================================
    drawHeaderBanner(doc, input.title, input.month);

    const net = input.reportData.total_income - input.reportData.total_expenses;
    const mom = input.reportData.month_over_month;

    const cards: MetricCard[] = [
      {
        label: "Total Income",
        value: fmt(input.reportData.total_income),
        trend: mom ? `${Math.abs(mom.income_change).toFixed(1)}%` : undefined,
        trendPositive: mom ? mom.income_change >= 0 : undefined,
        borderColor: C.income,
        bgColor: C.incomeBg,
        valueColor: C.income,
      },
      {
        label: "Total Expenses",
        value: fmt(input.reportData.total_expenses),
        trend: mom ? `${Math.abs(mom.expense_change).toFixed(1)}%` : undefined,
        trendPositive: mom ? mom.expense_change <= 0 : undefined,
        borderColor: C.expense,
        bgColor: C.expenseBg,
        valueColor: C.expense,
      },
      {
        label: "Net",
        value: fmt(net),
        borderColor: C.net,
        bgColor: C.netBg,
        valueColor: net >= 0 ? C.net : C.expense,
      },
      {
        label: "Savings Rate",
        value: `${input.reportData.savings_rate.toFixed(1)}%`,
        borderColor: C.savings,
        bgColor: C.savingsBg,
        valueColor: C.savings,
      },
    ];

    // Health Score Gauge — immediately after header
    if (input.healthScore) {
      drawHealthScoreGauge(doc, input.healthScore, pageWidth);
    }

    drawMetricCards(doc, cards, pageWidth);

    if (input.aiInsights) {
      drawInsightsBox(doc, input.aiInsights, pageWidth);
    }

    // Spending Allocation Bar — after AI insights
    if (input.allocation) {
      drawAllocationBar(doc, input.allocation, pageWidth);
    }

    // =====================================================================
    // SECTION: Expense Breakdown + Recurring Bills
    // =====================================================================
    if (
      input.reportData.by_category.length > 0 ||
      input.recurringBills.length > 0
    ) {
      // Estimate space for expense breakdown bar chart
      const barChartRows = input.reportData.by_category.length;
      const barChartHeight = barChartRows > 0 ? 30 + barChartRows * 26 + 20 : 0;
      ensureSpace(doc, barChartHeight > 0 ? barChartHeight : sectionStartHeight(input.recurringBills.length));

      if (input.reportData.by_category.length > 0) {
        drawSectionTitle(doc, "Expense Breakdown", pageWidth);
        drawBarChart(
          doc,
          input.reportData.by_category,
          input.reportData.total_expenses,
          pageWidth
        );
      }

      if (input.recurringBills.length > 0) {
        drawSectionTitle(doc, "Recurring Bills", pageWidth);
        const headers = ["Bill", "Amount", "Frequency", "Next Due"];
        const rows = input.recurringBills.map((b) => [
          b.friendly_name || b.description,
          fmt(b.amount),
          b.recurrence_interval ?? "—",
          b.next_due_date
            ? new Date(b.next_due_date + "T00:00:00Z").toLocaleDateString(
                "en-US",
                { timeZone: "UTC" }
              )
            : "—",
        ]);
        drawStyledTable(doc, headers, rows, [0.35, 0.2, 0.2, 0.25], pageWidth, {
          boldCols: [1],
        });
      }
    }

    // =====================================================================
    // SECTION: Income Sources + Subscriptions + Goals
    // =====================================================================
    if (
      input.incomeSources.length > 0 ||
      input.subscriptionsPaid.length > 0 ||
      input.goalProgress.length > 0
    ) {
      const nextSectionRows = input.incomeSources.length || input.subscriptionsPaid.length || input.goalProgress.length;
      ensureSpace(doc, sectionStartHeight(nextSectionRows));

      if (input.incomeSources.length > 0) {
        drawSectionTitle(doc, "Income Sources", pageWidth);
        const headers = ["Source", "Amount", "Frequency", "Attributed To"];
        const rows = input.incomeSources.map((i) => [
          i.source_name,
          fmt(i.amount),
          i.frequency,
          i.attributed_to_name ?? "Self",
        ]);
        drawStyledTable(
          doc,
          headers,
          rows,
          [0.3, 0.2, 0.2, 0.3],
          pageWidth
        );
      }

      if (input.subscriptionsPaid.length > 0) {
        drawSectionTitle(doc, "Subscriptions", pageWidth);
        const subHeaders = ["Name", "Amount", "Frequency", "Category"];
        const subRows = input.subscriptionsPaid.map((s) => [
          s.name,
          fmt(s.amount),
          s.recurrence_interval,
          s.category ?? "—",
        ]);
        drawStyledTable(
          doc,
          subHeaders,
          subRows,
          [0.35, 0.2, 0.2, 0.25],
          pageWidth
        );

        const totalSubs = input.subscriptionsPaid.reduce(
          (sum, s) => sum + s.amount,
          0
        );
        const subPct =
          input.reportData.total_expenses > 0
            ? ((totalSubs / input.reportData.total_expenses) * 100).toFixed(1)
            : "0.0";
        drawCalloutBox(
          doc,
          `Total Subscription Cost: ${fmt(totalSubs)}/mo`,
          `Subscriptions represent ${subPct}% of total expenses`,
          pageWidth,
          C.amber,
          C.amberBg
        );
      }

      if (input.goalProgress.length > 0) {
        drawSectionTitle(doc, "Goal Progress", pageWidth);
        drawGoalProgress(doc, input.goalProgress, pageWidth);
      }
    }

    // =====================================================================
    // SECTION: Outstanding Debts
    // =====================================================================
    if (input.debts && input.debts.length > 0) {
      ensureSpace(doc, sectionStartHeight(input.debts.length));
      drawDebtSection(doc, input.debts, pageWidth);
    }

    // =====================================================================
    // SECTION: Savings Opportunities + Member Contributions
    // =====================================================================
    const hasSavings = input.savingsRecommendations.length > 0;
    const hasMembers =
      input.memberContributions && input.memberContributions.length > 0;

    if (hasSavings || hasMembers) {
      const savingsCardH = hasSavings ? 30 + Math.min(input.savingsRecommendations.length, 2) * 70 : 0;
      const memberRows = hasMembers && input.memberContributions ? input.memberContributions.length : 0;
      ensureSpace(doc, savingsCardH > 0 ? savingsCardH : sectionStartHeight(memberRows));

      if (hasSavings) {
        drawSectionTitle(doc, "Savings Opportunities", pageWidth);
        drawSavingsCards(doc, input.savingsRecommendations, pageWidth);
      }

      if (hasMembers && input.memberContributions) {
        drawSectionTitle(doc, "Member Contributions", pageWidth);
        const headers = ["Member", "Income", "Expenses"];
        const rows = input.memberContributions.map((m) => [
          m.display_name,
          fmt(m.income),
          fmt(m.expenses),
        ]);
        drawStyledTable(doc, headers, rows, [0.4, 0.3, 0.3], pageWidth, {
          colColors: { 1: C.income, 2: C.expense },
        });
      }
    }

    // Final page footer
    drawPageFooter(doc, generatedDate, pageCounter);
    activeFooterCtx = null;

    doc.end();
  });
}
