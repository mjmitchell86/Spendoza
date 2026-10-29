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

const TEST_USER_ID = "user-123";
const TEST_USER_EMAIL = "Test@Example.com";
const TEST_TOKEN = "valid-access-token";
const HOUSEHOLD_ID = "hh-1";
const INVITE_CODE = "abc12345";
const INVITATION_ID = "inv-1";

const householdData = {
  id: HOUSEHOLD_ID,
  name: "Test Household",
  head_of_household_id: TEST_USER_ID,
};
const memberProfile = {
  id: TEST_USER_ID,
  display_name: "Test User",
  household_id: HOUSEHOLD_ID,
};

const future = () => new Date(Date.now() + 3 * 86400_000).toISOString();
const past = () => new Date(Date.now() - 86400_000).toISOString();

// ---------------------------------------------------------------------------
// Generic chainable Supabase mock. Results are keyed "<table>.<first op>" with
// `list` (awaited chain) and `single` (.single()/.maybeSingle()).
// ---------------------------------------------------------------------------
type Result = { list?: any; single?: any };
type Call = { table: string; op: string; args: any[] };
let rlsResults: Record<string, Result> = {};
let adminResults: Record<string, Result> = {};
let rlsCalls: Call[] = [];
let adminCalls: Call[] = [];
const EMPTY = { data: null, error: null };

function makeFrom(results: () => Record<string, Result>, calls: () => Call[]) {
  return (table: string) => {
    let first = "";
    const chain: any = {};
    const record =
      (op: string) =>
      (...args: any[]) => {
        if (!first) first = op;
        calls().push({ table, op, args });
        return chain;
      };
    for (const op of [
      "select",
      "insert",
      "update",
      "delete",
      "upsert",
      "eq",
      "ilike",
      "gt",
      "order",
      "in",
    ]) {
      chain[op] = record(op);
    }
    const cfg = () => results()[`${table}.${first}`] ?? {};
    chain.single = () => Promise.resolve(cfg().single ?? EMPTY);
    chain.maybeSingle = () => Promise.resolve(cfg().single ?? EMPTY);
    chain.then = (resolve: any, reject?: any) =>
      Promise.resolve(cfg().list ?? EMPTY).then(resolve, reject);
    return chain;
  };
}

const mockRlsFrom = mock(
  makeFrom(
    () => rlsResults,
    () => rlsCalls
  )
);
const mockAdminFrom = mock(
  makeFrom(
    () => adminResults,
    () => adminCalls
  )
);
const mockGetUser = mock(() =>
  Promise.resolve({
    data: { user: { id: TEST_USER_ID, email: TEST_USER_EMAIL } },
    error: null,
  })
);

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

mock.module("../../services/household.service", () => ({
  generateHouseholdCode: () => "k3m9p2x7qz",
  deleteHousehold: mock(() => Promise.resolve()),
}));

const mockSendEmail = mock(
  (_to: string, _inviter: string, _household: string, _code: string) =>
    Promise.resolve()
);
mock.module("../../services/email.service", () => ({
  sendHouseholdInvitationEmail: mockSendEmail,
  sendReportEmail: mock(),
}));

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
  app.use("/api/household", requireAuth, householdsRouter);
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

