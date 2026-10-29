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
      "limit",
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
      list: { data: [], error: null },
    },
  };
});

function asUser(id: string, email: string = TEST_USER_EMAIL) {
  mockGetUser.mockImplementation(() =>
    Promise.resolve({ data: { user: { id, email } }, error: null })
  );
}

const noHeadHousehold = () => {
  rlsResults["households.select"] = {
    single: {
      data: { ...householdData, head_of_household_id: "someone-else" },
      error: null,
    },
  };
};

// ===========================================================================
// POST /invite
// ===========================================================================
describe("POST /api/household/invite", () => {
  const existingRow = (over: Record<string, unknown> = {}) => ({
    id: INVITATION_ID,
    code: "abcdefghjk",
    expires_at: future(),
    last_sent_at: past(),
    ...over,
  });
  const setExisting = (row: unknown) => {
    adminResults["household_invitations.select"] = {
      ...adminResults["household_invitations.select"],
      single: { data: row, error: null },
    };
  };
  const invite = (email = "new@example.com") =>
    call("POST", "/invite", { email });

  it("inserts a lowercased invitation with its own code, emails it, 201", async () => {
    const res = await invite("New@Example.com");
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ message: "Invitation sent" });
    const row = adminOps("household_invitations", "insert")[0].args[0];
    expect(row).toMatchObject({
      household_id: HOUSEHOLD_ID,
      email: "new@example.com",
      invited_by: TEST_USER_ID,
      status: "pending",
    });
    expect(row.code).toBe("k3m9p2x7qz");
    expect(mockSendEmail).toHaveBeenCalledWith(
      "new@example.com",
      "Test User",
      "Test Household",
      "k3m9p2x7qz"
    );
    expect(mockSendEmail.mock.calls[0]).not.toContain(INVITE_CODE);
  });

  it("falls back to 'A Spendoza member' when the inviter has no name", async () => {
    rlsResults["profiles.select"] = {
      single: { data: { ...memberProfile, display_name: "" }, error: null },
    };
    await invite();
    expect(mockSendEmail.mock.calls[0][1]).toBe("A Spendoza member");
  });

  it("matches the existing invitation by lowercased email with eq", async () => {
    await invite("New@Example.com");
    const eqs = adminOps("household_invitations", "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["email", "new@example.com"]);
    expect(adminOps("household_invitations", "ilike")).toHaveLength(0);
  });

  it("extends a pending invitation and resends it with the same code (200)", async () => {
    setExisting(existingRow());
    const before = Date.now();
    const res = await invite("again@example.com");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "Invitation sent" });
    expect(adminOps("household_invitations", "insert")).toHaveLength(0);
    const update = adminOps("household_invitations", "update")[0].args[0];
    const expires = new Date(update.expires_at).getTime();
    expect(expires).toBeGreaterThanOrEqual(before + 7 * 86400_000 - 5000);
    expect(expires).toBeLessThanOrEqual(Date.now() + 7 * 86400_000 + 5000);
    expect(update.last_sent_at).toBeDefined();
    expect("code" in update).toBe(false);
    expect(mockSendEmail.mock.calls[0][3]).toBe("abcdefghjk");
  });

  it("refreshes an expired pending invitation instead of inserting another", async () => {
    setExisting(existingRow({ expires_at: past(), last_sent_at: new Date() }));
    const res = await invite("again@example.com");
    expect(res.status).toBe(200);
    expect(adminOps("household_invitations", "insert")).toHaveLength(0);
    const update = adminOps("household_invitations", "update")[0].args[0];
    expect(new Date(update.expires_at).getTime()).toBeGreaterThan(Date.now());
    expect(mockSendEmail.mock.calls[0][3]).toBe("abcdefghjk");
  });

  it("gives a legacy pending invitation without a code one on resend", async () => {
    setExisting(existingRow({ code: null }));
    const res = await invite("again@example.com");
    expect(res.status).toBe(200);
    const update = adminOps("household_invitations", "update")[0].args[0];
    expect(update.code).toBe("k3m9p2x7qz");
    expect(mockSendEmail.mock.calls[0][3]).toBe("k3m9p2x7qz");
  });

  it("refuses to resend within 10 minutes (429)", async () => {
    setExisting(
      existingRow({ last_sent_at: new Date(Date.now() - 60_000).toISOString() })
    );
    const res = await invite("again@example.com");
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "You just sent this invitation. Try again in a few minutes.",
    });
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(adminOps("household_invitations", "update")).toHaveLength(0);
  });

  it("counts members and live pending invitations with the admin client", async () => {
    adminResults["profiles.select"] = {
      ...adminResults["profiles.select"],
      list: {
        data: Array.from({ length: 8 }, (_, i) => ({ id: `u${i}` })),
        error: null,
      },
    };
    adminResults["household_invitations.select"] = {
      ...adminResults["household_invitations.select"],
      list: { data: [{ id: "a" }, { id: "b" }], error: null },
    };
    const res = await invite();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Household has reached the 10-member limit",
    });
    expect(rlsCalls.some((c) => c.table === "household_invitations")).toBe(
      false
    );
    const gts = adminOps("household_invitations", "gt");
    expect(gts.length).toBeGreaterThan(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("still applies the member limit to a resend", async () => {
    setExisting(existingRow());
    adminResults["profiles.select"] = {
      ...adminResults["profiles.select"],
      list: {
        data: Array.from({ length: 10 }, (_, i) => ({ id: `u${i}` })),
        error: null,
      },
    };
    const res = await invite("again@example.com");
    expect(res.status).toBe(400);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("does not count the invitation being resent against the limit", async () => {
    setExisting(existingRow());
    adminResults["profiles.select"] = {
      ...adminResults["profiles.select"],
      list: {
        data: Array.from({ length: 9 }, (_, i) => ({ id: `u${i}` })),
        error: null,
      },
    };
    adminResults["household_invitations.select"] = {
      ...adminResults["household_invitations.select"],
      list: { data: [{ id: INVITATION_ID }], error: null },
    };
    const res = await invite("again@example.com");
    expect(res.status).toBe(200);
  });

  it("answers 502 and keeps the invitation when the email fails", async () => {
    mockSendEmail.mockImplementation(() => Promise.reject(new Error("boom")));
    const res = await invite();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "Couldn't send the invitation email. Try again.",
    });
    expect(adminOps("household_invitations", "insert")).toHaveLength(1);
    expect(adminOps("household_invitations", "delete")).toHaveLength(0);
  });

  it("answers 502 when a resend fails, keeping the row", async () => {
    setExisting(existingRow());
    mockSendEmail.mockImplementation(() => Promise.reject(new Error("boom")));
    const res = await invite("again@example.com");
    expect(res.status).toBe(502);
    expect(adminOps("household_invitations", "delete")).toHaveLength(0);
  });

  it("rejects non-heads without sending", async () => {
    noHeadHousehold();
    const res = await invite();
    expect(res.status).toBe(403);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("limits each head to 20 invitations per hour (429)", async () => {
    asUser("busy-head");
    rlsResults["households.select"] = {
      single: {
        data: { ...householdData, head_of_household_id: "busy-head" },
        error: null,
      },
    };
    for (let i = 0; i < 20; i++) {
      expect((await invite(`p${i}@example.com`)).status).toBe(201);
    }
    const res = await invite("one-too-many@example.com");
    expect(res.status).toBe(429);
    // another head is unaffected
    asUser("calm-head");
    rlsResults["households.select"] = {
      single: {
        data: { ...householdData, head_of_household_id: "calm-head" },
        error: null,
      },
    };
    expect((await invite("fine@example.com")).status).toBe(201);
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
    // the code is never sent to the head's client
    expect(adminOps("household_invitations", "select")[0].args[0]).not.toMatch(
      /code/
    );
  });

  it("is head-only", async () => {
    noHeadHousehold();
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
    noHeadHousehold();
    const res = await call("DELETE", `/invitations/${INVITATION_ID}`);
    expect(res.status).toBe(403);
    expect(adminOps("household_invitations", "delete")).toHaveLength(0);
  });
});

// ===========================================================================
// GET /invitations/mine
// ===========================================================================
describe("GET /api/household/invitations/mine", () => {
  it("lists the caller's pending invitations by lowercased email, without the code", async () => {
    const exp = future();
    adminResults["household_invitations.select"] = {
      list: {
        data: [
          {
            id: INVITATION_ID,
            expires_at: exp,
            code: "abcdefghjk",
            households: { name: "The Smiths" },
            inviter: { display_name: "Matt" },
          },
        ],
        error: null,
      },
    };
    const res = await call("GET", "/invitations/mine");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([
      {
        id: INVITATION_ID,
        household_name: "The Smiths",
        inviter_name: "Matt",
        expires_at: exp,
      },
    ]);
    expect(JSON.stringify(body)).not.toContain("abcdefghjk");
    const select = adminOps("household_invitations", "select")[0].args[0];
    expect(select).not.toMatch(/\bcode\b/);
    const eqs = adminOps("household_invitations", "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["email", "test@example.com"]);
    expect(eqs).toContainEqual(["status", "pending"]);
    expect(adminOps("household_invitations", "ilike")).toHaveLength(0);
    expect(adminOps("household_invitations", "gt")[0].args[0]).toBe(
      "expires_at"
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
  let n = 0;
  beforeEach(() => {
    // each test gets its own user so the failed-attempt limiter doesn't bleed
    asUser(`invitee-${++n}`);
  });
  const pending = (over: Record<string, unknown> = {}) => ({
    id: INVITATION_ID,
    household_id: HOUSEHOLD_ID,
    email: "test@example.com",
    status: "pending",
    code: "abcdefghjk",
    expires_at: future(),
    ...over,
  });
  const setInvitation = (row: unknown) => {
    adminResults["household_invitations.select"] = {
      single: { data: row, error: null },
    };
  };
  const accept = (body: unknown = { code: "ABCDE-FGHJK" }) =>
    call("POST", `/invitations/${INVITATION_ID}/accept`, body);

  it("joins the household with the right code (normalized) and marks it accepted", async () => {
    setInvitation(pending());
    adminResults["profiles.select"] = {
      single: { data: { household_id: null }, error: null },
      list: { data: [{ id: "u1" }], error: null },
    };
    const res = await accept({ code: " abcde fghjk " });
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

  for (const [name, body] of [
    ["a wrong code", { code: "ZZZZZ-ZZZZZ" }],
    ["no code", {}],
    ["a non-string code", { code: 12345 }],
    ["an empty code", { code: "" }],
  ] as const) {
    it(`answers 404 for ${name}`, async () => {
      setInvitation(pending());
      const res = await accept(body);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Invitation not found" });
      expect(adminOps("profiles", "update")).toHaveLength(0);
    });
  }

  it("answers 404 for an invitation without a code (legacy row)", async () => {
    setInvitation(pending({ code: null }));
    expect((await accept()).status).toBe(404);
  });

  it("answers 404 for a missing invitation", async () => {
    setInvitation(null);
    const res = await accept();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Invitation not found" });
  });

  it("answers 404 for another email even with the right code", async () => {
    setInvitation(pending({ email: "someone-else@example.com" }));
    const res = await accept();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Invitation not found" });
    expect(adminOps("profiles", "update")).toHaveLength(0);
  });

  it("answers 404 for declined and revoked invitations", async () => {
    setInvitation(pending({ status: "declined" }));
    expect((await accept()).status).toBe(404);
    setInvitation(pending({ status: "revoked" }));
    expect((await accept()).status).toBe(404);
  });

  it("answers 404 for another email even when expired", async () => {
    setInvitation(
      pending({ email: "someone-else@example.com", expires_at: past() })
    );
    expect((await accept()).status).toBe(404);
  });

  it("answers 400 for the caller's own expired invitation with the right code", async () => {
    setInvitation(pending({ expires_at: past() }));
    const res = await accept();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "This invitation has expired" });
    expect(adminOps("profiles", "update")).toHaveLength(0);
  });

  it("answers 404, not 400, for an expired invitation with a wrong code", async () => {
    setInvitation(pending({ expires_at: past() }));
    expect((await accept({ code: "ZZZZZ-ZZZZZ" })).status).toBe(404);
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

  it("blocks a user after 5 failed attempts in 15 minutes (429)", async () => {
    setInvitation(pending());
    for (let i = 0; i < 5; i++) {
      expect((await accept({ code: `guess${i}` })).status).toBe(404);
    }
    const res = await accept({ code: "ABCDE-FGHJK" });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "Too many attempts. Try again in 15 minutes.",
    });
    expect(adminOps("profiles", "update")).toHaveLength(0);
  });

  it("does not count successful accepts against the limit", async () => {
    setInvitation(pending());
    adminResults["profiles.select"] = {
      single: { data: { household_id: null }, error: null },
      list: { data: [{ id: "u1" }], error: null },
    };
    for (let i = 0; i < 7; i++) {
      expect((await accept()).status).toBe(200);
    }
  });
});

// ===========================================================================
// POST /invitations/:id/decline
// ===========================================================================
describe("POST /api/household/invitations/:id/decline", () => {
  let n = 0;
  beforeEach(() => {
    asUser(`decliner-${++n}`);
  });
  const decline = (body: unknown = { code: "abcdefghjk" }) =>
    call("POST", `/invitations/${INVITATION_ID}/decline`, body);
  const row = (over: Record<string, unknown> = {}) => ({
    id: INVITATION_ID,
    household_id: HOUSEHOLD_ID,
    email: "test@example.com",
    status: "pending",
    code: "abcdefghjk",
    expires_at: future(),
    ...over,
  });
  const setInvitation = (r: unknown) => {
    adminResults["household_invitations.select"] = {
      single: { data: r, error: null },
    };
  };

  it("marks the invitation declined with the right code and returns 204", async () => {
    setInvitation(row());
    const res = await decline();
    expect(res.status).toBe(204);
    expect(adminOps("household_invitations", "update")[0].args[0]).toEqual({
      status: "declined",
    });
  });

  it("answers 404 for a wrong or missing code", async () => {
    setInvitation(row());
    expect((await decline({ code: "nope" })).status).toBe(404);
    expect((await decline({})).status).toBe(404);
    expect(adminOps("household_invitations", "update")).toHaveLength(0);
  });

  it("answers 404 for another email", async () => {
    setInvitation(row({ email: "other@example.com" }));
    const res = await decline();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Invitation not found" });
    expect(adminOps("household_invitations", "update")).toHaveLength(0);
  });

  it("answers 404 for a missing invitation", async () => {
    setInvitation(null);
    expect((await decline()).status).toBe(404);
  });

  it("shares the failed-attempt limit with accept (429)", async () => {
    setInvitation(row());
    for (let i = 0; i < 5; i++) {
      expect((await decline({ code: `guess${i}` })).status).toBe(404);
    }
    expect((await decline()).status).toBe(429);
  });
});
