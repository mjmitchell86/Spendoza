import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import type { Server } from "http";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const HEAD_USER_ID = "user-hh-head";
const MEMBER_USER_ID = "user-hh-member";
const HEAD_EMAIL = "head@example.com";
const MEMBER_EMAIL = "member@example.com";
const TEST_TOKEN = "hh-access-token";
const HOUSEHOLD_ID = "hh-int-1";
const INVITE_CODE = "abcd1234";

const householdData = {
  id: HOUSEHOLD_ID,
  name: "Smith Family",
  head_of_household_id: HEAD_USER_ID,
  invite_code: INVITE_CODE,
  created_at: "2026-01-01T00:00:00Z",
};

const headProfile = {
  id: HEAD_USER_ID,
  display_name: "Head User",
  income_sharing_mode: "all" as const,
  expense_sharing_mode: "all" as const,
  household_id: HOUSEHOLD_ID,
};

const memberProfile = {
  id: MEMBER_USER_ID,
  display_name: "Member User",
  income_sharing_mode: "none" as const,
  expense_sharing_mode: "none" as const,
  household_id: null as string | null,
};

// ---------------------------------------------------------------------------
// Configurable mock results keyed by table
// ---------------------------------------------------------------------------
let rlsResults: Record<string, any> = {};
let adminResults: Record<string, any> = {};

const rlsCalls: Array<{ table: string; op: string; args?: any }> = [];
const adminCalls: Array<{ table: string; op: string; args?: any }> = [];