function call(method: string, path: string, body?: unknown) {
  return fetch(`${baseUrl}/api/household${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TEST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const adminOps = (table: string, op: string) =>
  adminCalls.filter((c) => c.table === table && c.op === op);

beforeEach(() => {
  rlsCalls = [];
  adminCalls = [];
  mockSendEmail.mockClear();
  mockSendEmail.mockImplementation(() => Promise.resolve());
  mockGetUser.mockClear();
  mockGetUser.mockImplementation(() =>
    Promise.resolve({
      data: { user: { id: TEST_USER_ID, email: TEST_USER_EMAIL } },
      error: null,
    })
  );

  rlsResults = {
    "profiles.select": {
      single: { data: memberProfile, error: null },
      list: { data: [memberProfile], error: null },
    },
    "households.select": { single: { data: householdData, error: null } },
  };
  adminResults = {
    "household_invitations.insert": { list: EMPTY },
    "household_invitations.update": { list: EMPTY },
    "household_invitations.select": { list: { data: [], error: null } },
    "household_invitations.delete": {
      list: { data: [{ id: INVITATION_ID }], error: null },
    },
    "profiles.select": {
      single: { data: { household_id: null }, error: null },
    },
  };
});

// ===========================================================================
// POST /invite
// ===========================================================================
describe("POST /api/household/invite", () => {
  it("inserts a new invitation, emails it and returns 201", async () => {
    const res = await call("POST", "/invite", { email: "new@example.com" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ message: "Invitation sent" });
    expect(
      adminOps("household_invitations", "insert")[0].args[0]
    ).toMatchObject({
      household_id: HOUSEHOLD_ID,
      email: "new@example.com",
      invited_by: TEST_USER_ID,
      status: "pending",
    });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      "new@example.com",
      "Test User",
      "Test Household",
      ""
    );
    expect(mockSendEmail.mock.calls[0]).not.toContain(INVITE_CODE);
  });

  it("extends an existing pending invitation and resends (200, no insert)", async () => {
    adminResults["household_invitations.select"] = {
      list: { data: [{ id: INVITATION_ID }], error: null },
      single: { data: { id: INVITATION_ID }, error: null },
    };
    const before = Date.now();
    const res = await call("POST", "/invite", { email: "again@example.com" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "Invitation sent" });
    expect(adminOps("household_invitations", "insert")).toHaveLength(0);
    const update = adminOps("household_invitations", "update")[0];
    const expires = new Date(update.args[0].expires_at).getTime();
    expect(expires).toBeGreaterThanOrEqual(before + 7 * 86400_000 - 5000);
    expect(expires).toBeLessThanOrEqual(Date.now() + 7 * 86400_000 + 5000);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it("answers 502 and keeps the invitation when the email fails", async () => {
    mockSendEmail.mockImplementation(() => Promise.reject(new Error("boom")));
    const res = await call("POST", "/invite", { email: "new@example.com" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "Couldn't send the invitation email. Try again.",
    });
    expect(adminOps("household_invitations", "insert")).toHaveLength(1);
    expect(adminOps("household_invitations", "delete")).toHaveLength(0);
  });

  it("answers 502 when a resend fails, keeping the row", async () => {
    adminResults["household_invitations.select"] = {
      single: { data: { id: INVITATION_ID }, error: null },
      list: { data: [{ id: INVITATION_ID }], error: null },
    };
    mockSendEmail.mockImplementation(() => Promise.reject(new Error("boom")));
    const res = await call("POST", "/invite", { email: "again@example.com" });
    expect(res.status).toBe(502);
    expect(adminOps("household_invitations", "delete")).toHaveLength(0);
  });

  it("rejects non-heads without sending", async () => {
    rlsResults["households.select"] = {
      single: {
        data: { ...householdData, head_of_household_id: "someone-else" },
        error: null,
      },
    };
    const res = await call("POST", "/invite", { email: "new@example.com" });
    expect(res.status).toBe(403);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// GET /invitations (head)
// ===========================================================================
describe("GET /api/household/invitations", () => {
  const rows = [
    {
      id: INVITATION_ID,
      email: "a@example.com",
      created_at: "2026-01-01T00:00:00Z",
      expires_at: "2026-01-08T00:00:00Z",
    },
  ];

  it("lists pending, unexpired invitations for the household", async () => {
    adminResults["household_invitations.select"] = {
      list: { data: rows, error: null },
    };
    const res = await call("GET", "/invitations");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(rows);
    const eqs = adminOps("household_invitations", "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["household_id", HOUSEHOLD_ID]);
    expect(eqs).toContainEqual(["status", "pending"]);
    expect(adminOps("household_invitations", "gt")[0].args[0]).toBe(
      "expires_at"
    );
  });

  it("is head-only", async () => {
    rlsResults["households.select"] = {
      single: {
        data: { ...householdData, head_of_household_id: "someone-else" },
        error: null,
      },
    };
    const res = await call("GET", "/invitations");
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// DELETE /invitations/:id (revoke)
// ===========================================================================
describe("DELETE /api/household/invitations/:id", () => {
  it("revokes a pending invitation of this household with 204", async () => {
    const res = await call("DELETE", `/invitations/${INVITATION_ID}`);
    expect(res.status).toBe(204);
    const eqs = adminOps("household_invitations", "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["id", INVITATION_ID]);
    expect(eqs).toContainEqual(["household_id", HOUSEHOLD_ID]);
  });

  it("answers 404 when it is not this household's invitation", async () => {
    adminResults["household_invitations.delete"] = {
      list: { data: [], error: null },
    };
    const res = await call("DELETE", `/invitations/${INVITATION_ID}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Invitation not found" });
  });

  it("is head-only", async () => {
    rlsResults["households.select"] = {
      single: {
        data: { ...householdData, head_of_household_id: "someone-else" },
        error: null,
      },
    };
    const res = await call("DELETE", `/invitations/${INVITATION_ID}`);
    expect(res.status).toBe(403);
    expect(adminOps("household_invitations", "delete")).toHaveLength(0);
  });
});

