import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { ServiceContext } from "../context";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-123";
const TEST_EMAIL = "test@example.com";
const TEST_HOUSEHOLD_ID = "11111111-1111-1111-1111-111111111111";

const debtEntry = {
  id: "debt-1",
  user_id: TEST_USER_ID,
  entity_type: "user",
  entity_id: TEST_USER_ID,
  name: "Credit Card",
  debt_type: "credit_card",
  original_balance: 5000,
  current_balance: 3000,
  interest_rate: 18.99,
  minimum_payment: 100,
  due_date_day: 15,
  linked_category_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const debtList = [
  debtEntry,
  {
    ...debtEntry,
    id: "debt-2",
    name: "Student Loan",
    debt_type: "student_loan",
    original_balance: 20000,
    current_balance: 15000,
    interest_rate: 5.5,
    minimum_payment: 250,
  },
];

// ---------------------------------------------------------------------------
// Mock debt-projection.service
// ---------------------------------------------------------------------------
const mockProjectSingleDebt = mock((debt: any) => ({
  debt_id: debt.id,
  debt_name: debt.name,
  current_balance: debt.current_balance,
  interest_rate: debt.interest_rate,
  minimum_payment: debt.minimum_payment,
  months_to_payoff: 36,
  total_interest: 1200,
  payoff_date: "2029-03-01",
}));

const mockCalculatePayoffStrategy = mock(
  (debts: any[], extraPayment: number, strategy: string) => ({
    strategy,
    debts: debts.map((d: any) => ({
      debt_id: d.id,
      debt_name: d.name,
      current_balance: d.current_balance,
      interest_rate: d.interest_rate,
      minimum_payment: d.minimum_payment,
      months_to_payoff: 30,
      total_interest: 900,
      payoff_date: "2028-09-01",
    })),
    total_months: 30,
    total_interest: 2100,
  })
);

mock.module("../debt-projection.service", () => ({
  projectSingleDebt: mockProjectSingleDebt,
  calculatePayoffStrategy: mockCalculatePayoffStrategy,
}));

// ---------------------------------------------------------------------------
// Chainable mock builder
// ---------------------------------------------------------------------------

// -- debts table: list --
const mockDebtsOrder = mock(() =>
  Promise.resolve({ data: debtList, error: null })
);

// -- debts table: single (access check) --
const mockDebtAccessSingle = mock(() =>
  Promise.resolve({
    data: { entity_type: "user", entity_id: TEST_USER_ID },
    error: null,
  })
);

// -- debts table: insert --
const mockInsertSingle = mock(() =>
  Promise.resolve({ data: debtEntry, error: null })
);
const mockInsert = mock(() => ({
  select: () => ({ single: mockInsertSingle }),
}));

// -- debts table: update --
const mockUpdateSingle = mock(() =>
  Promise.resolve({ data: debtEntry, error: null })
);
const mockUpdate = mock(() => ({
  eq: () => ({ select: () => ({ single: mockUpdateSingle }) }),
}));

// -- debts table: delete --
const mockDeleteResult = mock(() =>
  Promise.resolve({ data: null, error: null })
);
const mockDelete = mock(() => ({
  eq: mockDeleteResult,
}));

// -- projections: debts with balance > 0 --
const mockProjectionDebts = [
  {
    id: "debt-1",
    name: "Credit Card",
    current_balance: 3000,
    interest_rate: 18.99,
    minimum_payment: 100,
  },
  {
    id: "debt-2",
    name: "Student Loan",
    current_balance: 15000,
    interest_rate: 5.5,
    minimum_payment: 250,
  },
];
const mockDebtsProjectionOrder = mock(() =>
  Promise.resolve({ data: mockProjectionDebts, error: null })
);

// -- profiles table --
const mockProfileSingle = mock(() =>
  Promise.resolve({ data: { household_id: TEST_HOUSEHOLD_ID }, error: null })
);

// ---------------------------------------------------------------------------
// from() dispatcher
// ---------------------------------------------------------------------------
const mockFrom = mock((table: string) => {
  if (table === "debts") {
    return {
      select: (cols?: string) => {
        if (cols === "entity_type, entity_id") {
          // checkDebtAccess path
          return {
            eq: () => ({ single: mockDebtAccessSingle }),
          };
        }
        // select("*") — list, projections, or full access check
        return {
          eq: (col: string, val: string) => {
            if (col === "id") {
              // Full record access check: .select("*").eq("id",...).single()
              return { single: mockDebtAccessSingle };
            }
            if (col === "entity_type") {
              // List or projections
              return {
                eq: (_col2: string, _val2: string) => ({
                  order: mockDebtsOrder,
                  gt: (_gtCol: string, _gtVal: number) => ({
                    order: mockDebtsProjectionOrder,
                  }),
                }),
              };
            }
            return {};
          },
        };
      },
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
    };
  }

  if (table === "profiles") {
    return {
      select: () => ({
        eq: () => ({
          single: mockProfileSingle,
        }),
      }),
    };
  }

  return {
    select: () => ({
      eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
    }),
  };
});

const mockSupabase = { from: mockFrom } as any;
const mockSupabaseAdmin = { from: mock(() => ({})) } as any;

const ctx: ServiceContext = {
  supabase: mockSupabase,
  supabaseAdmin: mockSupabaseAdmin,
  userId: TEST_USER_ID,
  email: TEST_EMAIL,
};

// ---------------------------------------------------------------------------
// Reset mocks
// ---------------------------------------------------------------------------
beforeEach(() => {
  mockDebtsOrder.mockClear();
  mockDebtAccessSingle.mockClear();
  mockInsertSingle.mockClear();
  mockInsert.mockClear();
  mockUpdateSingle.mockClear();
  mockUpdate.mockClear();
  mockDeleteResult.mockClear();
  mockDelete.mockClear();
  mockDebtsProjectionOrder.mockClear();
  mockProfileSingle.mockClear();
  mockFrom.mockClear();
  mockProjectSingleDebt.mockClear();
  mockCalculatePayoffStrategy.mockClear();

  // Reset defaults
  mockDebtsOrder.mockImplementation(() =>
    Promise.resolve({ data: debtList, error: null })
  );
  mockDebtAccessSingle.mockImplementation(() =>
    Promise.resolve({
      data: { entity_type: "user", entity_id: TEST_USER_ID },
      error: null,
    })
  );
  mockInsertSingle.mockImplementation(() =>
    Promise.resolve({ data: debtEntry, error: null })
  );
  mockUpdateSingle.mockImplementation(() =>
    Promise.resolve({ data: debtEntry, error: null })
  );
  mockDeleteResult.mockImplementation(() =>
    Promise.resolve({ data: null, error: null })
  );
  mockProfileSingle.mockImplementation(() =>
    Promise.resolve({ data: { household_id: TEST_HOUSEHOLD_ID }, error: null })
  );
  mockDebtsProjectionOrder.mockImplementation(() =>
    Promise.resolve({ data: mockProjectionDebts, error: null })
  );

  mockProjectSingleDebt.mockImplementation((debt: any) => ({
    debt_id: debt.id,
    debt_name: debt.name,
    current_balance: debt.current_balance,
    interest_rate: debt.interest_rate,
    minimum_payment: debt.minimum_payment,
    months_to_payoff: 36,
    total_interest: 1200,
    payoff_date: "2029-03-01",
  }));

  mockCalculatePayoffStrategy.mockImplementation(
    (debts: any[], extraPayment: number, strategy: string) => ({
      strategy,
      debts: debts.map((d: any) => ({
        debt_id: d.id,
        debt_name: d.name,
        current_balance: d.current_balance,
        interest_rate: d.interest_rate,
        minimum_payment: d.minimum_payment,
        months_to_payoff: 30,
        total_interest: 900,
        payoff_date: "2028-09-01",
      })),
      total_months: 30,
      total_interest: 2100,
    })
  );
});

// ---------------------------------------------------------------------------
// Import service
// ---------------------------------------------------------------------------
const {
  listDebts,
  createDebt,
  updateDebt,
  deleteDebt,
  getDebtProjections,
} = await import("../debt.service");

// ===========================================================================
// listDebts
// ===========================================================================
describe("listDebts", () => {
  it("returns debts for the user", async () => {
    const { data, error } = await listDebts(ctx);

    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data![0].name).toBe("Credit Card");
    expect(mockFrom).toHaveBeenCalledWith("debts");
  });

  it("returns debts for household entity", async () => {
    const { data, error } = await listDebts(ctx, "household");

    expect(error).toBeNull();
    expect(mockFrom).toHaveBeenCalledWith("profiles");
    expect(mockFrom).toHaveBeenCalledWith("debts");
  });

  it("returns error when household not found", async () => {
    mockProfileSingle.mockImplementation(() =>
      Promise.resolve({ data: { household_id: null }, error: null })
    );

    const { data, error } = await listDebts(ctx, "household");

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });

  it("returns error on database failure", async () => {
    mockDebtsOrder.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "DB error" } })
    );

    const { data, error } = await listDebts(ctx);

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });
});

