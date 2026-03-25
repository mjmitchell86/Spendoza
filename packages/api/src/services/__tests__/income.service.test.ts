import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { ServiceContext } from "../context";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-123";
const TEST_EMAIL = "test@example.com";

const incomeEntry = {
  id: "inc-1",
  user_id: TEST_USER_ID,
  attributed_to_user_id: null,
  source_name: "Salary",
  amount: 5000,
  frequency: "monthly",
  effective_date: "2026-01-01",
  end_date: null,
  is_ai_suggested: false,
  bank_statement_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const incomeList = [
  incomeEntry,
  { ...incomeEntry, id: "inc-2", source_name: "Freelance", amount: 1500 },
];

// ---------------------------------------------------------------------------
// Chainable mock builder
// ---------------------------------------------------------------------------

// listIncome: .from("income_entries").select("*").or(...).order(...)
const mockOrder = mock(() => Promise.resolve({ data: incomeList, error: null }));
const mockOr = mock(() => ({ order: mockOrder }));

// createIncome insert: .from("income_entries").insert({...}).select().single()
const mockInsertSingle = mock(() => Promise.resolve({ data: incomeEntry, error: null }));
const mockInsert = mock(() => ({ select: () => ({ single: mockInsertSingle }) }));

// updateIncome: .from("income_entries").update({...}).eq("id",...).eq("user_id",...).select().single()
const mockUpdateSingle = mock(() => Promise.resolve({ data: incomeEntry, error: null }));
const mockUpdate = mock(() => ({
  eq: () => ({ eq: () => ({ select: () => ({ single: mockUpdateSingle }) }) }),
}));

// deleteIncome: .from("income_entries").delete().eq("id",...).eq("user_id",...)
const mockDeleteResult = mock(() => Promise.resolve({ data: null, error: null }));
const mockDelete = mock(() => ({ eq: () => ({ eq: mockDeleteResult }) }));

// SELECT used by listIncome (.select("*").or(...)) and household check (.select("household_id").eq(...).single())
const mockSelectSingle = mock(() =>
  Promise.resolve({ data: { household_id: "hh-1" }, error: null })
);
const mockSelect = mock((_cols?: string) => ({
  or: mockOr,
  eq: () => ({ single: mockSelectSingle, eq: () => ({ single: mockSelectSingle }) }),
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
  mockOr.mockClear();
  mockInsertSingle.mockClear();
  mockInsert.mockClear();
  mockUpdateSingle.mockClear();
  mockUpdate.mockClear();
  mockDeleteResult.mockClear();
  mockDelete.mockClear();
  mockSelectSingle.mockClear();
  mockSelect.mockClear();
  mockFrom.mockClear();

  mockOrder.mockImplementation(() => Promise.resolve({ data: incomeList, error: null }));
  mockOr.mockImplementation(() => ({ order: mockOrder }));
  mockInsertSingle.mockImplementation(() => Promise.resolve({ data: incomeEntry, error: null }));
  mockUpdateSingle.mockImplementation(() => Promise.resolve({ data: incomeEntry, error: null }));
  mockSelectSingle.mockImplementation(() =>
    Promise.resolve({ data: { household_id: "hh-1" }, error: null })
  );
  mockDeleteResult.mockImplementation(() => Promise.resolve({ data: null, error: null }));
});

// ---------------------------------------------------------------------------
// Import service (dynamic to allow mock.module to be registered first if needed)
// ---------------------------------------------------------------------------
const { listIncome, createIncome, updateIncome, deleteIncome } = await import("../income.service");

// ===========================================================================
// listIncome
// ===========================================================================
describe("listIncome", () => {
  it("returns income entries for the user", async () => {
    const { data, error } = await listIncome(ctx);

    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data![0].source_name).toBe("Salary");
    expect(mockFrom).toHaveBeenCalledWith("income_entries");
    expect(mockSelect).toHaveBeenCalledWith("*");
    expect(mockOr).toHaveBeenCalled();
    expect(mockOrder).toHaveBeenCalled();
  });

  it("returns error on database failure", async () => {
    mockOrder.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "DB error" } })
    );

    const { data, error } = await listIncome(ctx);

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });
});

// ===========================================================================
// createIncome
// ===========================================================================
describe("createIncome", () => {
  const validInput = {
    source_name: "Salary",
    amount: 5000,
    frequency: "monthly" as const,
    effective_date: "2026-01-01",
  };

  it("creates and returns an income entry", async () => {
    const { data, error } = await createIncome(ctx, validInput);

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.id).toBe("inc-1");
    expect(mockFrom).toHaveBeenCalledWith("income_entries");
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("validates household membership when attributed_to_user_id provided and same household", async () => {
    const inputWithAttribution = {
      ...validInput,
      attributed_to_user_id: "user-456",
    };

    mockSelectSingle.mockImplementation(() =>
      Promise.resolve({ data: { household_id: "hh-1" }, error: null })
    );

    const { data, error } = await createIncome(ctx, inputWithAttribution);

    expect(error).toBeNull();
    expect(data).toBeDefined();
  });

  it("rejects when attributed user is in a different household", async () => {
    const inputWithAttribution = {
      ...validInput,
      attributed_to_user_id: "user-456",
    };

    let callCount = 0;
    mockSelectSingle.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ data: { household_id: "hh-1" }, error: null });
      }
      return Promise.resolve({ data: { household_id: "hh-different" }, error: null });
    });

    const { data, error } = await createIncome(ctx, inputWithAttribution);

    expect(data).toBeNull();
    expect(error).toBeDefined();
    expect((error as any).message).toContain("household");
  });

  it("rejects when current user has no household", async () => {
    const inputWithAttribution = {
      ...validInput,
      attributed_to_user_id: "user-456",
    };

    mockSelectSingle.mockImplementation(() =>
      Promise.resolve({ data: { household_id: null }, error: null })
    );

    const { data, error } = await createIncome(ctx, inputWithAttribution);

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });
});

// ===========================================================================
// updateIncome
// ===========================================================================
describe("updateIncome", () => {
  it("updates and returns the income entry", async () => {
    const updatedEntry = { ...incomeEntry, amount: 6000 };
    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: updatedEntry, error: null })
    );

    const { data, error } = await updateIncome(ctx, "inc-1", { amount: 6000 });

    expect(error).toBeNull();
    expect(data!.amount).toBe(6000);
    expect(mockFrom).toHaveBeenCalledWith("income_entries");
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("returns error when entry not found", async () => {
    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "Not found", code: "PGRST116" } })
    );

    const { data, error } = await updateIncome(ctx, "inc-nonexistent", { amount: 1 });

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });
});

// ===========================================================================
// deleteIncome
// ===========================================================================
describe("deleteIncome", () => {
  it("deletes the income entry and returns no error", async () => {
    const { error } = await deleteIncome(ctx, "inc-1");

    expect(error).toBeNull();
    expect(mockFrom).toHaveBeenCalledWith("income_entries");
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("returns error on database failure", async () => {
    mockDeleteResult.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "DB error" } })
    );

    const { error } = await deleteIncome(ctx, "inc-1");

    expect(error).toBeDefined();
  });
});
