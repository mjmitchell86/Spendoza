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
      unsubscribeUrl:
        "https://api.spendoza.io/api/emails/unsubscribe?token=abc",
    });

    expect(html).toContain("Matt");
    expect(html).toContain("January 2026");
    expect(html).toContain("7,500");
    expect(html).toContain("2,200");
    expect(html).toContain("5,300");
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
      unsubscribeUrl:
        "https://api.spendoza.io/api/emails/unsubscribe?token=xyz",
    });

    expect(html).toContain("Test");
    expect(html).not.toContain("undefined");
  });
});
