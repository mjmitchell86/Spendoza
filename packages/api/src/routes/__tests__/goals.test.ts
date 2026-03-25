import { describe, it, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";
import type { Server } from "http";
import type { Router } from "express";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-123";
const TEST_TOKEN = "valid-access-token";
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

// ---------------------------------------------------------------------------
// Mock results tracked per-table for complex route logic
// ---------------------------------------------------------------------------

// Track which table is being queried to return appropriate data
let currentTable = "";

// -- goals table mocks --
const mockGoalsOrder = mock(() =>
  Promise.resolve({ data: goalList, error: null })
);

const mockGoalsSelectEq = mock(() => ({
  eq: () => ({
    order: mockGoalsOrder,
  }),
}));

const mockGoalsSelect = mock((_cols?: string) => ({
  eq: mockGoalsSelectEq,
}));

// For checkGoalAccess: .from("goals").select("entity_type, entity_id").eq("id", ...).single()
const mockGoalAccessSingle = mock(() =>
  Promise.resolve({
    data: { entity_type: "user", entity_id: TEST_USER_ID },
    error: null,
  })
);

// Insert chain: .from("goals").insert({...}).select().single()
const mockInsertSingle = mock(() =>
  Promise.resolve({ data: goalEntry, error: null })
);
const mockInsert = mock(() => ({
  select: () => ({ single: mockInsertSingle }),
}));

// Update chain: .from("goals").update({...}).eq("id", ...).select().single()
const mockUpdateSingle = mock(() =>
  Promise.resolve({ data: goalEntry, error: null })
);
const mockUpdate = mock(() => ({
  eq: (_col: string, _val: string) => ({
    select: () => ({ single: mockUpdateSingle }),
  }),
}));

// Delete chain: .from("goals").delete().eq("id", ...)
const mockDeleteResult = mock(() =>
  Promise.resolve({ data: null, error: null })
);
const mockDelete = mock(() => ({
  eq: mockDeleteResult,
}));

// -- profiles table mock --
const mockProfileSingle = mock(() =>
  Promise.resolve({ data: { household_id: TEST_HOUSEHOLD_ID }, error: null })
);

// -- reports table mocks --
const mockReportSingle = mock(() =>
  Promise.resolve({
    data: {
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
    },
    error: null,
  })
);

const mockReportsOrder = mock(() => ({
  limit: () => ({
    single: mockReportSingle,
  }),
}));

const mockReportsIn = mock(() => ({
  order: () =>
    Promise.resolve({
      data: [
        {
          report_month: "2026-03-01",
          report_data: {
            total_income: 6000,
            total_expenses: 4000,
            savings_rate: 33.3,
            by_category: [
              { category: "Groceries", amount: 500, percentage: 12.5 },
            ],
          },
        },
      ],
      error: null,
    }),
}));

// -- debts table mock --
const mockDebtSingle = mock(() =>
  Promise.resolve({
    data: { original_balance: 10000, current_balance: 7000 },
    error: null,
  })
);

// -- supabaseAdmin update for caching suggestions --
const mockAdminUpdate = mock(() => ({
  eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
}));
const mockAdminFrom = mock(() => ({
  update: mockAdminUpdate,
}));

// ---------------------------------------------------------------------------
// Build from() dispatcher
// ---------------------------------------------------------------------------
const mockFrom = mock((table: string) => {
  currentTable = table;

  if (table === "goals") {
    return {
      select: (cols?: string) => {
        if (cols === "entity_type, entity_id") {
          // checkGoalAccess path
          return {
            eq: () => ({ single: mockGoalAccessSingle }),
          };
        }
        if (cols === "name, goal_type") {
          // suggestions: fetch existing goals for deduplication
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
          // progress route: goals with category join
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
        // default select("*") for list
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
            order: mockReportsOrder,
            in: mockReportsIn,
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

  // fallback
  return {
    select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
  };
});

// ---------------------------------------------------------------------------
// Mock for supabaseAdmin (auth middleware getUser + caching suggestions)
// ---------------------------------------------------------------------------
const mockGetUser = mock(() =>
  Promise.resolve({
    data: {
      user: {
        id: TEST_USER_ID,
        email: "test@example.com",
      },
    },
    error: null,
  })
);

// ---------------------------------------------------------------------------
// Mock generateGoalSuggestions AI function
// ---------------------------------------------------------------------------
const mockGenerateGoalSuggestions = mock(() =>
  Promise.resolve([
    {
      name: "Emergency Fund",
      goal_type: "emergency_fund",
      category: null,
      target_amount: 12000,
      rationale: "Build a 3-month emergency fund based on $4,000/mo expenses.",
    },
  ])
);

mock.module("../../ai/goal-suggestions", () => ({
  generateGoalSuggestions: mockGenerateGoalSuggestions,
}));

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js BEFORE any import that depends on it.
// ---------------------------------------------------------------------------
mock.module("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, options?: any) => {
    if (options?.global?.headers?.Authorization) {
      // Per-user supabase client
      return { from: mockFrom };
    }
    // Admin client
    return {
      auth: {
        admin: { createUser: mock() },
        signInWithPassword: mock(),
        getUser: mockGetUser,
      },
      from: mockAdminFrom,
    };
  },
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const express = (await import("express")).default;
  const { default: goalsRouter } = (await import("../goals")) as { default: Router };
  const { requireAuth } = await import("../../middleware/auth");
  const { requireTier } = await import("../../middleware/require-tier");

  const app = express();
  app.use(express.json());
  app.use("/api/goals", requireAuth, requireTier("starter"), goalsRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://localhost:${addr.port}`;
      }
      resolve();
    });
  });
});