function buildChain(results: Record<string, any>, calls: typeof rlsCalls) {
  return (table: string) => {
    const cfg = results[table] || {};

    const makeEqChain = (): any => ({
      eq: () => makeEqChain(),
      gte: () => makeEqChain(),
      lte: () => makeEqChain(),
      or: () => makeEqChain(),
      is: () => makeEqChain(),
      order: () => makeEqChain(),
      limit: () => makeEqChain(),
      single: () =>
        Promise.resolve(cfg.selectSingle ?? { data: null, error: null }),
      maybeSingle: () =>
        Promise.resolve(
          cfg.selectMaybeSingle ?? cfg.selectSingle ?? { data: null, error: null }
        ),
      then: (resolve: any, reject?: any) => {
        const result = cfg.selectList ?? { data: [], error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    });

    return {
      select: (...selectArgs: any[]) => {
        calls.push({ table, op: "select", args: selectArgs });
        return makeEqChain();
      },
      insert: (data: any) => {
        calls.push({ table, op: "insert", args: data });
        return {
          select: () => ({
            single: () =>
              Promise.resolve(cfg.insertSingle ?? { data: null, error: null }),
          }),
          then: (resolve: any, reject?: any) => {
            const result = cfg.insertResult ?? { data: null, error: null };
            return Promise.resolve(result).then(resolve, reject);
          },
        };
      },
      update: (data: any) => {
        calls.push({ table, op: "update", args: data });
        const makeUpdateEq = (): any => ({
          eq: () => makeUpdateEq(),
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
        return { eq: () => makeUpdateEq() };
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

// ---------------------------------------------------------------------------
// Mock for supabaseAdmin auth
// ---------------------------------------------------------------------------
let currentUserId = HEAD_USER_ID;
let currentUserEmail = HEAD_EMAIL;

const mockGetUser = mock(() =>
  Promise.resolve({
    data: {
      user: {
        id: currentUserId,
        email: currentUserEmail,
      },
    },
    error: null,
  })
);

const mockRlsFrom = mock((...args: any[]) =>
  buildChain(rlsResults, rlsCalls)(args[0])
);

const mockAdminFrom = mock((...args: any[]) =>
  buildChain(adminResults, adminCalls)(args[0])
);

// ---------------------------------------------------------------------------
// Mock the household service for deterministic invite code
// ---------------------------------------------------------------------------
mock.module("../../services/household.service", () => ({
  generateInviteCode: () => INVITE_CODE,
}));

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js
// ---------------------------------------------------------------------------
mock.module("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, options?: any) => {
    if (options?.global?.headers?.Authorization) {
      return { from: mockRlsFrom };
    }
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
// Server setup
// ---------------------------------------------------------------------------
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const express = (await import("express")).default;
  const { default: householdsRouter } = await import("../../routes/households");
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

function resetResults() {
  rlsCalls.length = 0;
  adminCalls.length = 0;
  mockRlsFrom.mockClear();
  mockAdminFrom.mockClear();
  mockGetUser.mockClear();

  mockGetUser.mockImplementation(() =>
    Promise.resolve({
      data: {
        user: {
          id: currentUserId,
          email: currentUserEmail,
        },
      },
      error: null,
    })
  );
}

// ===========================================================================
// Household Flow Integration Test
// Create -> Invite -> Join -> Configure sharing -> Verify data -> Remove member
// ===========================================================================
describe("Household Flow: Create -> Invite -> Join -> Share -> Verify -> Remove", () => {
  it("Step 1: Head creates a household", async () => {
    currentUserId = HEAD_USER_ID;
    currentUserEmail = HEAD_EMAIL;
    resetResults();

    // POST / uses req.supabase (RLS client) for households.insert + profiles.update
    rlsResults = {
      households: {
        insertSingle: { data: householdData, error: null },
      },
      profiles: {
        updateResult: { data: null, error: null },
      },
    };
    adminResults = {};

    const res = await fetch(`${baseUrl}/api/households`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ name: "Smith Family" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe(HOUSEHOLD_ID);
    expect(body.name).toBe("Smith Family");
    expect(body.invite_code).toBe(INVITE_CODE);
    expect(body.head_of_household_id).toBe(HEAD_USER_ID);
  });

  it("Step 2: Head invites a member by email", async () => {
    currentUserId = HEAD_USER_ID;
    currentUserEmail = HEAD_EMAIL;
    resetResults();

    // POST /:id/invite uses req.supabase (RLS client) for all queries
    rlsResults = {
      households: {
        selectSingle: { data: householdData, error: null },
      },
      profiles: {
        selectList: { data: [headProfile], error: null },
      },
      household_invitations: {
        selectList: { data: [], error: null },
        insertResult: { data: null, error: null },
      },
    };
    adminResults = {};

    const res = await fetch(`${baseUrl}/api/households/${HOUSEHOLD_ID}/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ email: MEMBER_EMAIL }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.message).toBe("Invitation sent");
  });

  it("Step 3: Member joins the household via invite code", async () => {
    // Switch to member user
    currentUserId = MEMBER_USER_ID;
    currentUserEmail = MEMBER_EMAIL;
    resetResults();

    adminResults = {
      households: {
        selectSingle: { data: householdData, error: null },
      },
      profiles: {
        selectSingle: { data: { ...memberProfile, household_id: null }, error: null },
        selectList: { data: [headProfile], error: null }, // current members
        updateResult: { data: null, error: null },
      },
      household_invitations: {
        updateResult: { data: null, error: null },
      },
    };

    const res = await fetch(`${baseUrl}/api/households/${HOUSEHOLD_ID}/join`, {
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

  it("Step 4: Member configures sharing preferences", async () => {
    currentUserId = MEMBER_USER_ID;
    currentUserEmail = MEMBER_EMAIL;
    resetResults();

    const updatedMemberProfile = {
      ...memberProfile,
      household_id: HOUSEHOLD_ID,
      income_sharing_mode: "partial" as const,
      shared_income_amount: 3000,
      expense_sharing_mode: "all" as const,
    };

    // PUT /:id/sharing uses req.supabase (RLS client) for profiles.select + profiles.update
    rlsResults = {
      profiles: {
        selectSingle: { data: { ...memberProfile, household_id: HOUSEHOLD_ID }, error: null },
        updateSingle: { data: updatedMemberProfile, error: null },
      },
    };
    adminResults = {};

    const res = await fetch(`${baseUrl}/api/households/${HOUSEHOLD_ID}/sharing`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        income_sharing_mode: "partial",
        shared_income_amount: 3000,
        expense_sharing_mode: "all",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.income_sharing_mode).toBe("partial");
    expect(body.shared_income_amount).toBe(3000);
    expect(body.expense_sharing_mode).toBe("all");
  });

  it("Step 5: Head views household details and verifies member list", async () => {
    currentUserId = HEAD_USER_ID;
    currentUserEmail = HEAD_EMAIL;
    resetResults();

    const membersList = [
      headProfile,
      { ...memberProfile, household_id: HOUSEHOLD_ID },
    ];

    // GET /:id uses req.supabase (RLS client) for profiles.select + households.select
    rlsResults = {
      profiles: {
        selectSingle: { data: headProfile, error: null },
        selectList: { data: membersList, error: null },
      },
      households: {
        selectSingle: { data: householdData, error: null },
      },
    };
    adminResults = {};

    const res = await fetch(`${baseUrl}/api/households/${HOUSEHOLD_ID}`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.household).toBeDefined();
    expect(body.household.id).toBe(HOUSEHOLD_ID);
    expect(body.household.name).toBe("Smith Family");
    expect(body.members).toBeDefined();
    expect(Array.isArray(body.members)).toBe(true);
    expect(body.members.length).toBe(2);
  });

  it("Step 6: Head removes the member", async () => {
    currentUserId = HEAD_USER_ID;
    currentUserEmail = HEAD_EMAIL;
    resetResults();

    adminResults = {
      households: {
        selectSingle: { data: householdData, error: null },
      },
      profiles: {
        updateResult: { data: null, error: null },
      },
    };

    const res = await fetch(
      `${baseUrl}/api/households/${HOUSEHOLD_ID}/members/${MEMBER_USER_ID}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_TOKEN}` },
      }
    );

    expect(res.status).toBe(204);
  });

  it("Step 7: Non-head member cannot invite", async () => {
    currentUserId = MEMBER_USER_ID;
    currentUserEmail = MEMBER_EMAIL;
    resetResults();

    // POST /:id/invite uses req.supabase (RLS client) for households.select
    rlsResults = {
      households: {
        selectSingle: {
          data: { ...householdData, head_of_household_id: HEAD_USER_ID },
          error: null,
        },
      },
    };
    adminResults = {};

    const res = await fetch(`${baseUrl}/api/households/${HOUSEHOLD_ID}/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ email: "newperson@example.com" }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Only the head of household can invite members");
  });

  it("Step 8: Cannot join if already in a household", async () => {
    currentUserId = MEMBER_USER_ID;
    currentUserEmail = MEMBER_EMAIL;
    resetResults();

    adminResults = {
      households: {
        selectSingle: { data: householdData, error: null },
      },
      profiles: {
        selectSingle: {
          data: { ...memberProfile, household_id: "other-household" },
          error: null,
        },
      },
    };

    const res = await fetch(`${baseUrl}/api/households/${HOUSEHOLD_ID}/join`, {
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
