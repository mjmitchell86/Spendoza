import { describe, it, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";
import type { Server } from "http";
import type { Router } from "express";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-123";
const TEST_TOKEN = "valid-access-token";

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
  {
    ...incomeEntry,
    id: "inc-2",
    source_name: "Freelance",
    amount: 1500,
    frequency: "biweekly",
  },
];

// ---------------------------------------------------------------------------
// Chainable mock builder
// ---------------------------------------------------------------------------
// Income routes use these chains:
// GET list:   .from("income_entries").select("*").or(...).order("effective_date", { ascending: false })
// POST:       .from("income_entries").insert({...}).select().single()
// PUT:        .from("income_entries").update({...}).eq("id", ...).select().single()
// DELETE:     .from("income_entries").delete().eq("id", ...).eq("user_id", ...)
// POST household check: .from("profiles").select("household_id").eq("id", ...).single()
// ---------------------------------------------------------------------------

// GET list terminal: .or(...).order(...)
const mockOrder = mock(() =>
  Promise.resolve({ data: incomeList, error: null })
);

// The .or() returns an object with .order()
const mockOr = mock(() => ({
  order: mockOrder,
}));

// POST insert terminal: .insert({...}).select().single()
const mockInsertSingle = mock(() =>
  Promise.resolve({ data: incomeEntry, error: null })
);
const mockInsert = mock(() => ({
  select: () => ({ single: mockInsertSingle }),
}));

// PUT update terminal: .update({...}).eq("id", ...).select().single()
const mockUpdateSingle = mock(() =>
  Promise.resolve({ data: incomeEntry, error: null })
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

// SELECT chain — used by GET (.select("*").or(...).order(...))
// and potentially household check (.select("household_id").eq(...).single())
const mockSelectSingle = mock(() =>
  Promise.resolve({ data: { household_id: "hh-1" }, error: null })
);

const mockSelect = mock((_cols?: string) => ({
  // For GET: .select("*").or(...).order(...)
  or: mockOr,
  // For household check: .select("household_id").eq("id", ...).single()
  eq: () => ({
    single: mockSelectSingle,
    eq: () => ({ single: mockSelectSingle }),
  }),
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
  const { default: incomeRouter } = (await import("../income")) as { default: Router };
  const { requireAuth } = await import("../../middleware/auth");

  const app = express();
  app.use(express.json());
  app.use("/api/income", requireAuth, incomeRouter);

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
    Promise.resolve({ data: incomeList, error: null })
  );

  mockOr.mockImplementation(() => ({
    order: mockOrder,
  }));

  mockInsertSingle.mockImplementation(() =>
    Promise.resolve({ data: incomeEntry, error: null })
  );

  mockUpdateSingle.mockImplementation(() =>
    Promise.resolve({ data: incomeEntry, error: null })
  );

  mockSelectSingle.mockImplementation(() =>
    Promise.resolve({ data: { household_id: "hh-1" }, error: null })
  );

  mockDeleteResult.mockImplementation(() =>
    Promise.resolve({ data: null, error: null })
  );
});

// ===========================================================================
// GET /api/income
// ===========================================================================
describe("GET /api/income", () => {
  const url = () => `${baseUrl}/api/income`;

  it("returns 200 with income entries", async () => {
    const res = await fetch(url(), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0].source_name).toBe("Salary");
    expect(body[1].source_name).toBe("Freelance");

    expect(mockGetUser).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith("income_entries");
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
// POST /api/income
// ===========================================================================
describe("POST /api/income", () => {
  const url = () => `${baseUrl}/api/income`;

  it("returns 201 with created entry", async () => {
    const res = await fetch(url(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        source_name: "Salary",
        amount: 5000,
        frequency: "monthly",
        effective_date: "2026-01-01",
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("inc-1");
    expect(body.source_name).toBe("Salary");
    expect(body.user_id).toBe(TEST_USER_ID);

    expect(mockFrom).toHaveBeenCalledWith("income_entries");
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
        source_name: "Salary",
        // missing amount, frequency, effective_date
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// PUT /api/income/:id
// ===========================================================================
describe("PUT /api/income/:id", () => {
  const url = (id: string) => `${baseUrl}/api/income/${id}`;

  it("returns 200 with updated entry", async () => {
    const updatedEntry = { ...incomeEntry, source_name: "Senior Salary", amount: 6000 };
    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: updatedEntry, error: null })
    );

    const res = await fetch(url("inc-1"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ source_name: "Senior Salary", amount: 6000 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source_name).toBe("Senior Salary");
    expect(body.amount).toBe(6000);

    expect(mockFrom).toHaveBeenCalledWith("income_entries");
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for non-existent entry", async () => {
    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "Not found", code: "PGRST116" } })
    );

    const res = await fetch(url("inc-nonexistent"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ source_name: "Updated" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Income entry not found");
  });
});

// ===========================================================================
// DELETE /api/income/:id
// ===========================================================================
describe("DELETE /api/income/:id", () => {
  const url = (id: string) => `${baseUrl}/api/income/${id}`;

  it("returns 204 on success", async () => {
    const res = await fetch(url("inc-1"), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(204);
    expect(mockFrom).toHaveBeenCalledWith("income_entries");
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });
});
