import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { ServiceContext } from "../context";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-123";
const TEST_EMAIL = "test@example.com";
const TEST_HOUSEHOLD_ID = "11111111-1111-1111-1111-111111111111";

const goalEntry = {
  id: "goal-1",
  user_id: TEST_USER_ID,
  entity_type: "user",
  entity_id: TEST_USER_ID,
  name: "Save for Vacation",
  goal_type: "target_savings",
  category_id: null,
  debt_id: null,
  target_amount: 5000,
  target_date: null,
  current_amount: 1000,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const goalList = [
  goalEntry,
  {
    ...goalEntry,
    id: "goal-2",
    name: "Budget Groceries",
    goal_type: "budget",
    category_id: "cat-1",
    target_amount: 400,
    current_amount: 0,
  },
];

const sampleReport = {
  report_month: "2026-03-01",
  report_data: {
    total_income: 6000,
    total_expenses: 4000,
    savings_rate: 33.3,
    expense_to_income_ratio: 0.67,
    by_category: [
      { category: "Groceries", amount: 500, percentage: 12.5 },
      { category: "Rent", amount: 1500, percentage: 37.5 },
    ],
    top_categories: ["Rent", "Groceries"],
    month_over_month: null,
  },
};

// ---------------------------------------------------------------------------
// Mock generateGoalSuggestions
// ---------------------------------------------------------------------------
const mockGenerateGoalSuggestions = mock(() =>
  Promise.resolve([
    {
      name: "Emergency Fund",
      goal_type: "emergency_fund",
      category: null,
      target_amount: 12000,
      rationale: "Build a 3-month emergency fund.",
    },
  ])
);

mock.module("../../ai/goal-suggestions", () => ({
  generateGoalSuggestions: mockGenerateGoalSuggestions,
}));

// ---------------------------------------------------------------------------
// Chainable mock builder
// ---------------------------------------------------------------------------

// --- goals table ---
const mockGoalsOrder = mock(() =>
  Promise.resolve({ data: goalList, error: null })
);

const mockGoalsSingle = mock(() =>
  Promise.resolve({
    data: { entity_type: "user", entity_id: TEST_USER_ID },
    error: null,
  })
);

const mockInsertSingle = mock(() =>
  Promise.resolve({ data: goalEntry, error: null })
);
const mockInsert = mock(() => ({
  select: () => ({ single: mockInsertSingle }),
}));

const mockUpdateSingle = mock(() =>
  Promise.resolve({ data: goalEntry, error: null })
);
const mockUpdate = mock(() => ({
  eq: () => ({ select: () => ({ single: mockUpdateSingle }) }),
}));

const mockDeleteResult = mock(() =>
  Promise.resolve({ data: null, error: null })
);
const mockDelete = mock(() => ({
  eq: mockDeleteResult,
}));

// --- profiles table ---
const mockProfileSingle = mock(() =>
  Promise.resolve({ data: { household_id: TEST_HOUSEHOLD_ID }, error: null })
);

// --- reports table ---
const mockReportSingle = mock(() =>
  Promise.resolve({ data: sampleReport, error: null })
);

const mockReportsInOrder = mock(() =>
  Promise.resolve({
    data: [sampleReport],
    error: null,
  })
);

// --- debts table ---
const mockDebtSingle = mock(() =>
  Promise.resolve({
    data: { original_balance: 10000, current_balance: 7000 },
    error: null,
  })
);

// --- supabaseAdmin for caching ---
const mockAdminUpdateEq = mock(() => Promise.resolve({ error: null }));
const mockAdminUpdate = mock(() => ({
  eq: () => ({ eq: () => ({ eq: mockAdminUpdateEq }) }),
}));
const mockAdminFrom = mock(() => ({
  update: mockAdminUpdate,
}));

// ---------------------------------------------------------------------------
// from() dispatcher
// ---------------------------------------------------------------------------
const mockFrom = mock((table: string) => {
  if (table === "goals") {
    return {
      select: (cols?: string) => {
        if (cols === "entity_type, entity_id") {
          return { eq: () => ({ single: mockGoalsSingle }) };
        }
        if (cols === "name, goal_type") {
          return {
            eq: () => ({
              eq: () =>
                Promise.resolve({
                  data: [{ name: "Save for Vacation", goal_type: "target_savings" }],
                  error: null,
                }),
            }),
          };
        }
        if (cols === "*, categories(name)") {
          return {
            eq: () => ({
              eq: () => ({
                order: () =>
                  Promise.resolve({
                    data: [
                      {
                        ...goalEntry,
                        goal_type: "savings_amount",
                        categories: null,
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          };
        }
        // select("*") for listGoals
        return {
          eq: () => ({
            eq: () => ({
              order: mockGoalsOrder,
            }),
          }),
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

  if (table === "reports") {
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                single: mockReportSingle,
              }),
            }),
            in: () => ({
              order: mockReportsInOrder,
            }),
          }),
        }),
      }),
    };
  }

  if (table === "debts") {
    return {
      select: () => ({
        eq: () => ({
          single: mockDebtSingle,
        }),
      }),
    };
  }

  return {
    select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
  };
});

const mockSupabase = { from: mockFrom } as any;
const mockSupabaseAdmin = { from: mockAdminFrom } as any;

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
  mockGoalsOrder.mockClear();
  mockGoalsSingle.mockClear();
  mockInsertSingle.mockClear();
  mockInsert.mockClear();
  mockUpdateSingle.mockClear();
  mockUpdate.mockClear();
  mockDeleteResult.mockClear();
  mockDelete.mockClear();
  mockProfileSingle.mockClear();
  mockReportSingle.mockClear();
  mockReportsInOrder.mockClear();
  mockDebtSingle.mockClear();
  mockAdminUpdate.mockClear();
  mockAdminUpdateEq.mockClear();
  mockAdminFrom.mockClear();
  mockFrom.mockClear();
  mockGenerateGoalSuggestions.mockClear();

  // Reset defaults
  mockGoalsOrder.mockImplementation(() =>
    Promise.resolve({ data: goalList, error: null })
  );
  mockGoalsSingle.mockImplementation(() =>
    Promise.resolve({
      data: { entity_type: "user", entity_id: TEST_USER_ID },
      error: null,
    })
  );
  mockInsertSingle.mockImplementation(() =>
    Promise.resolve({ data: goalEntry, error: null })
  );
  mockUpdateSingle.mockImplementation(() =>
    Promise.resolve({ data: goalEntry, error: null })
  );
  mockProfileSingle.mockImplementation(() =>
    Promise.resolve({ data: { household_id: TEST_HOUSEHOLD_ID }, error: null })
  );
  mockDeleteResult.mockImplementation(() =>
    Promise.resolve({ data: null, error: null })
  );
  mockReportSingle.mockImplementation(() =>
    Promise.resolve({ data: sampleReport, error: null })
  );
  mockReportsInOrder.mockImplementation(() =>
    Promise.resolve({ data: [sampleReport], error: null })
  );
  mockGenerateGoalSuggestions.mockImplementation(() =>
    Promise.resolve([
      {
        name: "Emergency Fund",
        goal_type: "emergency_fund",
        category: null,
        target_amount: 12000,
        rationale: "Build a 3-month emergency fund.",
      },
    ])
  );
});

