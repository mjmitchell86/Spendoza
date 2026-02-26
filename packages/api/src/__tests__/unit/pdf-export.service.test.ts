import { describe, it, expect, mock } from "bun:test";

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

const { generatePersonalPdfForUser, generateHouseholdPdfForHousehold } = await import(
  "../../services/pdf-export.service"
);

describe("pdf-export.service", () => {
  it("exports generatePersonalPdfForUser function", () => {
    expect(typeof generatePersonalPdfForUser).toBe("function");
  });

  it("exports generateHouseholdPdfForHousehold function", () => {
    expect(typeof generateHouseholdPdfForHousehold).toBe("function");
  });
});
