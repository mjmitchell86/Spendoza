import { describe, it, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";
import type { Server } from "http";
import type { Router } from "express";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-123";
const TEST_TOKEN = "valid-access-token";
const TEST_HOUSEHOLD_ID = "household-1";

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

const sharedStatementRecord = {
  id: "stmt-1",
  user_id: TEST_USER_ID,
  is_shared_account: true,
};

const nonSharedStatementRecord = {
  id: "stmt-2",
  user_id: TEST_USER_ID,
  is_shared_account: false,
};

const householdMemberProfile = {
  id: "member-456",
  household_id: TEST_HOUSEHOLD_ID,
};

const requesterProfile = {
  id: TEST_USER_ID,
  household_id: TEST_HOUSEHOLD_ID,
  is_head: true,
};

// ---------------------------------------------------------------------------
// Chainable mock builder
// ---------------------------------------------------------------------------
// Transactions routes use these chains:
// GET list:     .from("transactions").select("*").eq("user_id", ...) [.eq(...)] [.gte(...)] [.lte(...)] .order("date", { ascending: false })
// PUT update:   .from("transactions").update({...}).eq("id", ...).eq("user_id", ...).select().single()
// PUT attribute: multiple queries for validation + .from("transactions").update({...}).eq("id", ...).select().single()
// ---------------------------------------------------------------------------

// GET list terminal: .order("date", { ascending: false })
const mockOrder = mock(() =>
  Promise.resolve({ data: transactionsList, error: null })
);

// The chainable filter object for GET queries
const mockFilterChain: Record<string, any> = {};
mockFilterChain.eq = mock(() => mockFilterChain);
mockFilterChain.gte = mock(() => mockFilterChain);
mockFilterChain.lte = mock(() => mockFilterChain);
mockFilterChain.order = mockOrder;

// PUT update terminal: .update({...}).eq("id", ...).eq("user_id", ...).select().single()
const mockUpdateSingle = mock(() =>
  Promise.resolve({ data: transactionRecord, error: null })
);
const mockUpdate = mock(() => ({
  eq: () => ({ eq: () => ({ select: () => ({ single: mockUpdateSingle }) }) }),
}));

// SELECT chain — used by GET: .select("*").eq("user_id", ...) -> filterChain
const mockSelect = mock((_cols?: string) => ({
  eq: () => mockFilterChain,
}));

const mockFrom = mock((_table: string) => ({
  select: mockSelect,
  update: mockUpdate,
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
  const { default: transactionsRouter } = (await import(
    "../transactions"
  )) as { default: Router };
  const { requireAuth } = await import("../../middleware/auth");

  const app = express();
  app.use(express.json());
  app.use("/api/transactions", requireAuth, transactionsRouter);

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
  mockUpdateSingle.mockClear();
  mockUpdate.mockClear();
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
    Promise.resolve({ data: transactionsList, error: null })
  );

  mockFilterChain.eq.mockImplementation(() => mockFilterChain);
  mockFilterChain.gte.mockImplementation(() => mockFilterChain);
  mockFilterChain.lte.mockImplementation(() => mockFilterChain);

  mockUpdateSingle.mockImplementation(() =>
    Promise.resolve({ data: transactionRecord, error: null })
  );

  // Default mockFrom — simple table operations
  mockFrom.mockImplementation((_table: string) => ({
    select: mockSelect,
    update: mockUpdate,
  }));
});

// ===========================================================================
// GET /api/transactions
// ===========================================================================
describe("GET /api/transactions", () => {
  const url = (params?: string) =>
    `${baseUrl}/api/transactions${params ? `?${params}` : ""}`;

  it("returns 200 with transactions list", async () => {
    const res = await fetch(url(), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0].description).toBe("Grocery store");
    expect(body[1].description).toBe("Salary deposit");

    expect(mockGetUser).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith("transactions");
  });

  it("returns filtered results when type=debit is provided", async () => {
    const filteredList = [transactionRecord];
    mockOrder.mockImplementation(() =>
      Promise.resolve({ data: filteredList, error: null })
    );

    const res = await fetch(url("type=debit"), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);

    // The chain should have called .eq() for type filter
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
// PUT /api/transactions/:id
// ===========================================================================
describe("PUT /api/transactions/:id", () => {
  const url = (id: string) => `${baseUrl}/api/transactions/${id}`;

  it("returns 200 with updated transaction", async () => {
    const updatedTransaction = { ...transactionRecord, ai_category: "groceries" };
    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: updatedTransaction, error: null })
    );

    const res = await fetch(url("txn-1"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ ai_category: "groceries" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ai_category).toBe("groceries");

    expect(mockFrom).toHaveBeenCalledWith("transactions");
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for non-existent transaction", async () => {
    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "Not found", code: "PGRST116" } })
    );

    const res = await fetch(url("txn-nonexistent"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ ai_category: "groceries" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Transaction not found");
  });
});

