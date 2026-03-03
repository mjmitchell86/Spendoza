import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { ParsedTransaction } from "../pdf-parser";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const SAMPLE_TRANSACTIONS: ParsedTransaction[] = [
  {
    date: "2026-01-05",
    description: "WALMART SUPERCENTER #1234",
    amount: 52.43,
    type: "debit",
  },
  {
    date: "2026-01-10",
    description: "SHELL GAS STATION",
    amount: 35.0,
    type: "debit",
  },
  {
    date: "2026-01-15",
    description: "PAYROLL DEPOSIT",
    amount: 2500.0,
    type: "credit",
  },
  {
    date: "2026-01-20",
    description: "NETFLIX SUBSCRIPTION",
    amount: 15.99,
    type: "debit",
  },
];

const USER_CATEGORIES = [
  "Groceries",
  "Transportation",
  "Income",
  "Entertainment",
  "Utilities",
];

const CLASSIFIED_RESPONSE = [
  { description: "WALMART SUPERCENTER #1234", ai_category: "Groceries" },
  { description: "SHELL GAS STATION", ai_category: "Transportation" },
  { description: "PAYROLL DEPOSIT", ai_category: "Income" },
  { description: "NETFLIX SUBSCRIPTION", ai_category: "Entertainment" },
];

// ---------------------------------------------------------------------------
// Mock @langchain/openai ChatOpenAI
// ---------------------------------------------------------------------------
const mockInvoke = mock(() =>
  Promise.resolve({
    content: JSON.stringify({ classifications: CLASSIFIED_RESPONSE }),
  })
);

mock.module("@langchain/openai", () => ({
  ChatOpenAI: class MockChatOpenAI {
    constructor(_opts?: any) {}
    invoke = mockInvoke;
  },
}));

// We also need pdf-parse mocked since transaction-classifier imports from pdf-parser
mock.module("../../lib/supabase", () => ({
  supabaseAdmin: { from: () => ({ insert: () => ({ error: null }) }) },
  createSupabaseClient: () => ({ from: () => ({ insert: () => ({ error: null }) }) }),
}));

mock.module("pdf-parse", () => ({
  default: mock(() => Promise.resolve({ text: "" })),
}));

// ---------------------------------------------------------------------------
// Import module under test AFTER mocks are set up
// ---------------------------------------------------------------------------
const { classifyTransactions } = await import("../transaction-classifier");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  mockInvoke.mockClear();

  mockInvoke.mockImplementation(() =>
    Promise.resolve({
      content: JSON.stringify({ classifications: CLASSIFIED_RESPONSE }),
    })
  );
});

describe("classifyTransactions", () => {
  it("classifies transactions using the provided user categories", async () => {
    const result = await classifyTransactions(
      SAMPLE_TRANSACTIONS,
      USER_CATEGORIES
    );

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(4);

    // Each result should have all original fields plus ai_category
    expect(result[0].date).toBe("2026-01-05");
    expect(result[0].description).toBe("WALMART SUPERCENTER #1234");
    expect(result[0].amount).toBe(52.43);
    expect(result[0].type).toBe("debit");
    expect(result[0].ai_category).toBe("Groceries");

    expect(result[1].ai_category).toBe("Transportation");
    expect(result[2].ai_category).toBe("Income");
    expect(result[3].ai_category).toBe("Entertainment");
  });

  it("returns empty array for empty transactions", async () => {
    const result = await classifyTransactions([], USER_CATEGORIES);

    expect(result).toEqual([]);
    // Should not call AI for empty array
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("processes large batches in multiple AI calls", async () => {
    // Create 25 transactions to test batching (batch size = 20)
    const manyTransactions: ParsedTransaction[] = Array.from(
      { length: 25 },
      (_, i) => ({
        date: `2026-01-${String(i + 1).padStart(2, "0")}`,
        description: `TRANSACTION ${i + 1}`,
        amount: 10 + i,
        type: "debit" as const,
      })
    );

    // First batch: 20 items
    const firstBatchResponse = manyTransactions.slice(0, 20).map((t) => ({
      description: t.description,
      ai_category: "Groceries",
    }));
    // Second batch: 5 items
    const secondBatchResponse = manyTransactions.slice(20).map((t) => ({
      description: t.description,
      ai_category: "Entertainment",
    }));

    let callCount = 0;
    mockInvoke.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          content: JSON.stringify({ classifications: firstBatchResponse }),
        });
      }
      return Promise.resolve({
        content: JSON.stringify({ classifications: secondBatchResponse }),
      });
    });

    const result = await classifyTransactions(manyTransactions, USER_CATEGORIES);

    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(25);
    // First 20 should be Groceries, last 5 should be Entertainment
    expect(result[0].ai_category).toBe("Groceries");
    expect(result[19].ai_category).toBe("Groceries");
    expect(result[20].ai_category).toBe("Entertainment");
    expect(result[24].ai_category).toBe("Entertainment");
  });

  it("includes user categories in the AI prompt", async () => {
    await classifyTransactions(SAMPLE_TRANSACTIONS, USER_CATEGORIES);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const callArgs = mockInvoke.mock.calls[0][0];
    const promptContent = Array.isArray(callArgs)
      ? callArgs.map((m: any) => m.content).join(" ")
      : typeof callArgs === "string"
        ? callArgs
        : JSON.stringify(callArgs);

    // Verify categories are included in the prompt
    expect(promptContent).toContain("Groceries");
    expect(promptContent).toContain("Entertainment");
  });

  it("falls back to 'Uncategorized' when AI misses a transaction", async () => {
    // AI only classifies 2 out of 4 transactions
    mockInvoke.mockImplementation(() =>
      Promise.resolve({
        content: JSON.stringify({
          classifications: [
            {
              description: "WALMART SUPERCENTER #1234",
              ai_category: "Groceries",
            },
            {
              description: "SHELL GAS STATION",
              ai_category: "Transportation",
            },
          ],
        }),
      })
    );

    const result = await classifyTransactions(
      SAMPLE_TRANSACTIONS,
      USER_CATEGORIES
    );

    expect(result).toHaveLength(4);
    expect(result[0].ai_category).toBe("Groceries");
    expect(result[1].ai_category).toBe("Transportation");
    // Missing transactions should default to "Uncategorized"
    expect(result[2].ai_category).toBe("Uncategorized");
    expect(result[3].ai_category).toBe("Uncategorized");
  });
});