// ---------------------------------------------------------------------------
// Import service
// ---------------------------------------------------------------------------
const {
  listGoals,
  getGoalProgress,
  getGoalSuggestions,
  createGoal,
  updateGoal,
  deleteGoal,
} = await import("../goal.service");

// ===========================================================================
// listGoals
// ===========================================================================
describe("listGoals", () => {
  it("returns goals for the user", async () => {
    const { data, error } = await listGoals(ctx);

    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data![0].name).toBe("Save for Vacation");
    expect(mockFrom).toHaveBeenCalledWith("goals");
  });

  it("returns goals for household entity", async () => {
    const { data, error } = await listGoals(ctx, "household");

    expect(error).toBeNull();
    expect(mockFrom).toHaveBeenCalledWith("profiles");
    expect(mockFrom).toHaveBeenCalledWith("goals");
  });

  it("returns error when household not found", async () => {
    mockProfileSingle.mockImplementation(() =>
      Promise.resolve({ data: { household_id: null }, error: null })
    );

    const { data, error } = await listGoals(ctx, "household");

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });

  it("returns error on database failure", async () => {
    mockGoalsOrder.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "DB error" } })
    );

    const { data, error } = await listGoals(ctx);

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });
});

// ===========================================================================
// createGoal
// ===========================================================================
describe("createGoal", () => {
  const validInput = {
    name: "Save for Vacation",
    goal_type: "target_savings" as const,
    target_amount: 5000,
  };

  it("creates and returns a goal", async () => {
    const { data, error } = await createGoal(ctx, validInput);

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.id).toBe("goal-1");
    expect(mockFrom).toHaveBeenCalledWith("goals");
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("creates household goal when user is a member", async () => {
    const input = {
      ...validInput,
      entity_type: "household" as const,
      entity_id: TEST_HOUSEHOLD_ID,
    };

    const { data, error } = await createGoal(ctx, input);

    expect(error).toBeNull();
    expect(data).toBeDefined();
  });

  it("rejects household goal when not a member", async () => {
    mockProfileSingle.mockImplementation(() =>
      Promise.resolve({ data: { household_id: "different-hh" }, error: null })
    );

    const input = {
      ...validInput,
      entity_type: "household" as const,
      entity_id: TEST_HOUSEHOLD_ID,
    };

    const { data, error } = await createGoal(ctx, input);

    expect(data).toBeNull();
    expect(error).toBeDefined();
    expect(error!.message).toContain("household");
  });

  it("returns error on database failure", async () => {
    mockInsertSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "Insert failed" } })
    );

    const { data, error } = await createGoal(ctx, validInput);

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });
});

