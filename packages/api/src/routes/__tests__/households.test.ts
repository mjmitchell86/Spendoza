import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  mock,
} from "bun:test";
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
const NEW_HOUSEHOLD_CODE = "k3m9p2x7qz";

const householdData = {
  id: HOUSEHOLD_ID,
  name: "Test Household",
  head_of_household_id: TEST_USER_ID,
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
          eq: (...eqArgs: any[]) => {
            calls.push({ table, op: "select.eq", args: eqArgs });
            return {
              single: () =>
                Promise.resolve(
                  cfg.selectSingle ?? { data: null, error: null }
                ),
              maybeSingle: () =>
                Promise.resolve(
                  "selectMaybeSingle" in cfg
                    ? cfg.selectMaybeSingle
                    : (cfg.selectSingle ?? { data: null, error: null })
                ),
              eq: (...eq2Args: any[]) => {
                calls.push({ table, op: "select.eq.eq", args: eq2Args });
                return {
                  single: () =>
                    Promise.resolve(
                      cfg.selectSingle ?? { data: null, error: null }
                    ),
                  maybeSingle: () =>
                    Promise.resolve(
                      "selectMaybeSingle" in cfg
                        ? cfg.selectMaybeSingle
                        : (cfg.selectSingle ?? { data: null, error: null })
                    ),
                };
              },
              // For member list: .select("...").eq("household_id", id)
              ...(cfg.selectList
                ? Promise.resolve(cfg.selectList)
                : Promise.resolve({ data: [], error: null })),
              then: (cfg.selectList ?? { data: [], error: null }).then
                ? undefined
                : (resolve: any) =>
                    resolve(cfg.selectList ?? { data: [], error: null }),
            };
          },
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
              Promise.resolve(cfg.updateSingle ?? { data: null, error: null }),
          }),
          then: (resolve: any, reject?: any) => {
            const result = cfg.updateResult ?? { data: null, error: null };
            return Promise.resolve(result).then(resolve, reject);
          },
        });
        return { eq: () => makeEq() };
      },
      upsert: (data: any, opts?: any) => {
        calls.push({ table, op: "upsert", args: data });
        calls.push({ table, op: "upsert.opts", args: opts });
        return {
          select: () =>
            Promise.resolve(
              cfg.upsertResult ?? {
                data: [{ household_id: data.household_id, code: data.code }],
                error: null,
              }
            ),
        };
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
  generateHouseholdCode: () => NEW_HOUSEHOLD_CODE,
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
    household_invite_codes: {
      selectSingle: {
        data: { household_id: HOUSEHOLD_ID, code: INVITE_CODE },
        error: null,
      },
      insertResult: { data: null, error: null },
      updateResult: { data: null, error: null },
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
    household_invite_codes: {
      selectSingle: {
        data: { household_id: HOUSEHOLD_ID, code: INVITE_CODE },
        error: null,
      },
      insertResult: { data: null, error: null },
      updateResult: { data: null, error: null },
    },
  };
});

