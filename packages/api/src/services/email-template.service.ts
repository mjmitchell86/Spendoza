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

export interface AnnualReportEmailData {
  userName: string;
  year: number;
  totalIncome: number;
  totalExpenses: number;
  netSavings: number;
  savingsRate: number;
  goalsAchieved: number;
  goalsTotal: number;
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
      <p style="margin:8px 0 0;color:#d1fae5;font-size:14px;">Your Weekly ${data.reportTitle}</p>
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

export function buildAnnualReportEmailHtml(data: AnnualReportEmailData): string {
  const insightsHtml =
    data.aiInsights.length > 0
      ? `
        <div style="background-color:#1a1a3e;border-radius:8px;padding:16px 20px;margin:24px 0;border:1px solid #c9a84c;">
          <h3 style="margin:0 0 12px;font-size:16px;color:#c9a84c;">Year-in-Review Insights</h3>
          <ul style="margin:0;padding-left:20px;color:#e8e8f0;">
            ${data.aiInsights.map((insight) => `<li style="margin-bottom:8px;">${insight}</li>`).join("")}
          </ul>
        </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Your ${data.year} Year in Review - Spendoza</title>
</head>
<body style="margin:0;padding:0;background-color:#0d0d2b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1a1a3e,#0d0d2b);border-radius:12px 12px 0 0;padding:40px 24px;text-align:center;border:1px solid #c9a84c;border-bottom:none;">
      <div style="font-size:28px;margin-bottom:8px;">&#10024; &#127878; &#10024;</div>
      <h1 style="margin:0;font-size:28px;color:#c9a84c;font-weight:700;">Happy New Year!</h1>
      <p style="margin:8px 0 0;color:#e8e8f0;font-size:14px;">Your ${data.year} Year in Review</p>
      <div style="display:inline-block;background-color:#c9a84c;color:#0d0d2b;padding:6px 20px;border-radius:20px;font-weight:700;font-size:20px;margin-top:16px;">${data.year}</div>
    </div>

    <!-- Body -->
    <div style="background-color:#141432;padding:32px 24px;border-radius:0 0 12px 12px;border:1px solid #c9a84c;border-top:none;">
      <p style="margin:0 0 8px;font-size:16px;color:#e8e8f0;">Hi ${data.userName},</p>
      <p style="margin:0 0 24px;font-size:14px;color:#a0a0c0;">Here's your financial year in review for <strong style="color:#c9a84c;">${data.year}</strong>. What a journey!</p>

      <!-- Metric Cards -->
      <div style="display:flex;gap:12px;margin-bottom:12px;">
        <div style="flex:1;background-color:#1a1a3e;border-radius:8px;padding:16px;text-align:center;border:1px solid #2a2a5e;">
          <div style="font-size:12px;color:#a0a0c0;margin-bottom:4px;">Total Income</div>
          <div style="font-size:20px;font-weight:700;color:#4ade80;">${formatCurrency(data.totalIncome)}</div>
        </div>
        <div style="flex:1;background-color:#1a1a3e;border-radius:8px;padding:16px;text-align:center;border:1px solid #2a2a5e;">
          <div style="font-size:12px;color:#a0a0c0;margin-bottom:4px;">Total Expenses</div>
          <div style="font-size:20px;font-weight:700;color:#f87171;">${formatCurrency(data.totalExpenses)}</div>
        </div>
      </div>
      <div style="display:flex;gap:12px;margin-bottom:12px;">
        <div style="flex:1;background-color:#1a1a3e;border-radius:8px;padding:16px;text-align:center;border:1px solid #2a2a5e;">
          <div style="font-size:12px;color:#a0a0c0;margin-bottom:4px;">Net Savings</div>
          <div style="font-size:20px;font-weight:700;color:#60a5fa;">${formatCurrency(data.netSavings)}</div>
        </div>
        <div style="flex:1;background-color:#1a1a3e;border-radius:8px;padding:16px;text-align:center;border:1px solid #2a2a5e;">
          <div style="font-size:12px;color:#a0a0c0;margin-bottom:4px;">Savings Rate</div>
          <div style="font-size:20px;font-weight:700;color:#c084fc;">${data.savingsRate.toFixed(1)}%</div>
        </div>
      </div>
      <!-- Goals Card -->
      <div style="background-color:#1a1a3e;border-radius:8px;padding:16px;text-align:center;margin-bottom:24px;border:1px solid #c9a84c;">
        <div style="font-size:12px;color:#a0a0c0;margin-bottom:4px;">Goals Achieved</div>
        <div style="font-size:24px;font-weight:700;color:#c9a84c;">${data.goalsAchieved} <span style="font-size:14px;color:#a0a0c0;font-weight:400;">of ${data.goalsTotal}</span></div>
      </div>

      ${insightsHtml}

      <!-- Inspirational Message -->
      <div style="text-align:center;padding:20px 0;border-top:1px solid #2a2a5e;margin-top:24px;">
        <p style="font-size:16px;color:#c9a84c;font-style:italic;margin:0;">
          "Every new year is a new chapter. Make ${data.year + 1} your best financial year yet!"
        </p>
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin:24px 0 16px;">
        <a href="${data.appReportUrl}" style="display:inline-block;background-color:#c9a84c;color:#0d0d2b;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
          View Your Dashboard
        </a>
      </div>

      <p style="margin:24px 0 0;font-size:12px;color:#a0a0c0;text-align:center;">
        The full annual PDF report is attached to this email.
      </p>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:24px 0;font-size:12px;color:#a0a0c0;">
      <p style="margin:0;">You're receiving this because you enabled Spendoza Reports.</p>
      <p style="margin:8px 0 0;"><a href="${data.unsubscribeUrl}" style="color:#a0a0c0;text-decoration:underline;">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>`;
}