afterAll(() => {
  server?.close();
});

beforeEach(() => {
  // Clear
  mockGoalsOrder.mockClear();
  mockGoalsSelectEq.mockClear();
  mockGoalsSelect.mockClear();
  mockGoalAccessSingle.mockClear();
  mockInsertSingle.mockClear();
  mockInsert.mockClear();
  mockUpdateSingle.mockClear();
  mockUpdate.mockClear();
  mockDeleteResult.mockClear();
  mockDelete.mockClear();
  mockProfileSingle.mockClear();
  mockReportSingle.mockClear();
  mockReportsOrder.mockClear();
  mockReportsIn.mockClear();
  mockDebtSingle.mockClear();
  mockAdminUpdate.mockClear();
  mockAdminFrom.mockClear();
  mockFrom.mockClear();
  mockGetUser.mockClear();
  mockGenerateGoalSuggestions.mockClear();

  // Reset to defaults
  mockGetUser.mockImplementation(() =>
    Promise.resolve({
      data: {
        user: { id: TEST_USER_ID, email: "test@example.com" },
      },
      error: null,
    })
  );

  mockGoalsOrder.mockImplementation(() =>
    Promise.resolve({ data: goalList, error: null })
  );

  mockGoalAccessSingle.mockImplementation(() =>
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
    Promise.resolve({
      data: {
        report_month: "2026-03-01",
        report_data: {
          total_income: 6000,
          total_expenses: 4000,
          savings_rate: 33.3,
          expense_to_income_ratio: 0.67,
          by_category: [
            { category: "Groceries", amount: 500, percentage: 12.5 },
          ],
          top_categories: ["Groceries"],
          month_over_month: null,
        },
      },
      error: null,
    })
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

// ===========================================================================
// GET /api/goals
// ===========================================================================
describe("GET /api/goals", () => {
  const url = () => `${baseUrl}/api/goals`;

  it("returns 200 with goal entries", async () => {
    const res = await fetch(url(), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe("Save for Vacation");
    expect(body[1].name).toBe("Budget Groceries");
  });

  it("returns 401 without auth token", async () => {
    const res = await fetch(url());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Missing authorization header");
  });
});

// ===========================================================================
// POST /api/goals
// ===========================================================================
describe("POST /api/goals", () => {
  const url = () => `${baseUrl}/api/goals`;

  it("returns 201 with created goal", async () => {
    const res = await fetch(url(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        name: "Save for Vacation",
        goal_type: "target_savings",
        target_amount: 5000,
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("goal-1");
    expect(body.name).toBe("Save for Vacation");
  });

  it("returns 400 with invalid data (missing required fields)", async () => {
    const res = await fetch(url(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        name: "Missing fields",
        // missing goal_type and target_amount
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 403 for household goal when not a member", async () => {
    mockProfileSingle.mockImplementation(() =>
      Promise.resolve({ data: { household_id: "different-hh" }, error: null })
    );

    const res = await fetch(url(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        name: "Household Goal",
        goal_type: "savings_amount",
        target_amount: 10000,
        entity_type: "household",
        entity_id: TEST_HOUSEHOLD_ID,
      }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Not a member");
  });
});

// ===========================================================================
// PUT /api/goals/:id
// ===========================================================================
describe("PUT /api/goals/:id", () => {
  const url = (id: string) => `${baseUrl}/api/goals/${id}`;

  it("returns 200 with updated goal", async () => {
    const updatedGoal = { ...goalEntry, name: "Updated Goal", target_amount: 7000 };
    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: updatedGoal, error: null })
    );

    const res = await fetch(url("goal-1"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ name: "Updated Goal", target_amount: 7000 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Updated Goal");
    expect(body.target_amount).toBe(7000);
  });

  it("returns 404 when goal does not exist", async () => {
    mockGoalAccessSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: null })
    );

    const res = await fetch(url("goal-nonexistent"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ name: "Updated" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Goal not found");
  });

  it("returns 403 when user does not own the goal", async () => {
    mockGoalAccessSingle.mockImplementation(() =>
      Promise.resolve({
        data: { entity_type: "user", entity_id: "other-user" },
        error: null,
      })
    );

    const res = await fetch(url("goal-1"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ name: "Forbidden" }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });
});

// ===========================================================================
// DELETE /api/goals/:id
// ===========================================================================
describe("DELETE /api/goals/:id", () => {
  const url = (id: string) => `${baseUrl}/api/goals/${id}`;

  it("returns 204 on success", async () => {
    const res = await fetch(url("goal-1"), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(204);
  });

  it("returns 404 when goal does not exist", async () => {
    mockGoalAccessSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: null })
    );

    const res = await fetch(url("goal-nonexistent"), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Goal not found");
  });

  it("returns 403 when user does not own the goal", async () => {
    mockGoalAccessSingle.mockImplementation(() =>
      Promise.resolve({
        data: { entity_type: "user", entity_id: "other-user" },
        error: null,
      })
    );

    const res = await fetch(url("goal-1"), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });
});

// ===========================================================================
// GET /api/goals/suggestions
// ===========================================================================
describe("GET /api/goals/suggestions", () => {
  const url = () => `${baseUrl}/api/goals/suggestions`;

  it("returns cached suggestions when available", async () => {
    mockReportSingle.mockImplementation(() =>
      Promise.resolve({
        data: {
          report_month: "2026-03-01",
          report_data: {
            total_income: 6000,
            total_expenses: 4000,
            savings_rate: 33.3,
            by_category: [],
            top_categories: [],
            month_over_month: null,
            goal_suggestions: [
              {
                name: "Cached Suggestion",
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

    const res = await fetch(url(), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].name).toBe("Cached Suggestion");
    expect(body.report_month).toBe("2026-03-01");
    // AI should NOT be called when cached
    expect(mockGenerateGoalSuggestions).not.toHaveBeenCalled();
  });

  it("generates and returns new suggestions when not cached", async () => {
    const res = await fetch(url(), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].name).toBe("Emergency Fund");
    expect(mockGenerateGoalSuggestions).toHaveBeenCalledTimes(1);
  });

  it("returns empty suggestions when no report exists", async () => {
    mockReportSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: null })
    );

    const res = await fetch(url(), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestions).toHaveLength(0);
    expect(body.report_month).toBeNull();
  });
});

// ===========================================================================
// GET /api/goals/progress
// ===========================================================================
describe("GET /api/goals/progress", () => {
  const url = () => `${baseUrl}/api/goals/progress`;

  it("returns 200 with progress data", async () => {
    const res = await fetch(url(), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.goals).toBeDefined();
    expect(Array.isArray(body.goals)).toBe(true);
  });

  it("returns empty goals array when no goals exist", async () => {
    // Override the goals select to return empty
    const origFrom = mockFrom.getMockImplementation();
    mockFrom.mockImplementation((table: string) => {
      if (table === "goals") {
        return {
          select: (cols?: string) => {
            if (cols === "*, categories(name)") {
              return {
                eq: () => ({
                  eq: () => ({
                    order: () => Promise.resolve({ data: [], error: null }),
                  }),
                }),
              };
            }
            return origFrom?.(table)?.select(cols);
          },
        };
      }
      return origFrom?.(table);
    });

    const res = await fetch(url(), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.goals).toHaveLength(0);
  });
});