// ===========================================================================
// POST /api/households — create household
// ===========================================================================
describe("POST /api/households", () => {
  const url = () => `${baseUrl}/api/households`;

  beforeEach(() => {
    rlsResults.profiles.selectSingle = {
      data: { ...memberProfile, household_id: null },
      error: null,
    };
  });

  it("returns 400 when the caller already belongs to a household", async () => {
    rlsResults.profiles.selectSingle = {
      data: { ...memberProfile, household_id: "other-household" },
      error: null,
    };
    const res = await fetch(url(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ name: "Second Household" }),
    });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(
      "Leave your household before creating a new one"
    );
    expect(
      [...rlsCalls, ...adminCalls].some(
        (c) => c.table === "households" && c.op === "insert"
      )
    ).toBe(false);
  });

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
    expect(body.invite_code).toBe(NEW_HOUSEHOLD_CODE);
    expect(body.head_of_household_id).toBe(TEST_USER_ID);
  });

  it("creates the household with a 10-character invite code", async () => {
    await fetch(url(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ name: "Test Household" }),
    });

    const insert = adminCalls.find(
      (c) => c.table === "household_invite_codes" && c.op === "insert"
    );
    expect(insert?.args).toEqual({
      household_id: HOUSEHOLD_ID,
      code: NEW_HOUSEHOLD_CODE,
    });
    expect(NEW_HOUSEHOLD_CODE).toHaveLength(10);
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
    // Route uses req.supabase (RLS client), so update rlsResults
    rlsResults.profiles.selectSingle = {
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
// Invite code visibility and rotation
// ===========================================================================
describe("invite code visibility", () => {
  it("includes invite_code for the head", async () => {
    const res = await fetch(`${baseUrl}/api/households/${HOUSEHOLD_ID}`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    const body = await res.json();
    expect(body.household.invite_code).toBe(INVITE_CODE);
    expect(rlsCalls).toContainEqual({
      table: "household_invite_codes",
      op: "select.eq",
      args: ["household_id", HOUSEHOLD_ID],
    });
  });

  it("omits the invite_code key entirely for non-heads", async () => {
    rlsResults.households.selectSingle = {
      data: { ...householdData, head_of_household_id: "someone-else" },
      error: null,
    };
    const res = await fetch(`${baseUrl}/api/households/${HOUSEHOLD_ID}`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect("invite_code" in body.household).toBe(false);
    expect(rlsCalls.some((c) => c.table === "household_invite_codes")).toBe(
      false
    );
    expect(body.household.name).toBe("Test Household");
  });
});

describe("POST /api/households/:id/invite-code", () => {
  const post = (path: string) =>
    fetch(`${baseUrl}/api/households/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
  const householdUpdates = () =>
    [...rlsCalls, ...adminCalls].filter(
      (c) => c.table === "household_invite_codes" && c.op === "upsert"
    );

  it("rotates the code for the head", async () => {
    const res = await post(`${HOUSEHOLD_ID}/invite-code`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invite_code).toBe(NEW_HOUSEHOLD_CODE);
    expect(body.invite_code).toHaveLength(10);
    const updates = householdUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].args).toMatchObject({
      household_id: HOUSEHOLD_ID,
      code: NEW_HOUSEHOLD_CODE,
    });
    expect(adminCalls).toContainEqual({
      table: "household_invite_codes",
      op: "upsert.opts",
      args: { onConflict: "household_id" },
    });
    expect(adminCalls).toContainEqual(
      expect.objectContaining({ table: "household_invite_codes", op: "upsert" })
    );
    expect(
      [...rlsCalls, ...adminCalls].some(
        (c) => c.table === "households" && c.op === "update"
      )
    ).toBe(false);
  });

  it("works on the resolved-household route too", async () => {
    const res = await post("invite-code");
    expect(res.status).toBe(200);
    expect((await res.json()).invite_code).toBe(NEW_HOUSEHOLD_CODE);
  });

  it("returns 403 for a non-head and does not update", async () => {
    rlsResults.households.selectSingle = {
      data: { ...householdData, head_of_household_id: "someone-else" },
      error: null,
    };
    adminResults.households.selectSingle = {
      data: { ...householdData, head_of_household_id: "someone-else" },
      error: null,
    };
    const res = await post(`${HOUSEHOLD_ID}/invite-code`);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(
      "Only the head of household can change the invite code"
    );
    expect(householdUpdates()).toHaveLength(0);
  });

  it("retries once on a unique violation", async () => {
    const results = [
      { data: null, error: { code: "23505", message: "duplicate" } },
      {
        data: [{ household_id: HOUSEHOLD_ID, code: NEW_HOUSEHOLD_CODE }],
        error: null,
      },
    ];
    const cfg = {
      ...adminResults.household_invite_codes,
      get upsertResult() {
        return (
          results.shift() ?? {
            data: [{ household_id: HOUSEHOLD_ID, code: NEW_HOUSEHOLD_CODE }],
            error: null,
          }
        );
      },
    };
    adminResults.household_invite_codes = cfg;
    const res = await post(`${HOUSEHOLD_ID}/invite-code`);
    expect(res.status).toBe(200);
    expect(householdUpdates()).toHaveLength(2);
  });

  it("gives up after 3 unique violations with a 500", async () => {
    const cfg = {
      ...adminResults.household_invite_codes,
      upsertResult: { data: null, error: { code: "23505", message: "dup" } },
    };
    adminResults.household_invite_codes = cfg;
    const res = await post(`${HOUSEHOLD_ID}/invite-code`);
    expect(res.status).toBe(500);
    expect(householdUpdates()).toHaveLength(3);
  });

  it("persists even when no code row exists yet (upsert returns the row)", async () => {
    adminResults.household_invite_codes = {
      ...adminResults.household_invite_codes,
      selectSingle: { data: null, error: null },
    };
    const res = await post(`${HOUSEHOLD_ID}/invite-code`);
    expect(res.status).toBe(200);
    expect((await res.json()).invite_code).toBe(NEW_HOUSEHOLD_CODE);
    expect(householdUpdates()).toHaveLength(1);
  });

  it("fails if the upsert stored no row", async () => {
    adminResults.household_invite_codes = {
      ...adminResults.household_invite_codes,
      upsertResult: { data: [], error: null },
    };
    const res = await post(`${HOUSEHOLD_ID}/invite-code`);
    expect(res.status).toBe(500);
  });

  it("does not retry other errors", async () => {
    const cfg = {
      ...adminResults.household_invite_codes,
      upsertResult: { data: null, error: { code: "XX000", message: "boom" } },
    };
    adminResults.household_invite_codes = cfg;
    const res = await post(`${HOUSEHOLD_ID}/invite-code`);
    expect(res.status).toBe(500);
    expect(householdUpdates()).toHaveLength(1);
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
    // Route inviteHandler uses req.supabase (RLS client)
    rlsResults.households.selectSingle = {
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
// POST /api/households/join — join with only the invite code
// ===========================================================================
describe("POST /api/households/join", () => {
  const post = (body: unknown) =>
    fetch(`${baseUrl}/api/households/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify(body),
    });

  it("adds the caller to the household whose code matches", async () => {
    adminResults.profiles.selectSingle = {
      data: { ...memberProfile, household_id: null },
      error: null,
    };

    const res = await post({ invite_code: INVITE_CODE });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("Joined household successfully");
    expect(adminCalls).toContainEqual({
      table: "household_invite_codes",
      op: "select.eq",
      args: ["code", INVITE_CODE],
    });
    expect(adminCalls).toContainEqual({
      table: "profiles",
      op: "update",
      args: { household_id: HOUSEHOLD_ID },
    });
  });

  it("normalizes a formatted code before looking it up", async () => {
    adminResults.household_invite_codes.selectMaybeSingle = {
      data: { household_id: HOUSEHOLD_ID, code: "abc12345xy" },
      error: null,
    };
    adminResults.profiles.selectSingle = {
      data: { ...memberProfile, household_id: null },
      error: null,
    };

    const res = await post({ invite_code: "ABC12-345XY" });

    expect(res.status).toBe(200);
    expect(adminCalls).toContainEqual({
      table: "household_invite_codes",
      op: "select.eq",
      args: ["code", "abc12345xy"],
    });
  });

  it("returns 400 Invalid invite code when no household has that code", async () => {
    adminResults.household_invite_codes.selectMaybeSingle = {
      data: null,
      error: null,
    };
    adminResults.profiles.selectSingle = {
      data: { ...memberProfile, household_id: null },
      error: null,
    };

    const res = await post({ invite_code: "nomatch1" });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid invite code" });
    expect(adminCalls.some((c) => c.op === "update")).toBe(false);
  });

  it("returns 400 when the caller is already in a household", async () => {
    adminResults.profiles.selectSingle = {
      data: { ...memberProfile, household_id: "other-household" },
      error: null,
    };

    const res = await post({ invite_code: INVITE_CODE });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Already a member of a household",
    });
  });

  it("returns 400 when the household has 10 members", async () => {
    adminResults.profiles.selectSingle = {
      data: { ...memberProfile, household_id: null },
      error: null,
    };
    adminResults.profiles.selectList = {
      data: Array.from({ length: 10 }, (_, i) => ({ id: `user-${i}` })),
      error: null,
    };

    const res = await post({ invite_code: INVITE_CODE });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Household has reached the 10-member limit",
    });
  });

  it("returns 429 after 5 failed attempts by the same user", async () => {
    // A different caller, so earlier tests' failures don't count toward this one
    mockGetUser.mockImplementation(() =>
      Promise.resolve({
        data: { user: { id: "guesser-1", email: "guesser@example.com" } },
        error: null,
      })
    );
    adminResults.households.selectMaybeSingle = { data: null, error: null };
    adminResults.profiles.selectSingle = {
      data: { ...memberProfile, id: "guesser-1", household_id: null },
      error: null,
    };

    for (let i = 0; i < 5; i++) {
      expect((await post({ invite_code: `guess${i}` })).status).toBe(400);
    }
    const res = await post({ invite_code: "guess5" });

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "Too many attempts. Try again in 15 minutes.",
    });
  });

  it("validates the body", async () => {
    const res = await post({});

    expect(res.status).toBe(400);
    expect(adminCalls.some((c) => c.table === "households")).toBe(false);
  });
});

