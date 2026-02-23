import { describe, it, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";
import type { Server } from "http";
import type { Router } from "express";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-123";
const TEST_TOKEN = "valid-access-token";

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
  {
    ...expenseEntry,
    id: "exp-2",
    description: "Gym membership",
    amount: 49.99,
    next_due_date: "2026-03-01",
  },
];

// ---------------------------------------------------------------------------
// Chainable mock builder
// ---------------------------------------------------------------------------
// Expenses routes use these chains:
// GET list:   .from("expenses").select("*").eq("user_id", ...) [.eq(...)] [.eq(...)] [.gte(...)] [.lte(...)] .order("next_due_date", { ascending: true })
// POST:       .from("expenses").insert({...}).select().single()
// PUT:        .from("expenses").update({...}).eq("id", ...).eq("user_id", ...).select().single()
// DELETE:     .from("expenses").delete().eq("id", ...).eq("user_id", ...)
// ---------------------------------------------------------------------------

// GET list terminal: .order("next_due_date", { ascending: true })
const mockOrder = mock(() =>
  Promise.resolve({ data: expensesList, error: null })
);

// The chainable filter object returned by .eq(), .gte(), .lte() in GET queries.
// Each filter method returns the same object so filters can be chained in any order
// and always end with .order().
const mockFilterChain: Record<string, any> = {};
mockFilterChain.eq = mock(() => mockFilterChain);
mockFilterChain.gte = mock(() => mockFilterChain);
mockFilterChain.lte = mock(() => mockFilterChain);
mockFilterChain.order = mockOrder;

// POST insert terminal: .insert({...}).select().single()
const mockInsertSingle = mock(() =>
  Promise.resolve({ data: expenseEntry, error: null })
);
const mockInsert = mock(() => ({
  select: () => ({ single: mockInsertSingle }),
}));

// PUT update terminal: .update({...}).eq("id", ...).eq("user_id", ...).select().single()
const mockUpdateSingle = mock(() =>
  Promise.resolve({ data: expenseEntry, error: null })
);
const mockUpdate = mock(() => ({
  eq: () => ({ eq: () => ({ select: () => ({ single: mockUpdateSingle }) }) }),
}));

// DELETE terminal: .delete().eq("id", ...).eq("user_id", ...)
const mockDeleteResult = mock(() =>
  Promise.resolve({ data: null, error: null })
);
const mockDelete = mock(() => ({
  eq: () => ({ eq: mockDeleteResult }),
}));

// SELECT chain — used by GET: .select("*").eq("user_id", ...) -> filterChain
const mockSelect = mock((_cols?: string) => ({
  eq: () => mockFilterChain,
}));

const mockFrom = mock((_table: string) => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
}));

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
      return { from: mockFrom };
    }
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
// Test helpers
// ---------------------------------------------------------------------------
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const express = (await import("express")).default;
  const { default: expensesRouter } = (await import("../expenses")) as { default: Router };
  const { requireAuth } = await import("../../middleware/auth");

  const app = express();
  app.use(express.json());
  app.use("/api/expenses", requireAuth, expensesRouter);

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
  mockOrder.mockClear();
  mockFilterChain.eq.mockClear();
  mockFilterChain.gte.mockClear();
  mockFilterChain.lte.mockClear();
  mockInsertSingle.mockClear();
  mockInsert.mockClear();
  mockUpdateSingle.mockClear();
  mockUpdate.mockClear();
  mockDeleteResult.mockClear();
  mockDelete.mockClear();
  mockSelect.mockClear();
  mockFrom.mockClear();
  mockGetUser.mockClear();

  // Reset to successful defaults
  mockGetUser.mockImplementation(() =>
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

  mockOrder.mockImplementation(() =>
    Promise.resolve({ data: expensesList, error: null })
  );

  mockFilterChain.eq.mockImplementation(() => mockFilterChain);
  mockFilterChain.gte.mockImplementation(() => mockFilterChain);
  mockFilterChain.lte.mockImplementation(() => mockFilterChain);

  mockInsertSingle.mockImplementation(() =>
    Promise.resolve({ data: expenseEntry, error: null })
  );

  mockUpdateSingle.mockImplementation(() =>
    Promise.resolve({ data: expenseEntry, error: null })
  );

  mockDeleteResult.mockImplementation(() =>
    Promise.resolve({ data: null, error: null })
  );
});

// ===========================================================================
// GET /api/expenses
// ===========================================================================
describe("GET /api/expenses", () => {
  const url = (params?: string) =>
    `${baseUrl}/api/expenses${params ? `?${params}` : ""}`;

  it("returns 200 with expenses list", async () => {
    const res = await fetch(url(), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0].description).toBe("Netflix subscription");
    expect(body[1].description).toBe("Gym membership");

    expect(mockGetUser).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith("expenses");
  });

  it("returns filtered results when category_id is provided", async () => {
    const filteredList = [expenseEntry];
    mockOrder.mockImplementation(() =>
      Promise.resolve({ data: filteredList, error: null })
    );

    const res = await fetch(url("category_id=cat-1"), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);

    // The chain should have called .eq() for category_id filter
    // (one .eq for user_id in select chain, plus one .eq for category_id on filter chain)
    expect(mockFilterChain.eq).toHaveBeenCalled();
  });

  it("returns 401 without auth token", async () => {
    const res = await fetch(url());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Missing authorization header");
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// POST /api/expenses
// ===========================================================================
describe("POST /api/expenses", () => {
  const url = () => `${baseUrl}/api/expenses`;

  it("returns 201 with created expense", async () => {
    const res = await fetch(url(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        category_id: "b1c2d3e4-f5a6-7890-abcd-ef1234567890",
        description: "Netflix subscription",
        amount: 15.99,
        frequency: "recurring",
        recurrence_interval: "monthly",
        next_due_date: "2026-02-15",
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("exp-1");
    expect(body.description).toBe("Netflix subscription");
    expect(body.user_id).toBe(TEST_USER_ID);

    expect(mockFrom).toHaveBeenCalledWith("expenses");
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("returns 400 with invalid data", async () => {
    const res = await fetch(url(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        description: "Netflix",
        // missing category_id, amount, frequency, next_due_date
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// PUT /api/expenses/:id
// ===========================================================================
describe("PUT /api/expenses/:id", () => {
  const url = (id: string) => `${baseUrl}/api/expenses/${id}`;

  it("returns 200 with updated expense", async () => {
    const updatedExpense = { ...expenseEntry, description: "Hulu subscription", amount: 12.99 };
    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: updatedExpense, error: null })
    );

    const res = await fetch(url("exp-1"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ description: "Hulu subscription", amount: 12.99 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.description).toBe("Hulu subscription");
    expect(body.amount).toBe(12.99);

    expect(mockFrom).toHaveBeenCalledWith("expenses");
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for non-existent expense", async () => {
    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "Not found", code: "PGRST116" } })
    );

    const res = await fetch(url("exp-nonexistent"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ description: "Updated" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Expense not found");
  });
});

// ===========================================================================
// DELETE /api/expenses/:id
// ===========================================================================
describe("DELETE /api/expenses/:id", () => {
  const url = (id: string) => `${baseUrl}/api/expenses/${id}`;

  it("returns 204 on success", async () => {
    const res = await fetch(url("exp-1"), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(204);
    expect(mockFrom).toHaveBeenCalledWith("expenses");
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });
});
