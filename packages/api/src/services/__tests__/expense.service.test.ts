import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { ServiceContext } from "../context";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-123";
const TEST_EMAIL = "test@example.com";

const expenseEntry = {
  id: "exp-1",
  user_id: TEST_USER_ID,
  category_id: "cat-1",
  description: "Netflix subscription",
  amount: 15.99,
  frequency: "recurring",
  recurrence_interval: "monthly",
  next_due_date: "2026-02-15",
  end_date: null,
  is_ai_adjusted: false,
  original_amount: null,
  bank_statement_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const expensesList = [
  expenseEntry,
  { ...expenseEntry, id: "exp-2", description: "Gym membership", amount: 49.99 },
];

// ---------------------------------------------------------------------------
// Chainable mock builder
// ---------------------------------------------------------------------------

// listExpenses: .from("expenses").select("*").eq(...)[.eq(...)][.gte(...)][.lte(...)].or(...).order(...)
const mockOrder = mock(() => Promise.resolve({ data: expensesList, error: null }));

const mockFilterChain: Record<string, any> = {};
mockFilterChain.eq = mock(() => mockFilterChain);
mockFilterChain.gte = mock(() => mockFilterChain);
mockFilterChain.lte = mock(() => mockFilterChain);
mockFilterChain.or = mock(() => mockFilterChain);
mockFilterChain.order = mockOrder;

// createExpense: .from("expenses").insert({...}).select().single()
const mockInsertSingle = mock(() => Promise.resolve({ data: expenseEntry, error: null }));
const mockInsert = mock(() => ({ select: () => ({ single: mockInsertSingle }) }));

// updateExpense: .from("expenses").update({...}).eq("id",...).eq("user_id",...).select().single()
const mockUpdateSingle = mock(() => Promise.resolve({ data: expenseEntry, error: null }));
const mockUpdate = mock(() => ({
  eq: () => ({ eq: () => ({ select: () => ({ single: mockUpdateSingle }) }) }),
}));

// deleteExpense: .from("expenses").delete().eq("id",...).eq("user_id",...)
const mockDeleteResult = mock(() => Promise.resolve({ data: null, error: null }));
const mockDelete = mock(() => ({ eq: () => ({ eq: mockDeleteResult }) }));

// SELECT for listExpenses: .select("*").eq("user_id",...) -> filterChain
const mockSelect = mock((_cols?: string) => ({
  eq: () => mockFilterChain,
}));

const mockFrom = mock((_table: string) => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
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
  mockFilterChain.or.mockClear();
  mockInsertSingle.mockClear();
  mockInsert.mockClear();
  mockUpdateSingle.mockClear();
  mockUpdate.mockClear();
  mockDeleteResult.mockClear();
  mockDelete.mockClear();
  mockSelect.mockClear();
  mockFrom.mockClear();

  mockOrder.mockImplementation(() => Promise.resolve({ data: expensesList, error: null }));
  mockFilterChain.eq.mockImplementation(() => mockFilterChain);
  mockFilterChain.gte.mockImplementation(() => mockFilterChain);
  mockFilterChain.lte.mockImplementation(() => mockFilterChain);
  mockFilterChain.or.mockImplementation(() => mockFilterChain);
  mockInsertSingle.mockImplementation(() => Promise.resolve({ data: expenseEntry, error: null }));
  mockUpdateSingle.mockImplementation(() => Promise.resolve({ data: expenseEntry, error: null }));
  mockDeleteResult.mockImplementation(() => Promise.resolve({ data: null, error: null }));
});

// ---------------------------------------------------------------------------
// Import service
// ---------------------------------------------------------------------------
const { listExpenses, createExpense, updateExpense, deleteExpense } = await import(
  "../expense.service"
);

// ===========================================================================
// listExpenses
// ===========================================================================
describe("listExpenses", () => {
  it("returns all expenses for the user with no filters", async () => {
    const { data, error } = await listExpenses(ctx);

    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data![0].description).toBe("Netflix subscription");
    expect(mockFrom).toHaveBeenCalledWith("expenses");
    expect(mockSelect).toHaveBeenCalledWith("*");
    expect(mockFilterChain.or).toHaveBeenCalled();
    expect(mockOrder).toHaveBeenCalled();
  });

  it("applies category_id filter when provided", async () => {
    mockOrder.mockImplementation(() =>
      Promise.resolve({ data: [expenseEntry], error: null })
    );

    const { data, error } = await listExpenses(ctx, { category_id: "cat-1" });

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(mockFilterChain.eq).toHaveBeenCalled();
  });

  it("applies frequency filter when provided", async () => {
    const { data, error } = await listExpenses(ctx, { frequency: "recurring" });

    expect(error).toBeNull();
    expect(mockFilterChain.eq).toHaveBeenCalled();
  });

  it("applies from_date filter when provided", async () => {
    const { data, error } = await listExpenses(ctx, { from_date: "2026-01-01" });

    expect(error).toBeNull();
    expect(mockFilterChain.gte).toHaveBeenCalled();
  });

  it("applies to_date filter when provided", async () => {
    const { data, error } = await listExpenses(ctx, { to_date: "2026-12-31" });

    expect(error).toBeNull();
    expect(mockFilterChain.lte).toHaveBeenCalled();
  });

  it("returns error on database failure", async () => {
    mockOrder.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "DB error" } })
    );

    const { data, error } = await listExpenses(ctx);

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });
});

// ===========================================================================
// createExpense
// ===========================================================================
describe("createExpense", () => {
  const validInput = {
    category_id: "b1c2d3e4-f5a6-7890-abcd-ef1234567890",
    description: "Netflix subscription",
    amount: 15.99,
    frequency: "recurring" as const,
    next_due_date: "2026-02-15",
  };

  it("creates and returns an expense", async () => {
    const { data, error } = await createExpense(ctx, validInput);

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.id).toBe("exp-1");
    expect(mockFrom).toHaveBeenCalledWith("expenses");
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("returns error on database failure", async () => {
    mockInsertSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "DB error" } })
    );

    const { data, error } = await createExpense(ctx, validInput);

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });
});

// ===========================================================================
// updateExpense
// ===========================================================================
describe("updateExpense", () => {
  it("updates and returns the expense", async () => {
    const updatedExpense = { ...expenseEntry, amount: 12.99 };
    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: updatedExpense, error: null })
    );

    const { data, error } = await updateExpense(ctx, "exp-1", { amount: 12.99 });

    expect(error).toBeNull();
    expect(data!.amount).toBe(12.99);
    expect(mockFrom).toHaveBeenCalledWith("expenses");
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("returns error when expense not found", async () => {
    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "Not found", code: "PGRST116" } })
    );

    const { data, error } = await updateExpense(ctx, "exp-nonexistent", { amount: 1 });

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });
});

// ===========================================================================
// deleteExpense
// ===========================================================================
describe("deleteExpense", () => {
  it("deletes the expense and returns no error", async () => {
    const { error } = await deleteExpense(ctx, "exp-1");

    expect(error).toBeNull();
    expect(mockFrom).toHaveBeenCalledWith("expenses");
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("returns error on database failure", async () => {
    mockDeleteResult.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "DB error" } })
    );

    const { error } = await deleteExpense(ctx, "exp-1");

    expect(error).toBeDefined();
  });
});