// ===========================================================================
// DELETE /api/households/:id/members/:userId — remove member
// ===========================================================================
describe("DELETE /api/households/:id/members/:userId", () => {
  const url = (hhId: string, userId: string) =>
    `${baseUrl}/api/households/${hhId}/members/${userId}`;

  const del = (userId = "user-456") =>
    fetch(url(HOUSEHOLD_ID, userId), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

  it("returns 204, clears the member and rotates the invite code", async () => {
    adminResults.profiles.selectMaybeSingle = {
      data: { id: "user-456" },
      error: null,
    };
    const res = await del();

    expect(res.status).toBe(204);
    expect(adminCalls).toContainEqual({
      table: "profiles",
      op: "select.eq",
      args: ["id", "user-456"],
    });
    expect(adminCalls).toContainEqual({
      table: "profiles",
      op: "select.eq.eq",
      args: ["household_id", HOUSEHOLD_ID],
    });
    expect(adminCalls).toContainEqual({
      table: "profiles",
      op: "update",
      args: { household_id: null },
    });
    const upserts = adminCalls.filter(
      (c) => c.table === "household_invite_codes" && c.op === "upsert"
    );
    expect(upserts).toHaveLength(1);
    expect(upserts[0].args).toMatchObject({
      household_id: HOUSEHOLD_ID,
      code: NEW_HOUSEHOLD_CODE,
    });
  });

  it("returns 500 and changes nothing when rotation fails", async () => {
    adminResults.profiles.selectMaybeSingle = {
      data: { id: "user-456" },
      error: null,
    };
    adminResults.household_invite_codes.upsertResult = {
      data: null,
      error: { code: "XX000", message: "boom" },
    };
    const res = await del();

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Failed to remove member");
    expect(
      adminCalls.some((c) => c.table === "profiles" && c.op === "update")
    ).toBe(false);
  });

  it("returns 500 when clearing the profile fails, and a retry succeeds", async () => {
    adminResults.profiles.selectMaybeSingle = {
      data: { id: "user-456" },
      error: null,
    };
    adminResults.profiles.updateResult = {
      data: null,
      error: { message: "db down" },
    };
    const res = await del();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Failed to remove member");

    adminResults.profiles.updateResult = { data: null, error: null };
    const retry = await del();
    expect(retry.status).toBe(204);
  });

  it("returns 404 for a user who is not in this household", async () => {
    adminResults.profiles.selectMaybeSingle = { data: null, error: null };
    const res = await del("user-in-another-household");

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Member not found in this household");
    expect(
      adminCalls.some((c) => c.table === "profiles" && c.op === "update")
    ).toBe(false);
    expect(adminCalls.some((c) => c.op === "upsert")).toBe(false);
  });

  it("makes the old code invalid for joining afterwards", async () => {
    adminResults.profiles.selectMaybeSingle = {
      data: { id: "user-456" },
      error: null,
    };
    expect((await del()).status).toBe(204);

    // The old code no longer exists in household_invite_codes
    adminResults.household_invite_codes.selectMaybeSingle = {
      data: null,
      error: null,
    };
    adminResults.profiles.selectMaybeSingle = {
      data: null,
      error: null,
    };
    adminResults.profiles.selectSingle = {
      data: { ...memberProfile, household_id: null },
      error: null,
    };
    const res = await fetch(`${baseUrl}/api/households/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ invite_code: INVITE_CODE }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid invite code" });
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

    // Route updateSharingHandler uses req.supabase (RLS client)
    rlsResults.profiles.updateSingle = {
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

// ===========================================================================
// POST /api/households/:id/transfer - the old head must not keep the code
// ===========================================================================
describe("POST /api/households/:id/transfer", () => {
  it("performs the update with the admin client", async () => {
    adminResults.households.updateSingle = {
      data: { ...householdData, head_of_household_id: "user-456" },
      error: null,
    };
    const res = await fetch(
      `${baseUrl}/api/households/${HOUSEHOLD_ID}/transfer`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_TOKEN}`,
        },
        body: JSON.stringify({
          new_head_id: "00000000-0000-4000-8000-000000000456",
        }),
      }
    );
    expect(res.status).toBe(200);
    expect(adminCalls).toContainEqual({
      table: "households",
      op: "update",
      args: { head_of_household_id: "00000000-0000-4000-8000-000000000456" },
    });
    expect(
      rlsCalls.some((c) => c.table === "households" && c.op === "update")
    ).toBe(false);
  });

  it("returns the household without invite_code", async () => {
    adminResults.households.updateSingle = {
      data: { ...householdData, head_of_household_id: "user-456" },
      error: null,
    };

    const res = await fetch(
      `${baseUrl}/api/households/${HOUSEHOLD_ID}/transfer`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_TOKEN}`,
        },
        body: JSON.stringify({
          new_head_id: "00000000-0000-4000-8000-000000000456",
        }),
      }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.head_of_household_id).toBe("user-456");
    expect("invite_code" in body).toBe(false);
  });
});