// ===========================================================================
// createDebt
// ===========================================================================
describe("createDebt", () => {
  const validInput = {
    name: "Credit Card",
    debt_type: "credit_card" as const,
    original_balance: 5000,
    current_balance: 3000,
  };

  it("creates and returns a debt", async () => {
    const { data, error } = await createDebt(ctx, validInput);

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.id).toBe("debt-1");
    expect(mockFrom).toHaveBeenCalledWith("debts");
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("returns error when household not found", async () => {
    mockProfileSingle.mockImplementation(() =>
      Promise.resolve({ data: { household_id: null }, error: null })
    );

    const { data, error } = await createDebt(ctx, {
      ...validInput,
      entity_type: "household",
    });

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });

  it("returns error on database failure", async () => {
    mockInsertSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "Insert failed" } })
    );

    const { data, error } = await createDebt(ctx, validInput);

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });
});

// ===========================================================================
// updateDebt
// ===========================================================================
describe("updateDebt", () => {
  it("updates and returns the debt", async () => {
    const updatedDebt = { ...debtEntry, name: "Updated" };
    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: updatedDebt, error: null })
    );

    const { data, error } = await updateDebt(ctx, "debt-1", { name: "Updated" });

    expect(error).toBeNull();
    expect(data!.name).toBe("Updated");
    expect(mockFrom).toHaveBeenCalledWith("debts");
  });

  it("returns error when debt not found", async () => {
    mockDebtAccessSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: null })
    );

    const { data, error } = await updateDebt(ctx, "debt-nonexistent", {
      name: "X",
    });

    expect(data).toBeNull();
    expect(error).toBeDefined();
    expect(error!.message).toContain("not found");
  });

  it("returns error when user has no access", async () => {
    mockDebtAccessSingle.mockImplementation(() =>
      Promise.resolve({
        data: { entity_type: "user", entity_id: "other-user" },
        error: null,
      })
    );

    const { data, error } = await updateDebt(ctx, "debt-1", { name: "Forbidden" });

    expect(data).toBeNull();
    expect(error).toBeDefined();
    expect(error!.message).toContain("denied");
  });

  it("returns error when user not in household", async () => {
    mockDebtAccessSingle.mockImplementation(() =>
      Promise.resolve({
        data: { entity_type: "household", entity_id: "other-household" },
        error: null,
      })
    );
    mockProfileSingle.mockImplementation(() =>
      Promise.resolve({ data: { household_id: TEST_HOUSEHOLD_ID }, error: null })
    );

    const { data, error } = await updateDebt(ctx, "debt-1", { name: "No" });

    expect(data).toBeNull();
    expect(error).toBeDefined();
    expect(error!.message).toContain("denied");
  });
});

