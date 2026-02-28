import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { ReportData } from "../report-insights";

// ---------------------------------------------------------------------------
// Mock LangChain
// ---------------------------------------------------------------------------
const mockInvoke = mock(() => Promise.resolve({ content: "" }));

mock.module("@langchain/openai", () => ({
  ChatOpenAI: class {
    invoke = mockInvoke;
  },
}));

mock.module("../../lib/supabase", () => ({
  supabaseAdmin: { from: () => ({ insert: () => ({ error: null }) }) },
}));

mock.module("@langchain/core/messages", () => ({
  SystemMessage: class {
    constructor(public content: string) {}
  },
  HumanMessage: class {
    constructor(public content: string) {}
  },
}));

const { generateGoalSuggestions } = await import("../goal-suggestions");

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const sampleReportData: ReportData = {
  total_income: 5000,
  total_expenses: 3500,
  savings_rate: 30,
  expense_to_income_ratio: 0.7,
  by_category: [
    { category: "Housing", amount: 1500, percentage: 42.9 },
    { category: "Food", amount: 800, percentage: 22.9 },
    { category: "Entertainment", amount: 400, percentage: 11.4 },
    { category: "Transport", amount: 300, percentage: 8.6 },
  ],
  top_categories: ["Housing", "Food", "Entertainment"],
  month_over_month: { income_change: 5.0, expense_change: -2.0 },
};

const validSuggestionsResponse = JSON.stringify({
  suggestions: [
    {
      name: "Food Budget",
      goal_type: "budget",
      category: "Food",
      target_amount: 650,
      rationale: "You spent $800 on food. Setting a $650 budget would save $150/month.",
    },
    {
      name: "Monthly Savings Target",
      goal_type: "monthly_savings",
      category: null,
      target_amount: 2000,
      rationale: "With $5,000 income and 30% savings rate, pushing to $2,000/month is achievable.",
    },
  ],
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  mockInvoke.mockReset();
});

describe("generateGoalSuggestions", () => {
  it("returns suggestions array when AI responds with valid JSON", async () => {
    mockInvoke.mockResolvedValueOnce({ content: validSuggestionsResponse });

    const result = await generateGoalSuggestions(sampleReportData, "user", []);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Food Budget");
    expect(result[0].goal_type).toBe("budget");
    expect(result[0].category).toBe("Food");
    expect(result[0].target_amount).toBe(650);
    expect(result[0].rationale).toContain("$800");
    expect(result[1].name).toBe("Monthly Savings Target");
    expect(result[1].goal_type).toBe("monthly_savings");
  });

  it("returns empty array when AI returns invalid JSON", async () => {
    mockInvoke.mockResolvedValueOnce({ content: "This is not valid JSON at all" });

    const result = await generateGoalSuggestions(sampleReportData, "user", []);

    expect(result).toEqual([]);
  });

  it("returns empty array when AI call fails", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("OpenAI API timeout"));

    const result = await generateGoalSuggestions(sampleReportData, "user", []);

    expect(result).toEqual([]);
  });

  it("filters out goals matching existing names", async () => {
    mockInvoke.mockResolvedValueOnce({ content: validSuggestionsResponse });

    const result = await generateGoalSuggestions(sampleReportData, "user", [
      "Food Budget",
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Monthly Savings Target");
  });

  it("filters existing names case-insensitively", async () => {
    mockInvoke.mockResolvedValueOnce({ content: validSuggestionsResponse });

    const result = await generateGoalSuggestions(sampleReportData, "user", [
      "food budget",
      "monthly savings target",
    ]);

    expect(result).toEqual([]);
  });

  it("returns empty array when suggestions have invalid schema", async () => {
    const badResponse = JSON.stringify({
      suggestions: [
        {
          name: "Bad Goal",
          goal_type: "invalid_type",
          category: null,
          target_amount: -100,
          rationale: "test",
        },
      ],
    });
    mockInvoke.mockResolvedValueOnce({ content: badResponse });

    const result = await generateGoalSuggestions(sampleReportData, "user", []);

    expect(result).toEqual([]);
  });
});