// ===========================================================================
// updateGoal
// ===========================================================================
describe("updateGoal", () => {
  it("updates and returns the goal", async () => {
    const updatedGoal = { ...goalEntry, name: "Updated" };
    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: updatedGoal, error: null })
    );

    const { data, error } = await updateGoal(ctx, "goal-1", { name: "Updated" });

    expect(error).toBeNull();
    expect(data!.name).toBe("Updated");
    expect(mockFrom).toHaveBeenCalledWith("goals");
  });

  it("returns error when goal not found", async () => {
    mockGoalsSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: null })
    );

    const { data, error } = await updateGoal(ctx, "goal-nonexistent", { name: "X" });

    expect(data).toBeNull();
    expect(error).toBeDefined();
    expect(error!.message).toContain("not found");
  });

  it("returns error when user has no access", async () => {
    mockGoalsSingle.mockImplementation(() =>
      Promise.resolve({
        data: { entity_type: "user", entity_id: "other-user" },
        error: null,
      })
    );

    const { data, error } = await updateGoal(ctx, "goal-1", { name: "Forbidden" });

    expect(data).toBeNull();
    expect(error).toBeDefined();
    expect(error!.message).toContain("orbidden");
  });
});

// ===========================================================================
// deleteGoal
// ===========================================================================
describe("deleteGoal", () => {
  it("deletes the goal and returns no error", async () => {
    const { error } = await deleteGoal(ctx, "goal-1");

    expect(error).toBeNull();
    expect(mockFrom).toHaveBeenCalledWith("goals");
  });

  it("returns error when goal not found", async () => {
    mockGoalsSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: null })
    );

    const { error } = await deleteGoal(ctx, "goal-nonexistent");

    expect(error).toBeDefined();
    expect(error!.message).toContain("not found");
  });

  it("returns error when user has no access", async () => {
    mockGoalsSingle.mockImplementation(() =>
      Promise.resolve({
        data: { entity_type: "user", entity_id: "other-user" },
        error: null,
      })
    );

    const { error } = await deleteGoal(ctx, "goal-1");

    expect(error).toBeDefined();
    expect(error!.message).toContain("orbidden");
  });

  it("returns error on database failure", async () => {
    mockDeleteResult.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "DB error" } })
    );

    const { error } = await deleteGoal(ctx, "goal-1");

    expect(error).toBeDefined();
  });
});

