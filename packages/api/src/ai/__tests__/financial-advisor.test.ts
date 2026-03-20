import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { FinancialContext } from "../financial-advisor";

// ---------------------------------------------------------------------------
// Mock LangChain
// ---------------------------------------------------------------------------
const mockInvoke = mock(() => Promise.resolve({ content: "", usage_metadata: null }));

mock.module("@langchain/openai", () => ({
  ChatOpenAI: class {
    invoke = mockInvoke;
  },
}));

mock.module("../../lib/supabase", () => ({
  supabaseAdmin: { from: () => ({ insert: () => ({ error: null }) }) },
  createSupabaseClient: () => ({ from: () => ({ insert: () => ({ error: null }) }) }),
}));

mock.module("@langchain/core/messages", () => ({
  SystemMessage: class {
    constructor(public content: string) {}
  },
  HumanMessage: class {
    constructor(public content: string) {}
  },
  AIMessage: class {
    constructor(public content: string) {}
  },
}));

const { generateFinancialAdvice } = await import("../financial-advisor");

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const sampleContext: FinancialContext = {
  reports: [
    {
      month: "2026-02-01",
      data: {
        total_income: 5000,
        total_expenses: 3500,
        savings_rate: 30,
        expense_to_income_ratio: 0.7,
        by_category: [
          { category: "Housing", amount: 1500, percentage: 42.9 },
          { category: "Food", amount: 800, percentage: 22.9 },
        ],
        top_categories: ["Housing", "Food"],
        month_over_month: { income_change: 5.0, expense_change: -2.0 },
        allocation: {
          needs: { amount: 2000, percentage: 57 },
          wants: { amount: 1000, percentage: 28.6 },
          savings: { amount: 500, percentage: 14.3 },
          unclassified: { amount: 0, percentage: 0 },
          benchmark: { needs: 50, wants: 30, savings: 20 },
        },
        financial_health_score: {
          score: 72,
          previous_score: 68,
          factors: {
            savings_rate: { value: 30, points: 25, max: 30, rating: "good" },
            needs_ratio: { value: 57, points: 12, max: 20, rating: "ok" },
            wants_ratio: { value: 28.6, points: 15, max: 20, rating: "good" },
            emergency_fund: { value: 1.5, points: 8, max: 15, rating: "warning" },
            debt_to_income: { value: 15, points: 12, max: 15, rating: "good" },
          },
        },
      },
    },
  ],
  income_entries: [
    { source_name: "Salary", amount: 5000, frequency: "monthly" },
  ],
  expenses: [
    { description: "Rent", amount: 1500, category: "Housing", frequency: "recurring" },
    { description: "Groceries", amount: 400, category: "Food", frequency: "recurring" },
  ],
  debts: [
    {
      name: "Credit Card",
      debt_type: "credit_card",
      current_balance: 3000,
      interest_rate: 22.5,
      minimum_payment: 90,
    },
  ],
  goals: [
    { name: "Emergency Fund", goal_type: "emergency_fund", target_amount: 15000, current_amount: 5000 },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  mockInvoke.mockReset();
});

describe("generateFinancialAdvice", () => {
  it("returns advice string from LLM", async () => {
    const expectedAnswer =
      "Based on your financial data, your savings rate of 30% is excellent. However, your emergency fund covers only 1.5 months of expenses. Consider prioritizing building that up to 3-6 months.";
    mockInvoke.mockResolvedValueOnce({
      content: expectedAnswer,
      usage_metadata: { input_tokens: 500, output_tokens: 100 },
    });

    const result = await generateFinancialAdvice(
      "How is my financial health?",
      sampleContext,
      "user-123"
    );

    expect(result).toBe(expectedAnswer);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("includes financial context in the prompt sent to LLM", async () => {
    mockInvoke.mockResolvedValueOnce({ content: "Great question!", usage_metadata: null });

    await generateFinancialAdvice(
      "Should I pay off debt first?",
      sampleContext,
      "user-123"
    );

    const call = mockInvoke.mock.calls[0];
    const humanMessage = call[0][1];
    const prompt = humanMessage.content;

    // Verify context includes key financial data
    expect(prompt).toContain("$5000.00");
    expect(prompt).toContain("$3500.00");
    expect(prompt).toContain("Salary");
    expect(prompt).toContain("Credit Card");
    expect(prompt).toContain("Emergency Fund");
    expect(prompt).toContain("Housing");
    expect(prompt).toContain("Should I pay off debt first?");
  });

  it("throws error when LLM call fails", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("API timeout"));

    await expect(
      generateFinancialAdvice("Test question", sampleContext, "user-123")
    ).rejects.toThrow("API timeout");
  });

  it("handles empty financial context gracefully", async () => {
    const emptyContext: FinancialContext = {
      reports: [],
      income_entries: [],
      expenses: [],
      debts: [],
      goals: [],
    };

    mockInvoke.mockResolvedValueOnce({
      content: "You haven't added any financial data yet.",
      usage_metadata: null,
    });

    const result = await generateFinancialAdvice(
      "How am I doing?",
      emptyContext,
      "user-123"
    );

    expect(result).toContain("haven't added");

    // Verify the prompt mentions no data
    const call = mockInvoke.mock.calls[0];
    const humanMessage = call[0][1];
    expect(humanMessage.content).toContain("No financial data available");
  });

  it("passes conversation history to LLM when provided", async () => {
    mockInvoke.mockResolvedValueOnce({
      content: "Following up on your debt question...",
      usage_metadata: null,
    });

    const history = [
      { role: "user" as const, content: "How should I handle my credit card debt?" },
      { role: "assistant" as const, content: "You should prioritize paying it off." },
    ];

    await generateFinancialAdvice(
      "What about the avalanche method?",
      sampleContext,
      "user-123",
      history
    );

    const call = mockInvoke.mock.calls[0];
    const messages = call[0];

    // System + first human (with context) + AI response + follow-up question
    expect(messages.length).toBe(4);
    expect(messages[0].content).toContain("personal finance advisor");
    expect(messages[1].content).toContain("credit card debt");
    expect(messages[2].content).toContain("prioritize paying");
    expect(messages[3].content).toContain("avalanche method");
  });

  it("uses single-message format when no history provided", async () => {
    mockInvoke.mockResolvedValueOnce({ content: "Advice here.", usage_metadata: null });

    await generateFinancialAdvice("Test?", sampleContext, "user-123");

    const call = mockInvoke.mock.calls[0];
    const messages = call[0];

    // System + single human message
    expect(messages.length).toBe(2);
  });

  it("handles non-string LLM response content", async () => {
    mockInvoke.mockResolvedValueOnce({
      content: [{ type: "text", text: "response" }],
      usage_metadata: null,
    });

    const result = await generateFinancialAdvice(
      "Test",
      sampleContext,
      "user-123"
    );

    expect(typeof result).toBe("string");
  });
});
