import { describe, it, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";
import type { Server } from "http";
import type { Router } from "express";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-123";
const TEST_USER_EMAIL = "test@example.com";
const TEST_TOKEN = "valid-access-token";
const HOUSEHOLD_ID = "hh-1";
const INVITE_CODE = "abc12345";

const householdData = {
  id: HOUSEHOLD_ID,
  name: "Test Household",
  head_of_household_id: TEST_USER_ID,
  invite_code: INVITE_CODE,
  created_at: "2026-01-01T00:00:00Z",
};

const memberProfile = {
  id: TEST_USER_ID,
  display_name: "Test User",
  income_sharing_mode: "all" as const,
  expense_sharing_mode: "all" as const,
  household_id: HOUSEHOLD_ID,
};

const membersList = [
  memberProfile,
  {
    id: "user-456",
    display_name: "Other Member",
    income_sharing_mode: "none" as const,
    expense_sharing_mode: "none" as const,
    household_id: HOUSEHOLD_ID,
  },
];

// ---------------------------------------------------------------------------
// Tracking which table and operation are used per call
// ---------------------------------------------------------------------------

// We need flexible mock behavior that varies per table and per test.
// Strategy: keep a configurable map of table -> operation -> result.
// The mockFrom will dispatch based on table name.
// ---------------------------------------------------------------------------

// RLS client mock results (keyed by table)
let rlsResults: Record<string, any> = {};

// Admin client mock results (keyed by table)
let adminResults: Record<string, any> = {};

// Track calls for assertions
const rlsCalls: Array<{ table: string; op: string; args?: any }> = [];
const adminCalls: Array<{ table: string; op: string; args?: any }> = [];

function buildChain(results: Record<string, any>, calls: typeof rlsCalls) {
  return (table: string) => {
    const cfg = results[table] || {};

    return {
      select: (...selectArgs: any[]) => {
        calls.push({ table, op: "select", args: selectArgs });
        return {
          eq: (...eqArgs: any[]) => ({
            single: () =>
              Promise.resolve(cfg.selectSingle ?? { data: null, error: null }),
            eq: () => ({
              single: () =>
                Promise.resolve(cfg.selectSingle ?? { data: null, error: null }),
            }),
            // For member list: .select("...").eq("household_id", id)
            ...(cfg.selectList
              ? Promise.resolve(cfg.selectList)
              : Promise.resolve({ data: [], error: null })),
            then: (cfg.selectList ?? { data: [], error: null }).then
              ? undefined
              : (resolve: any) =>
                  resolve(cfg.selectList ?? { data: [], error: null }),
          }),
          single: () =>
            Promise.resolve(cfg.selectSingle ?? { data: null, error: null }),
        };
      },
      insert: (data: any) => {
        calls.push({ table, op: "insert", args: data });
        return {
          select: () => ({
            single: () =>
              Promise.resolve(cfg.insertSingle ?? { data: null, error: null }),
          }),
          // For inserts without .select().single() (household_invitations)
          then: (resolve: any, reject?: any) => {
            const result = cfg.insertResult ?? { data: null, error: null };
            return Promise.resolve(result).then(resolve, reject);
          },
        };
      },
      update: (data: any) => {
        calls.push({ table, op: "update", args: data });
        // Build a recursive eq chain that supports arbitrary depth
        const makeEq = (): any => ({
          eq: () => makeEq(),
          select: () => ({
            single: () =>
              Promise.resolve(
                cfg.updateSingle ?? { data: null, error: null }
              ),
          }),
          then: (resolve: any, reject?: any) => {
            const result = cfg.updateResult ?? { data: null, error: null };
            return Promise.resolve(result).then(resolve, reject);
          },
        });
        return { eq: () => makeEq() };
      },
      delete: () => {
        calls.push({ table, op: "delete" });
        return {
          eq: () => ({
            eq: () =>
              Promise.resolve(cfg.deleteResult ?? { data: null, error: null }),
            then: (resolve: any, reject?: any) => {
              const result = cfg.deleteResult ?? { data: null, error: null };
              return Promise.resolve(result).then(resolve, reject);
            },
          }),
        };
      },
    };
  };
}

const mockRlsFrom = mock((...args: any[]) =>
  buildChain(rlsResults, rlsCalls)(args[0])
);

const mockAdminFrom = mock((...args: any[]) =>
  buildChain(adminResults, adminCalls)(args[0])
);

// ---------------------------------------------------------------------------
// Mock for supabaseAdmin (auth middleware uses getUser)
// ---------------------------------------------------------------------------
const mockGetUser = mock(() =>
  Promise.resolve({
    data: {
      user: {
        id: TEST_USER_ID,
        email: TEST_USER_EMAIL,
      },
    },
    error: null,
  })
);

// ---------------------------------------------------------------------------
// Mock the household service to return a deterministic invite code
// ---------------------------------------------------------------------------
mock.module("../../services/household.service", () => ({
  generateInviteCode: () => INVITE_CODE,
}));

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js
// ---------------------------------------------------------------------------
mock.module("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, options?: any) => {
    // RLS client has Authorization header in options
    if (options?.global?.headers?.Authorization) {
      return { from: mockRlsFrom };
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
  const { default: householdsRouter } = (await import("../households")) as {
    default: Router;
  };
  const { requireAuth } = await import("../../middleware/auth");

  const app = express();
  app.use(express.json());
  app.use("/api/households", requireAuth, householdsRouter);

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
  // Clear tracking
  rlsCalls.length = 0;
  adminCalls.length = 0;
  mockRlsFrom.mockClear();
  mockAdminFrom.mockClear();
  mockGetUser.mockClear();

  // Reset to successful defaults
  mockGetUser.mockImplementation(() =>
    Promise.resolve({
      data: {
        user: {
          id: TEST_USER_ID,
          email: TEST_USER_EMAIL,
        },
      },
      error: null,
    })
  );

  // Default RLS results
  rlsResults = {
    households: {
      selectSingle: { data: householdData, error: null },
      insertSingle: { data: householdData, error: null },
    },
    profiles: {
      selectSingle: { data: memberProfile, error: null },
      selectList: { data: membersList, error: null },
      updateSingle: { data: memberProfile, error: null },
      updateResult: { data: null, error: null },
    },
    household_invitations: {
      insertResult: { data: null, error: null },
      selectList: { data: [], error: null },
    },
  };

  // Default admin results
  adminResults = {
    households: {
      selectSingle: { data: householdData, error: null },
      insertSingle: { data: householdData, error: null },
    },
    profiles: {
      selectSingle: { data: memberProfile, error: null },
      selectList: { data: membersList, error: null },
      updateSingle: { data: memberProfile, error: null },
      updateResult: { data: null, error: null },
    },
    household_invitations: {
      insertResult: { data: null, error: null },
      selectList: { data: [], error: null },
      selectSingle: { data: null, error: null },
    },
  };
});

// ===========================================================================
// POST /api/households — create household
// ===========================================================================
describe("POST /api/households", () => {
  const url = () => `${baseUrl}/api/households`;

  it("returns 201 with household data", async () => {
    const res = await fetch(url(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ name: "Test Household" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe(HOUSEHOLD_ID);
    expect(body.name).toBe("Test Household");
    expect(body.invite_code).toBe(INVITE_CODE);
    expect(body.head_of_household_id).toBe(TEST_USER_ID);
  });

  it("returns 400 with invalid data", async () => {
    const res = await fetch(url(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ name: "" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });
});

// ===========================================================================
// GET /api/households/:id — get household details + members
// ===========================================================================
describe("GET /api/households/:id", () => {
  const url = (id: string) => `${baseUrl}/api/households/${id}`;

  it("returns 200 with household and members", async () => {
    const res = await fetch(url(HOUSEHOLD_ID), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.household.id).toBe(HOUSEHOLD_ID);
    expect(body.household.name).toBe("Test Household");
    expect(Array.isArray(body.members)).toBe(true);
    expect(body.members.length).toBe(2);
    expect(body.members[0].id).toBe(TEST_USER_ID);
    expect(body.members[0].display_name).toBe("Test User");
  });

  it("returns 403 for non-member", async () => {
    // User profile has no household_id (not a member)
    adminResults.profiles.selectSingle = {
      data: { ...memberProfile, household_id: null },
      error: null,
    };

    const res = await fetch(url(HOUSEHOLD_ID), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Not a member of this household");
  });
});

// ===========================================================================
// POST /api/households/:id/invite — invite by email
// ===========================================================================
describe("POST /api/households/:id/invite", () => {
  const url = (id: string) => `${baseUrl}/api/households/${id}/invite`;

  it("returns 201 for head of household", async () => {
    const res = await fetch(url(HOUSEHOLD_ID), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ email: "invitee@example.com" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.message).toBe("Invitation sent");
  });

  it("returns 403 for non-head member", async () => {
    // Household has a different head
    adminResults.households.selectSingle = {
      data: { ...householdData, head_of_household_id: "someone-else" },
      error: null,
    };

    const res = await fetch(url(HOUSEHOLD_ID), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ email: "invitee@example.com" }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Only the head of household can invite members");
  });
});

// ===========================================================================
// POST /api/households/:id/join — join via invite code
// ===========================================================================
describe("POST /api/households/:id/join", () => {
  const url = (id: string) => `${baseUrl}/api/households/${id}/join`;

  it("returns 200 on successful join", async () => {
    // User is NOT already in a household
    adminResults.profiles.selectSingle = {
      data: { ...memberProfile, household_id: null },
      error: null,
    };

    const res = await fetch(url(HOUSEHOLD_ID), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ invite_code: INVITE_CODE }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("Joined household successfully");
  });

  it("returns 400 if already in a household", async () => {
    // User IS already in a household
    adminResults.profiles.selectSingle = {
      data: { ...memberProfile, household_id: "other-household" },
      error: null,
    };

    const res = await fetch(url(HOUSEHOLD_ID), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ invite_code: INVITE_CODE }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Already a member of a household");
  });
});

// ===========================================================================
// DELETE /api/households/:id/members/:userId — remove member
// ===========================================================================
describe("DELETE /api/households/:id/members/:userId", () => {
  const url = (hhId: string, userId: string) =>
    `${baseUrl}/api/households/${hhId}/members/${userId}`;

  it("returns 204 when head removes a member", async () => {
    const res = await fetch(url(HOUSEHOLD_ID, "user-456"), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(204);
  });

  it("returns 403 for non-head member", async () => {
    // Household has a different head
    adminResults.households.selectSingle = {
      data: { ...householdData, head_of_household_id: "someone-else" },
      error: null,
    };

    const res = await fetch(url(HOUSEHOLD_ID, "user-456"), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Only the head of household can remove members");
  });
});

// ===========================================================================
// PUT /api/households/:id/sharing — update sharing preferences
// ===========================================================================
describe("PUT /api/households/:id/sharing", () => {
  const url = (id: string) => `${baseUrl}/api/households/${id}/sharing`;

  it("returns 200 with updated preferences", async () => {
    const updatedProfile = {
      ...memberProfile,
      income_sharing_mode: "partial" as const,
      shared_income_amount: 2000,
      expense_sharing_mode: "category" as const,
    };

    adminResults.profiles.updateSingle = {
      data: updatedProfile,
      error: null,
    };

    const res = await fetch(url(HOUSEHOLD_ID), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        income_sharing_mode: "partial",
        shared_income_amount: 2000,
        expense_sharing_mode: "category",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.income_sharing_mode).toBe("partial");
    expect(body.shared_income_amount).toBe(2000);
    expect(body.expense_sharing_mode).toBe("category");
  });
});