// ===========================================================================
// getGoalSuggestions
// ===========================================================================
describe("getGoalSuggestions", () => {
  it("returns cached suggestions when available", async () => {
    mockReportSingle.mockImplementation(() =>
      Promise.resolve({
        data: {
          report_month: "2026-03-01",
          report_data: {
            ...sampleReport.report_data,
            goal_suggestions: [
              {
                name: "Cached",
                goal_type: "emergency_fund",
                category: null,
                target_amount: 12000,
                rationale: "Cached.",
              },
            ],
          },
        },
        error: null,
      })
    );

    const { data, error } = await getGoalSuggestions(ctx);

    expect(error).toBeNull();
    expect(data!.suggestions).toHaveLength(1);
    expect(data!.suggestions[0].name).toBe("Cached");
    expect(data!.report_month).toBe("2026-03-01");
    expect(mockGenerateGoalSuggestions).not.toHaveBeenCalled();
  });

  it("generates new suggestions when not cached", async () => {
    const { data, error } = await getGoalSuggestions(ctx);

    expect(error).toBeNull();
    expect(data!.suggestions).toHaveLength(1);
    expect(data!.suggestions[0].name).toBe("Emergency Fund");
    expect(mockGenerateGoalSuggestions).toHaveBeenCalledTimes(1);
  });

  it("caches new suggestions via supabaseAdmin", async () => {
    const { data } = await getGoalSuggestions(ctx);

    expect(data!.suggestions).toHaveLength(1);
    expect(mockAdminFrom).toHaveBeenCalledWith("reports");
    expect(mockAdminUpdate).toHaveBeenCalledTimes(1);
  });

  it("returns empty suggestions when no report exists", async () => {
    mockReportSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: null })
    );

    const { data, error } = await getGoalSuggestions(ctx);

    expect(error).toBeNull();
    expect(data!.suggestions).toHaveLength(0);
    expect(data!.report_month).toBeNull();
  });
});

// ===========================================================================
// getGoalProgress
// ===========================================================================
describe("getGoalProgress", () => {
  it("returns progress data for goals", async () => {
    const { data, error } = await getGoalProgress(ctx);

    expect(error).toBeNull();
    expect(data!.goals).toBeDefined();
    expect(Array.isArray(data!.goals)).toBe(true);
    expect(data!.goals.length).toBeGreaterThan(0);
  });

  it("returns empty goals array when no goals exist", async () => {
    // Override to return empty
    mockFrom.mockImplementation((table: string) => {
      if (table === "goals") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({ eq: () => ({ single: mockProfileSingle }) }),
        };
      }
      return {
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
      };
    });

    const { data, error } = await getGoalProgress(ctx);

    expect(error).toBeNull();
    expect(data!.goals).toHaveLength(0);
  });

  it("accepts months parameter", async () => {
    const { data, error } = await getGoalProgress(ctx, undefined, 3);

    expect(error).toBeNull();
    expect(data!.goals).toBeDefined();
  });

  it("returns error on database failure", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "goals") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () =>
                  Promise.resolve({ data: null, error: { message: "DB error" } }),
              }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({ eq: () => ({ single: mockProfileSingle }) }),
        };
      }
      return {
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
      };
    });

    const { data, error } = await getGoalProgress(ctx);

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });
});
