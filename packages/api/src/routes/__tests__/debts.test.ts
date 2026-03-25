import { describe, it, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";
import type { Server } from "http";
import type { Router } from "express";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-123";
const TEST_TOKEN = "valid-access-token";
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
// Mock results tracked per-table
// ---------------------------------------------------------------------------

// -- debts table: GET list --
// .from("debts").select("*").eq("entity_type",...).eq("entity_id",...).order(...)
const mockDebtsOrder = mock(() =>
  Promise.resolve({ data: debtList, error: null })
);

// -- debts table: GET single for access check --
// .from("debts").select("*").eq("id",...).single()
const mockDebtAccessSingle = mock(() =>
  Promise.resolve({ data: debtEntry, error: null })
);

// -- debts table: INSERT --
const mockInsertSingle = mock(() =>
  Promise.resolve({ data: debtEntry, error: null })
);
const mockInsert = mock(() => ({
  select: () => ({ single: mockInsertSingle }),
}));

// -- debts table: UPDATE --
const mockUpdateSingle = mock(() =>
  Promise.resolve({ data: debtEntry, error: null })
);
const mockUpdate = mock(() => ({
  eq: (_col: string, _val: string) => ({
    select: () => ({ single: mockUpdateSingle }),
  }),
}));

// -- debts table: DELETE --
const mockDeleteResult = mock(() =>
  Promise.resolve({ data: null, error: null })
);
const mockDelete = mock(() => ({
  eq: mockDeleteResult,
}));

// -- projections: debts with balance > 0 --
// .from("debts").select("*").eq(..).eq(..).gt(..).order(..)
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

// -- profiles table mock --
const mockProfileSingle = mock(() =>
  Promise.resolve({ data: { household_id: TEST_HOUSEHOLD_ID }, error: null })
);

// ---------------------------------------------------------------------------
// Build from() dispatcher
// ---------------------------------------------------------------------------

// Track calls to distinguish between list, access check, and projection queries
const mockFrom = mock((table: string) => {
  if (table === "debts") {
    return {
      select: (cols?: string) => {
        // select("*") is used for list, access check, and projections
        return {
          // eq can be entity_type (list/projections) or id (access check)
          eq: (col: string, val: string) => {
            if (col === "id") {
              // Access check: .select("*").eq("id",...).single()
              return { single: mockDebtAccessSingle };
            }
            if (col === "entity_type") {
              // List or projections: .eq("entity_type",...).eq("entity_id",...).order/gt
              return {
                eq: (_col2: string, _val2: string) => ({
                  // List: .order("created_at", ...)
                  order: mockDebtsOrder,
                  // Projections: .gt("current_balance", 0).order(...)
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
      update: (body: any) => ({
        eq: (_col: string, _val: string) => ({
          select: () => ({ single: mockUpdateSingle }),
        }),
      }),
      delete: () => ({
        eq: mockDeleteResult,
      }),
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

  // fallback
  return {
    select: () => ({
      eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
    }),
  };
});

// ---------------------------------------------------------------------------
// Mock for supabaseAdmin (auth middleware uses getUser)
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
      from: mockFrom,
    };
  },
}));

// ---------------------------------------------------------------------------
// Mock debt-projection.service to isolate route tests
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

mock.module("../../services/debt-projection.service", () => ({
  projectSingleDebt: mockProjectSingleDebt,
  calculatePayoffStrategy: mockCalculatePayoffStrategy,
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const express = (await import("express")).default;
  const { default: debtsRouter } = (await import("../debts")) as {
    default: Router;
  };
  const { requireAuth } = await import("../../middleware/auth");
  const { requireTier } = await import("../../middleware/require-tier");

  const app = express();
  app.use(express.json());
  app.use("/api/debts", requireAuth, requireTier("starter"), debtsRouter);

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
  // Clear all mocks
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
  mockGetUser.mockClear();
  mockProjectSingleDebt.mockClear();
  mockCalculatePayoffStrategy.mockClear();

  // Reset to defaults
  mockGetUser.mockImplementation(() =>
    Promise.resolve({
      data: {
        user: { id: TEST_USER_ID, email: "test@example.com" },
      },
      error: null,
    })
  );

  mockDebtsOrder.mockImplementation(() =>
    Promise.resolve({ data: debtList, error: null })
  );

  mockDebtAccessSingle.mockImplementation(() =>
    Promise.resolve({ data: debtEntry, error: null })
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

// ===========================================================================
// GET /api/debts
// ===========================================================================
describe("GET /api/debts", () => {
  const url = () => `${baseUrl}/api/debts`;

  it("returns 200 with debt entries", async () => {
    const res = await fetch(url(), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe("Credit Card");
    expect(body[1].name).toBe("Student Loan");
  });

  it("returns 401 without auth token", async () => {
    const res = await fetch(url());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Missing authorization header");
  });

  it("returns 400 when household not found", async () => {
    mockProfileSingle.mockImplementation(() =>
      Promise.resolve({ data: { household_id: null }, error: null })
    );

    const res = await fetch(`${url()}?entity_type=household`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("household");
  });
});

// ===========================================================================
// POST /api/debts
// ===========================================================================
describe("POST /api/debts", () => {
  const url = () => `${baseUrl}/api/debts`;

  it("returns 201 with created debt", async () => {
    const res = await fetch(url(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        name: "Credit Card",
        debt_type: "credit_card",
        original_balance: 5000,
        current_balance: 3000,
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("debt-1");
    expect(body.name).toBe("Credit Card");
  });

  it("returns 400 with invalid data (missing required fields)", async () => {
    const res = await fetch(url(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        name: "Bad Debt",
        // missing debt_type, original_balance, current_balance
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });
});

// ===========================================================================
// PUT /api/debts/:id
// ===========================================================================
describe("PUT /api/debts/:id", () => {
  const url = (id: string) => `${baseUrl}/api/debts/${id}`;

  it("returns 200 with updated debt", async () => {
    const updatedDebt = { ...debtEntry, name: "Updated Card", current_balance: 2500 };
    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: updatedDebt, error: null })
    );

    const res = await fetch(url("debt-1"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ name: "Updated Card", current_balance: 2500 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Updated Card");
    expect(body.current_balance).toBe(2500);
  });

  it("returns 404 when debt does not exist", async () => {
    mockDebtAccessSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: null })
    );

    const res = await fetch(url("debt-nonexistent"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ name: "Updated" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Debt not found");
  });

  it("returns 403 when user does not own the debt", async () => {
    mockDebtAccessSingle.mockImplementation(() =>
      Promise.resolve({
        data: { ...debtEntry, entity_type: "user", entity_id: "other-user" },
        error: null,
      })
    );

    const res = await fetch(url("debt-1"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ name: "Forbidden" }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Access denied");
  });

  it("returns 403 when user is not in household", async () => {
    mockDebtAccessSingle.mockImplementation(() =>
      Promise.resolve({
        data: {
          ...debtEntry,
          entity_type: "household",
          entity_id: "other-household",
        },
        error: null,
      })
    );
    mockProfileSingle.mockImplementation(() =>
      Promise.resolve({ data: { household_id: TEST_HOUSEHOLD_ID }, error: null })
    );

    const res = await fetch(url("debt-1"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ name: "Forbidden Household" }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Access denied");
  });
});

// ===========================================================================
// DELETE /api/debts/:id
// ===========================================================================
describe("DELETE /api/debts/:id", () => {
  const url = (id: string) => `${baseUrl}/api/debts/${id}`;

  it("returns 204 on success", async () => {
    const res = await fetch(url("debt-1"), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(204);
  });

  it("returns 404 when debt does not exist", async () => {
    mockDebtAccessSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: null })
    );

    const res = await fetch(url("debt-nonexistent"), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Debt not found");
  });

  it("returns 403 when user does not own the debt", async () => {
    mockDebtAccessSingle.mockImplementation(() =>
      Promise.resolve({
        data: { ...debtEntry, entity_type: "user", entity_id: "other-user" },
        error: null,
      })
    );

    const res = await fetch(url("debt-1"), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Access denied");
  });
});

// ===========================================================================
// GET /api/debts/projections
// ===========================================================================
describe("GET /api/debts/projections", () => {
  const url = () => `${baseUrl}/api/debts/projections`;

  it("returns 200 with projection data", async () => {
    const res = await fetch(url(), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.individual).toBeDefined();
    expect(body.avalanche).toBeDefined();
    expect(body.snowball).toBeDefined();
    expect(Array.isArray(body.individual)).toBe(true);
    expect(body.individual).toHaveLength(2);
    expect(body.avalanche.strategy).toBe("avalanche");
    expect(body.snowball.strategy).toBe("snowball");
  });

  it("passes extra_payment query param", async () => {
    const res = await fetch(`${url()}?extra_payment=200`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.avalanche).toBeDefined();
    expect(body.snowball).toBeDefined();
    expect(mockCalculatePayoffStrategy).toHaveBeenCalledTimes(2);
  });

  it("returns 400 when household not found", async () => {
    mockProfileSingle.mockImplementation(() =>
      Promise.resolve({ data: { household_id: null }, error: null })
    );

    const res = await fetch(`${url()}?entity_type=household`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("household");
  });
});
