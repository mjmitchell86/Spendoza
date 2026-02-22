import { describe, it, expect } from "bun:test";
import type { ClassifiedTransaction } from "../transaction-classifier";

// Import module under test — expense-matcher is purely deterministic, no mocks needed
const { matchTransactions, similarity } = await import("../expense-matcher");

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const existingExpenses = [
  {
    id: "exp-1",
    description: "Walmart groceries",
    amount: 50.0,
    category_id: "cat-groceries",
  },
  {
    id: "exp-2",
    description: "Netflix subscription",
    amount: 15.99,
    category_id: "cat-entertainment",
  },
  {
    id: "exp-3",
    description: "Shell gas",
    amount: 40.0,
    category_id: "cat-transport",
  },
  {
    id: "exp-4",
    description: "Electric bill",
    amount: 120.0,
    category_id: "cat-utilities",
  },
];

const existingIncome = [
  { id: "inc-1", source_name: "Payroll deposit", amount: 2500.0 },
  { id: "inc-2", source_name: "Freelance payment", amount: 800.0 },
];

// ---------------------------------------------------------------------------
// Tests — String similarity helper
// ---------------------------------------------------------------------------
describe("similarity", () => {
  it("returns 1.0 for identical strings", () => {
    expect(similarity("hello", "hello")).toBe(1);
  });

  it("returns 1.0 for case-insensitive matches", () => {
    expect(similarity("Hello World", "hello world")).toBe(1);
  });

  it("returns high score for substring match", () => {
    const score = similarity(
      "WALMART SUPERCENTER #1234",
      "Walmart groceries"
    );
    expect(score).toBeGreaterThan(0);
  });

  it("returns 0 for completely different strings", () => {
    const score = similarity("apple", "xyz");
    expect(score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests — matchTransactions
// ---------------------------------------------------------------------------
describe("matchTransactions", () => {
  it("matches debit transactions to existing expenses by description and amount", async () => {
    const transactions: ClassifiedTransaction[] = [
      {
        date: "2026-01-05",
        description: "WALMART SUPERCENTER #1234",
        amount: 52.43,
        type: "debit",
        ai_category: "Groceries",
      },
    ];

    const result = await matchTransactions(
      transactions,
      existingExpenses,
      existingIncome
    );

    expect(result).toHaveLength(1);
    // Should match to exp-1 (Walmart groceries, $50 — within 20% of $52.43)
    expect(result[0].matched_expense_id).toBe("exp-1");
    expect(result[0].matched_income_id).toBeNull();
  });

  it("matches credit transactions to existing income", async () => {
    const transactions: ClassifiedTransaction[] = [
      {
        date: "2026-01-15",
        description: "PAYROLL DEPOSIT",
        amount: 2500.0,
        type: "credit",
        ai_category: "Income",
      },
    ];

    const result = await matchTransactions(
      transactions,
      existingExpenses,
      existingIncome
    );

    expect(result).toHaveLength(1);
    expect(result[0].matched_income_id).toBe("inc-1");
    expect(result[0].matched_expense_id).toBeNull();
  });

  it("returns null IDs when no match is found", async () => {
    const transactions: ClassifiedTransaction[] = [
      {
        date: "2026-01-20",
        description: "RANDOM UNKNOWN STORE XYZ",
        amount: 999.99,
        type: "debit",
        ai_category: "Other",
      },
    ];

    const result = await matchTransactions(
      transactions,
      existingExpenses,
      existingIncome
    );

    expect(result).toHaveLength(1);
    expect(result[0].matched_expense_id).toBeNull();
    expect(result[0].matched_income_id).toBeNull();
  });

  it("does not match when amount difference exceeds 20%", async () => {
    const transactions: ClassifiedTransaction[] = [
      {
        date: "2026-01-05",
        description: "WALMART SUPERCENTER",
        amount: 200.0, // Way over 20% from $50
        type: "debit",
        ai_category: "Groceries",
      },
    ];

    const result = await matchTransactions(
      transactions,
      existingExpenses,
      existingIncome
    );

    expect(result[0].matched_expense_id).toBeNull();
  });

  it("matches Netflix subscription exactly", async () => {
    const transactions: ClassifiedTransaction[] = [
      {
        date: "2026-01-20",
        description: "NETFLIX SUBSCRIPTION",
        amount: 15.99,
        type: "debit",
        ai_category: "Entertainment",
      },
    ];

    const result = await matchTransactions(
      transactions,
      existingExpenses,
      existingIncome
    );

    expect(result[0].matched_expense_id).toBe("exp-2");
  });

  it("handles empty transactions array", async () => {
    const result = await matchTransactions([], existingExpenses, existingIncome);
    expect(result).toEqual([]);
  });

  it("handles empty expenses and income arrays", async () => {
    const transactions: ClassifiedTransaction[] = [
      {
        date: "2026-01-05",
        description: "WALMART",
        amount: 52.43,
        type: "debit",
        ai_category: "Groceries",
      },
    ];

    const result = await matchTransactions(transactions, [], []);

    expect(result).toHaveLength(1);
    expect(result[0].matched_expense_id).toBeNull();
    expect(result[0].matched_income_id).toBeNull();
  });

  it("preserves all original transaction fields", async () => {
    const transactions: ClassifiedTransaction[] = [
      {
        date: "2026-01-05",
        description: "WALMART SUPERCENTER #1234",
        amount: 52.43,
        type: "debit",
        ai_category: "Groceries",
      },
    ];

    const result = await matchTransactions(
      transactions,
      existingExpenses,
      existingIncome
    );

    expect(result[0].date).toBe("2026-01-05");
    expect(result[0].description).toBe("WALMART SUPERCENTER #1234");
    expect(result[0].amount).toBe(52.43);
    expect(result[0].type).toBe("debit");
    expect(result[0].ai_category).toBe("Groceries");
    // Plus matched fields
    expect(result[0]).toHaveProperty("matched_expense_id");
    expect(result[0]).toHaveProperty("matched_income_id");
  });
});
