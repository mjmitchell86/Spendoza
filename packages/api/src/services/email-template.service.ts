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