// ===========================================================================
// GET /invitations/mine
// ===========================================================================
describe("GET /api/household/invitations/mine", () => {
  it("lists the caller's pending, unexpired invitations by email", async () => {
    const exp = future();
    adminResults["household_invitations.select"] = {
      list: {
        data: [
          {
            id: INVITATION_ID,
            expires_at: exp,
            households: { name: "The Smiths" },
            inviter: { display_name: "Matt" },
          },
        ],
        error: null,
      },
    };
    const res = await call("GET", "/invitations/mine");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        id: INVITATION_ID,
        household_name: "The Smiths",
        inviter_name: "Matt",
        expires_at: exp,
      },
    ]);
    // case-insensitive match against the auth email, no user-id scoping needed
    expect(adminOps("household_invitations", "ilike")[0].args).toEqual([
      "email",
      "Test@Example.com",
    ]);
    const eqs = adminOps("household_invitations", "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["status", "pending"]);
    expect(adminOps("household_invitations", "gt")[0].args[0]).toBe(
      "expires_at"
    );
  });

  it("escapes LIKE wildcards in the caller's email", async () => {
    mockGetUser.mockImplementation(() =>
      Promise.resolve({
        data: { user: { id: TEST_USER_ID, email: "a_b%c@example.com" } },
        error: null,
      })
    );
    await call("GET", "/invitations/mine");
    expect(adminOps("household_invitations", "ilike")[0].args[1]).toBe(
      "a\\_b\\%c@example.com"
    );
  });

  it("works for a user who is not in any household", async () => {
    rlsResults["profiles.select"] = {
      single: { data: { id: TEST_USER_ID, household_id: null }, error: null },
    };
    const res = await call("GET", "/invitations/mine");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

// ===========================================================================
// POST /invitations/:id/accept
// ===========================================================================
describe("POST /api/household/invitations/:id/accept", () => {
  const pending = (over: Record<string, unknown> = {}) => ({
    id: INVITATION_ID,
    household_id: HOUSEHOLD_ID,
    email: "test@example.com",
    status: "pending",
    expires_at: future(),
    ...over,
  });
  const setInvitation = (row: unknown) => {
    adminResults["household_invitations.select"] = {
      single: { data: row, error: null },
    };
  };
  const accept = () => call("POST", `/invitations/${INVITATION_ID}/accept`);

  it("joins the household and marks the invitation accepted (case-insensitive email)", async () => {
    setInvitation(pending());
    adminResults["profiles.select"] = {
      single: { data: { household_id: null }, error: null },
      list: { data: [{ id: "u1" }], error: null },
    };
    const res = await accept();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      message: "Joined household successfully",
    });
    expect(adminOps("profiles", "update")[0].args[0]).toEqual({
      household_id: HOUSEHOLD_ID,
    });
    const updates = adminOps("household_invitations", "update");
    expect(updates.some((u) => u.args[0].status === "accepted")).toBe(true);
  });

  it("answers 404 for a missing invitation", async () => {
    setInvitation(null);
    const res = await accept();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Invitation not found" });
  });

  it("answers 404 for another email", async () => {
    setInvitation(pending({ email: "someone-else@example.com" }));
    const res = await accept();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Invitation not found" });
    expect(adminOps("profiles", "update")).toHaveLength(0);
  });

  it("answers 404 for a declined invitation", async () => {
    setInvitation(pending({ status: "declined" }));
    expect((await accept()).status).toBe(404);
  });

  it("answers 404 for a revoked invitation (row gone or status revoked)", async () => {
    setInvitation(pending({ status: "revoked" }));
    expect((await accept()).status).toBe(404);
  });

  it("answers 404 for another email even when expired", async () => {
    setInvitation(
      pending({ email: "someone-else@example.com", expires_at: past() })
    );
    const res = await accept();
    expect(res.status).toBe(404);
  });

  it("answers 400 for the caller's own expired invitation", async () => {
    setInvitation(pending({ expires_at: past() }));
    const res = await accept();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "This invitation has expired" });
    expect(adminOps("profiles", "update")).toHaveLength(0);
  });

  it("refuses when already in a household", async () => {
    setInvitation(pending());
    adminResults["profiles.select"] = {
      single: { data: { household_id: "other-hh" }, error: null },
    };
    const res = await accept();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Already a member of a household",
    });
  });

  it("refuses when the household is full", async () => {
    setInvitation(pending());
    adminResults["profiles.select"] = {
      single: { data: { household_id: null }, error: null },
      list: {
        data: Array.from({ length: 10 }, (_, i) => ({ id: `u${i}` })),
        error: null,
      },
    };
    const res = await accept();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Household has reached the 10-member limit",
    });
  });
});

// ===========================================================================
// POST /invitations/:id/decline
// ===========================================================================
describe("POST /api/household/invitations/:id/decline", () => {
  const decline = () => call("POST", `/invitations/${INVITATION_ID}/decline`);
  const setInvitation = (row: unknown) => {
    adminResults["household_invitations.select"] = {
      single: { data: row, error: null },
    };
  };

  it("marks the invitation declined and returns 204", async () => {
    setInvitation({
      id: INVITATION_ID,
      household_id: HOUSEHOLD_ID,
      email: "TEST@example.com",
      status: "pending",
      expires_at: future(),
    });
    const res = await decline();
    expect(res.status).toBe(204);
    expect(adminOps("household_invitations", "update")[0].args[0]).toEqual({
      status: "declined",
    });
  });

  it("answers 404 for another email", async () => {
    setInvitation({
      id: INVITATION_ID,
      household_id: HOUSEHOLD_ID,
      email: "other@example.com",
      status: "pending",
      expires_at: future(),
    });
    const res = await decline();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Invitation not found" });
    expect(adminOps("household_invitations", "update")).toHaveLength(0);
  });

  it("answers 404 for a missing invitation", async () => {
    setInvitation(null);
    expect((await decline()).status).toBe(404);
  });
});