// ===========================================================================
// deleteDebt
// ===========================================================================
describe("deleteDebt", () => {
  it("deletes the debt and returns no error", async () => {
    const { error } = await deleteDebt(ctx, "debt-1");

    expect(error).toBeNull();
    expect(mockFrom).toHaveBeenCalledWith("debts");
  });

  it("returns error when debt not found", async () => {
    mockDebtAccessSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: null })
    );

    const { error } = await deleteDebt(ctx, "debt-nonexistent");

    expect(error).toBeDefined();
    expect(error!.message).toContain("not found");
  });

  it("returns error when user has no access", async () => {
    mockDebtAccessSingle.mockImplementation(() =>
      Promise.resolve({
        data: { entity_type: "user", entity_id: "other-user" },
        error: null,
      })
    );

    const { error } = await deleteDebt(ctx, "debt-1");

    expect(error).toBeDefined();
    expect(error!.message).toContain("denied");
  });

  it("returns error on database failure", async () => {
    mockDeleteResult.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "DB error" } })
    );

    const { error } = await deleteDebt(ctx, "debt-1");

    expect(error).toBeDefined();
  });
});

// ===========================================================================
// getDebtProjections
// ===========================================================================
describe("getDebtProjections", () => {
  it("returns individual and strategy projections", async () => {
    const { data, error } = await getDebtProjections(ctx);

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.individual).toHaveLength(2);
    expect(data!.avalanche).toBeDefined();
    expect(data!.avalanche.strategy).toBe("avalanche");
    expect(data!.snowball).toBeDefined();
    expect(data!.snowball.strategy).toBe("snowball");
    expect(mockProjectSingleDebt).toHaveBeenCalledTimes(2);
    expect(mockCalculatePayoffStrategy).toHaveBeenCalledTimes(2);
  });

  it("passes extra_payment to strategy calculations", async () => {
    const { data, error } = await getDebtProjections(ctx, undefined, 200);

    expect(error).toBeNull();
    expect(mockCalculatePayoffStrategy).toHaveBeenCalledTimes(2);
    // Verify extra payment was passed
    const firstCall = mockCalculatePayoffStrategy.mock.calls[0];
    expect(firstCall[1]).toBe(200);
  });

  it("returns error when household not found", async () => {
    mockProfileSingle.mockImplementation(() =>
      Promise.resolve({ data: { household_id: null }, error: null })
    );

    const { data, error } = await getDebtProjections(ctx, "household");

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });

  it("returns error on database failure", async () => {
    mockDebtsProjectionOrder.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "DB error" } })
    );

    const { data, error } = await getDebtProjections(ctx);

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });
});
