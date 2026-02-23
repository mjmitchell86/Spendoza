import { describe, it, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";
import type { Server } from "http";
import type { Router } from "express";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-123";
const TEST_TOKEN = "valid-access-token";

const categoryData = {
  id: "cat-1",
  user_id: TEST_USER_ID,
  name: "Groceries",
  is_shared_with_household: false,
  is_system_default: false,
  icon: null,
  created_at: "2026-01-01T00:00:00Z",
};

const systemCategory = {
  id: "cat-system-1",
  user_id: TEST_USER_ID,
  name: "Uncategorized",
  is_shared_with_household: false,
  is_system_default: true,
  icon: null,
  created_at: "2026-01-01T00:00:00Z",
};

const categoriesList = [categoryData, systemCategory];

// ---------------------------------------------------------------------------
// Chainable mock builder
// ---------------------------------------------------------------------------
// We build a single mock object that supports every chain the routes use.
// Each terminal mock (order, single) is independently configurable.
// ---------------------------------------------------------------------------

// GET list terminal: .from("categories").select("*").eq("user_id", ...).order("name")
const mockOrder = mock(() =>
  Promise.resolve({ data: categoriesList, error: null })
);

// POST insert terminal: .from("categories").insert({...}).select().single()
const mockInsertSingle = mock(() =>
  Promise.resolve({ data: categoryData, error: null })
);
const mockInsert = mock(() => ({
  select: () => ({ single: mockInsertSingle }),
}));

// PUT update terminal: .from("categories").update({...}).eq("id", ...).eq("user_id", ...).select().single()
const mockUpdateSingle = mock(() =>
  Promise.resolve({ data: categoryData, error: null })
);
const mockUpdate = mock(() => ({
  eq: () => ({ eq: () => ({ select: () => ({ single: mockUpdateSingle }) }) }),
}));

// DELETE terminal: .from("categories").delete().eq("id", ...).eq("user_id", ...)
const mockDeleteResult = mock(() =>
  Promise.resolve({ data: null, error: null })
);
const mockDelete = mock(() => ({
  eq: () => ({ eq: mockDeleteResult }),
}));

// SELECT chain — used by both GET (list) and DELETE (lookup).
// GET list: .select("*").eq("user_id", ...).order("name")
// DELETE lookup: .select("*").eq("id", ...).eq("user_id", ...).single()
// We return an object from .eq() that supports BOTH .order() and .eq().
const mockSelectSingle = mock(() =>
  Promise.resolve({ data: categoryData, error: null })
);

const mockSelect = mock(() => ({
  eq: () => ({
    // For GET list: .eq("user_id", ...).order("name")
    order: mockOrder,
    // For DELETE lookup: .eq("id", ...).eq("user_id", ...).single()
    eq: () => ({ single: mockSelectSingle }),
    // Also support .single() for any direct .select().eq().single() patterns
    single: mockSelectSingle,
  }),
}));

const mockFrom = mock(() => ({
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
  const { default: categoriesRouter } = (await import("../categories")) as { default: Router };
  const { requireAuth } = await import("../../middleware/auth");

  const app = express();
  app.use(express.json());
  app.use("/api/categories", requireAuth, categoriesRouter);

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
    Promise.resolve({ data: categoriesList, error: null })
  );

  mockInsertSingle.mockImplementation(() =>
    Promise.resolve({ data: categoryData, error: null })
  );

  mockUpdateSingle.mockImplementation(() =>
    Promise.resolve({ data: categoryData, error: null })
  );

  mockSelectSingle.mockImplementation(() =>
    Promise.resolve({ data: categoryData, error: null })
  );

  mockDeleteResult.mockImplementation(() =>
    Promise.resolve({ data: null, error: null })
  );
});

// ===========================================================================
// GET /api/categories
// ===========================================================================
describe("GET /api/categories", () => {
  const url = () => `${baseUrl}/api/categories`;

  it("returns 200 with list of categories", async () => {
    const res = await fetch(url(), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe("Groceries");
    expect(body[1].name).toBe("Uncategorized");

    expect(mockGetUser).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith("categories");
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
// POST /api/categories
// ===========================================================================
describe("POST /api/categories", () => {
  const url = () => `${baseUrl}/api/categories`;

  it("returns 201 with created category", async () => {
    const res = await fetch(url(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        name: "Groceries",
        icon: null,
        is_shared_with_household: false,
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("cat-1");
    expect(body.name).toBe("Groceries");
    expect(body.user_id).toBe(TEST_USER_ID);

    expect(mockFrom).toHaveBeenCalledWith("categories");
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("returns 400 with invalid data (missing name)", async () => {
    const res = await fetch(url(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        icon: "food",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// PUT /api/categories/:id
// ===========================================================================
describe("PUT /api/categories/:id", () => {
  const url = (id: string) => `${baseUrl}/api/categories/${id}`;

  it("returns 200 with updated category", async () => {
    const updatedCategory = { ...categoryData, name: "Food & Drinks" };
    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: updatedCategory, error: null })
    );

    const res = await fetch(url("cat-1"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ name: "Food & Drinks" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Food & Drinks");

    expect(mockFrom).toHaveBeenCalledWith("categories");
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for non-existent category", async () => {
    mockUpdateSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "Not found", code: "PGRST116" } })
    );

    const res = await fetch(url("cat-nonexistent"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ name: "Updated" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Category not found");
  });
});

// ===========================================================================
// DELETE /api/categories/:id
// ===========================================================================
describe("DELETE /api/categories/:id", () => {
  const url = (id: string) => `${baseUrl}/api/categories/${id}`;

  it("returns 204 for custom category", async () => {
    // Lookup returns a custom (non-system-default) category
    mockSelectSingle.mockImplementation(() =>
      Promise.resolve({ data: categoryData, error: null })
    );

    const res = await fetch(url("cat-1"), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(204);
    expect(mockFrom).toHaveBeenCalledWith("categories");
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("returns 403 for system default category", async () => {
    // Lookup returns a system default category
    mockSelectSingle.mockImplementation(() =>
      Promise.resolve({ data: systemCategory, error: null })
    );

    const res = await fetch(url("cat-system-1"), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Cannot delete system default categories");
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
