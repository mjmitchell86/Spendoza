import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { ServiceContext } from "../context";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-123";
const TEST_EMAIL = "test@example.com";

const transactionRecord = {
  id: "txn-1",
  bank_statement_id: "stmt-1",
  user_id: TEST_USER_ID,
  attributed_to_user_id: null,
  date: "2026-01-15",
  description: "Grocery store",
  amount: 52.43,
  type: "debit",
  ai_category: null,
  matched_expense_id: null,
  matched_income_id: null,
  created_at: "2026-01-15T00:00:00Z",
};

const transactionsList = [
  transactionRecord,
  {
    ...transactionRecord,
    id: "txn-2",
    description: "Salary deposit",
    amount: 3000.0,
    type: "credit",
    date: "2026-01-10",
  },
];

// ---------------------------------------------------------------------------
// Chainable mock builder
// ---------------------------------------------------------------------------

// listTransactions: .from("transactions").select("*").eq("user_id",...)[filters...].order("date",...)
const mockOrder = mock(() => Promise.resolve({ data: transactionsList, error: null }));

const mockFilterChain: Record<string, any> = {};
mockFilterChain.eq = mock(() => mockFilterChain);
mockFilterChain.gte = mock(() => mockFilterChain);
mockFilterChain.lte = mock(() => mockFilterChain);
mockFilterChain.order = mockOrder;

// updateTransaction: .from("transactions").update({...}).eq("id",...).eq("user_id",...).select().single()
const mockUpdateSingle = mock(() => Promise.resolve({ data: transactionRecord, error: null }));
const mockUpdate = mock(() => ({
  eq: () => ({ eq: () => ({ select: () => ({ single: mockUpdateSingle }) }) }),
}));

const mockSelect = mock((_cols?: string) => ({
  eq: () => mockFilterChain,
}));

const mockFrom = mock((_table: string) => ({
  select: mockSelect,
  update: mockUpdate,
}));

const mockSupabase = { from: mockFrom } as any;
const mockSupabaseAdmin = { from: mock() } as any;

const ctx: ServiceContext = {
  supabase: mockSupabase,
  supabaseAdmin: mockSupabaseAdmin,
  userId: TEST_USER_ID,
  email: TEST_EMAIL,
};

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  mockOrder.mockClear();
  mockFilterChain.eq.mockClear();
  mockFilterChain.gte.mockClear();
  mockFilterChain.lte.mockClear();
  mockUpdateSingle.mockClear();
  mockUpdate.mockClear();
  mockSelect.mockClear();
  mockFrom.mockClear();

  mockOrder.mockImplementation(() => Promise.resolve({ data: transactionsList, error: null }));
  mockFilterChain.eq.mockImplementation(() => mockFilterChain);
  mockFilterChain.gte.mockImplementation(() => mockFilterChain);
  mockFilterChain.lte.mockImplementation(() => mockFilterChain);
  mockUpdateSingle.mockImplementation(() => Promise.resolve({ data: transactionRecord, error: null }));
});

// ---------------------------------------------------------------------------
// Import service
// ---------------------------------------------------------------------------
const { listTransactions, updateTransaction } = await import("../transaction.service");

// ===========================================================================
// listTransactions
// ===========================================================================
describe("listTransactions", () => {
  it("returns all transactions for the user with no filters", async () => {
    const { data, error } = await listTransactions(ctx);

    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data![0].description).toBe("Grocery store");
    expect(data![1].description).toBe("Salary deposit");
    expect(mockFrom).toHaveBeenCalledWith("transactions");
    expect(mockSelect).toHaveBeenCalledWith("*");
    expect(mockOrder).toHaveBeenCalledWith("date", { ascending: false });
  });

  it("applies bank_statement_id filter", async () => {
    mockOrder.mockImplementation(() =>
      Promise.resolve({ data: [transactionRecord], error: null })
    );

    const { data, error } = await listTransactions(ctx, { bank_statement_id: "stmt-1" });

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(mockFilterChain.eq).toHaveBeenCalled();
  });

  it("applies from_date filter", async () => {
    const { data, error } = await listTransactions(ctx, { from_date: "2026-01-01" });

    expect(error).toBeNull();
    expect(mockFilterChain.gte).toHaveBeenCalled();
  });

  it("applies to_date filter", async () => {
    const { data, error } = await listTransactions(ctx, { to_date: "2026-01-31" });

    expect(error).toBeNull();
    expect(mockFilterChain.lte).toHaveBeenCalled();
  });

  it("applies type filter", async () => {
    mockOrder.mockImplementation(() =>
      Promise.resolve({ data: [transactionRecord], error: null })
    );

    const { data, error } = await listTransactions(ctx, { type: "debit" });

    expect(error).toBeNull();
    expect(mockFilterChain.eq).toHaveBeenCalled();
  });

  it("returns error on database failure", async () => {
    mockOrder.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "DB error" } })
    );

    const { data, error } = await listTransactions(ctx);

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });
});

// ===========================================================================
// updateTransaction
// ===========================================================================
describe("updateTransaction", () => {
  it("updates and returns the transaction", async () => {
    const updatedTransaction = { ...transactionRecord, ai_category: "groceries" };
    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: updatedTransaction, error: null })
    );

    const { data, error } = await updateTransaction(ctx, "txn-1", { ai_category: "groceries" });

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.ai_category).toBe("groceries");
    expect(mockFrom).toHaveBeenCalledWith("transactions");
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("returns error when transaction not found", async () => {
    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "Not found", code: "PGRST116" } })
    );

    const { data, error } = await updateTransaction(ctx, "txn-nonexistent", { ai_category: "x" });

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });
});