// ===========================================================================
// PUT /api/transactions/:id/attribute
// ===========================================================================
describe("PUT /api/transactions/:id/attribute", () => {
  const url = (id: string) => `${baseUrl}/api/transactions/${id}/attribute`;

  it("returns 200 on successful attribution", async () => {
    const attributedTransaction = {
      ...transactionRecord,
      attributed_to_user_id: "member-456",
    };

    // Mock multiple from() calls for validation + update:
    // 1. from("transactions").select("*").eq("id", ...).eq("user_id", ...).single() -> transaction
    // 2. from("bank_statements").select("*").eq("id", ...).single() -> shared statement
    // 3. from("profiles").select("*").eq("id", ...).single() -> target user profile (household check)
    // 4. from("profiles").select("*").eq("id", ...).single() -> requester profile (household + head check)
    // 5. from("transactions").update({...}).eq("id", ...).select().single() -> updated transaction
    let fromCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      fromCallCount++;
      if (fromCallCount === 1) {
        // Fetch the transaction
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({ data: transactionRecord, error: null }),
              }),
            }),
          }),
        };
      }
      if (fromCallCount === 2) {
        // Fetch the bank statement
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({ data: sharedStatementRecord, error: null }),
            }),
          }),
        };
      }
      if (fromCallCount === 3) {
        // Fetch target user profile (household membership)
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({ data: householdMemberProfile, error: null }),
            }),
          }),
        };
      }
      if (fromCallCount === 4) {
        // Fetch requester profile (household + head check)
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({ data: requesterProfile, error: null }),
            }),
          }),
        };
      }
      // Update the transaction
      return {
        update: () => ({
          eq: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({ data: attributedTransaction, error: null }),
            }),
          }),
        }),
      };
    });

    const res = await fetch(url("txn-1"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ attributed_to_user_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.attributed_to_user_id).toBe("member-456");
  });

  it("returns 403 when bank statement is not a shared account", async () => {
    // Mock: transaction found, statement is NOT shared
    let fromCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      fromCallCount++;
      if (fromCallCount === 1) {
        // Fetch the transaction
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({ data: transactionRecord, error: null }),
              }),
            }),
          }),
        };
      }
      // Fetch the bank statement — NOT shared
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({ data: nonSharedStatementRecord, error: null }),
          }),
        }),
      };
    });

    const res = await fetch(url("txn-1"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ attributed_to_user_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("shared account");
  });
});

// ===========================================================================
// POST /api/transactions/bulk-attribute
// ===========================================================================
describe("POST /api/transactions/bulk-attribute", () => {
  const url = () => `${baseUrl}/api/transactions/bulk-attribute`;

  it("returns 200 with results array", async () => {
    const attributedTransaction = {
      ...transactionRecord,
      attributed_to_user_id: "member-456",
    };

    // For each attribution in the bulk request, the route will:
    // 1. from("transactions") — fetch the transaction
    // 2. from("bank_statements") — check is_shared_account
    // 3. from("profiles") — check target user household
    // 4. from("profiles") — check requester household + head
    // 5. from("transactions") — update
    let fromCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      fromCallCount++;
      // Repeating pattern for each attribution in the batch
      const phase = ((fromCallCount - 1) % 5) + 1;
      if (phase === 1) {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({ data: transactionRecord, error: null }),
              }),
            }),
          }),
        };
      }
      if (phase === 2) {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({ data: sharedStatementRecord, error: null }),
            }),
          }),
        };
      }
      if (phase === 3) {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({ data: householdMemberProfile, error: null }),
            }),
          }),
        };
      }
      if (phase === 4) {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({ data: requesterProfile, error: null }),
            }),
          }),
        };
      }
      // phase 5: update
      return {
        update: () => ({
          eq: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({ data: attributedTransaction, error: null }),
            }),
          }),
        }),
      };
    });

    const res = await fetch(url(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        attributions: [
          {
            transaction_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            attributed_to_user_id: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toBeDefined();
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].success).toBe(true);
    expect(body.results[0].transaction_id).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
  });
});
