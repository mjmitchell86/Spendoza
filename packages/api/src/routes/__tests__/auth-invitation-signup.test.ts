import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from "bun:test";
import type { Server } from "http";
import type { Router } from "express";

// ---------------------------------------------------------------------------
// Table-aware Supabase mock. Each query records its table, operation and
// filters, and resolves from the state below.
// ---------------------------------------------------------------------------
type Filter = ["eq" | "is" | "gt", string, unknown];
type Call = {
  table: string;
  op: "select" | "update";
  payload?: Record<string, unknown>;
  filters: Filter[];
};

const NOT_FOUND = { data: null, error: { message: "No rows", code: "PGRST116" } };
const NOW = Date.now();

interface Invitation {
  id: string;
  household_id: string;
  email: string;
  code: string;
  status: string;
  expires_at: string;
}

let invitations: Invitation[] = [];
let memberCount = 0;
let genericCodeValid = false;
let headTier = "pro";
let profileUpdateFails = false;
let calls: Call[] = [];

const mockCreateUser = mock((_args: Record<string, unknown>) =>
  Promise.resolve({
    data: { user: { id: "user-123", email: "new@example.com" } },
    error: null as unknown,
  })
);

function field(inv: Invitation, col: string): unknown {
  return (inv as unknown as Record<string, unknown>)[col];
}

function matches(inv: Invitation, filters: Filter[]): boolean {
  return filters.every(([op, col, val]) => {
    const v = field(inv, col);
    if (op === "eq") return v === val;
    if (op === "gt") return new Date(v as string).getTime() > new Date(val as string).getTime();
    return true;
  });
}

function resolve(c: Call): { data: unknown; error: unknown } {
  if (c.table === "invite_codes") {
    return genericCodeValid ? { data: { id: "code-1" }, error: null } : NOT_FOUND;
  }
  if (c.table === "household_invitations" && c.op === "select") {
    const inv = invitations.find((i) => matches(i, c.filters));
    return inv ? { data: inv, error: null } : NOT_FOUND;
  }
  if (c.table === "profiles" && c.op === "select") {
    const idFilter = c.filters.find((f) => f[1] === "id");
    if (idFilter) {
      return idFilter[2] === "head-1"
        ? { data: { subscription_tier: headTier }, error: null }
        : { data: { household_id: null }, error: null };
    }
    return {
      data: Array.from({ length: memberCount }, (_, i) => ({ id: `m${i}` })),
      error: null,
    };
  }
  if (c.table === "households" && c.op === "select") {
    return { data: { head_of_household_id: "head-1" }, error: null };
  }
  if (c.table === "profiles" && c.op === "update" && profileUpdateFails) {
    return { data: null, error: { message: "update failed" } };
  }
  if (c.table === "household_invitations" && c.op === "update") {
    for (const inv of invitations) {
      if (c.filters.every(([, col, val]) => field(inv, col) === val)) {
        Object.assign(inv, c.payload);
      }
    }
  }
  return { data: null, error: null };
}

function chain(table: string, op: "select" | "update", payload?: Record<string, unknown>) {
  const call: Call = { table, op, payload, filters: [] };
  calls.push(call);
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.eq = (col: string, val: unknown) => (call.filters.push(["eq", col, val]), c);
  c.is = (col: string, val: unknown) => (call.filters.push(["is", col, val]), c);
  c.gt = (col: string, val: unknown) => (call.filters.push(["gt", col, val]), c);
  c.single = () => Promise.resolve(resolve(call));
  c.maybeSingle = () => Promise.resolve(resolve(call));
  c.then = (res: (v: unknown) => void) => res(resolve(call));
  return c;
}

mock.module("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { admin: { createUser: mockCreateUser }, signInWithPassword: () => {} },
    from: (table: string) => ({
      select: () => chain(table, "select"),
      update: (payload: Record<string, unknown>) => chain(table, "update", payload),
    }),
  }),
}));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const express = (await import("express")).default;
  const { default: authRouter } = (await import("../auth")) as { default: Router };
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  await new Promise<void>((r) => {
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") baseUrl = `http://localhost:${addr.port}`;
      r();
    });
  });
});

afterAll(() => server?.close());

const BAD = "Invalid or already-used invite code";

function invitation(over: Partial<Invitation> = {}): Invitation {
  return {
    id: "inv-1",
    household_id: "hh-1",
    email: "new@example.com",
    code: "abcdefghjk",
    status: "pending",
    expires_at: new Date(NOW + 86_400_000).toISOString(),
    ...over,
  };
}

beforeEach(() => {
  calls = [];
  memberCount = 1;
  genericCodeValid = false;
  headTier = "pro";
  profileUpdateFails = false;
  invitations = [invitation()];
  mockCreateUser.mockClear();
});

const signup = (over: Record<string, unknown> = {}) =>
  fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "new@example.com",
      password: "securepass1",
      display_name: "New Person",
      invite_code: "abcdefghjk",
      ...over,
    }),
  });

const profileUpdates = () =>
  calls.filter((c) => c.table === "profiles" && c.op === "update");

describe("POST /api/auth/signup with a household invitation code", () => {
  it("creates the account, joins the household and accepts the invitation", async () => {
    const res = await signup();
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.joined_household).toBe(true);
    expect(body.household_full).toBeUndefined();
    expect(mockCreateUser).toHaveBeenCalledTimes(1);
    expect(mockCreateUser.mock.calls[0][0]).toMatchObject({
      email: "new@example.com",
      email_confirm: true,
    });
    expect(profileUpdates()).toHaveLength(1);
    expect(profileUpdates()[0].payload).toEqual({ household_id: "hh-1" });
    expect(invitations[0].status).toBe("accepted");
  });

  it("accepts the formatted code and any email case", async () => {
    const res = await signup({
      invite_code: "ABCDE-FGHJK",
      email: "New@Example.COM",
    });
    expect(res.status).toBe(201);
    expect((await res.json()).joined_household).toBe(true);
    expect(invitations[0].status).toBe("accepted");
  });

  it("rejects a different email with the bad-code error and creates no account", async () => {
    const res = await signup({ email: "other@example.com" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(BAD);
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(invitations[0].status).toBe("pending");
  });

  it("rejects an expired invitation", async () => {
    invitations = [invitation({ expires_at: new Date(NOW - 1000).toISOString() })];
    const res = await signup();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(BAD);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("rejects a revoked (deleted) invitation", async () => {
    invitations = [];
    const res = await signup();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(BAD);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("rejects an already accepted invitation", async () => {
    invitations = [invitation({ status: "accepted" })];
    const res = await signup();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(BAD);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("creates the account but does not join a full household", async () => {
    memberCount = 10;
    const res = await signup();
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.joined_household).toBe(false);
    expect(body.household_full).toBe(true);
    expect(mockCreateUser).toHaveBeenCalledTimes(1);
    expect(profileUpdates()).toHaveLength(0);
    expect(invitations[0].status).toBe("pending");
  });

  it("creates the account but keeps the invitation pending when the join write fails", async () => {
    profileUpdateFails = true;
    const res = await signup();
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.joined_household).toBe(false);
    expect(body.household_full).toBeUndefined();
    expect(mockCreateUser).toHaveBeenCalledTimes(1);
    expect(invitations[0].status).toBe("pending");
  });

  it("leaves generic sign-up invite codes unchanged", async () => {
    genericCodeValid = true;
    const res = await signup({ invite_code: "WELCOME1" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.joined_household).toBe(false);
    expect(calls.some((c) => c.table === "household_invitations")).toBe(false);
    expect(profileUpdates()).toHaveLength(0);
  });

  describe("with plan checks on", () => {
    const original = process.env.STRIPE_SECRET_KEY;
    beforeEach(() => {
      process.env.STRIPE_SECRET_KEY = "sk_test_123";
    });
    afterEach(() => {
      if (original === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = original;
    });

    it("joins a free new user to a Pro head's household", async () => {
      const res = await signup();
      expect(res.status).toBe(201);
      expect((await res.json()).joined_household).toBe(true);
      expect(invitations[0].status).toBe("accepted");
    });

    it("creates the account but does not join when the head is not on Pro", async () => {
      headTier = "free";
      const res = await signup();
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.joined_household).toBe(false);
      expect(body.household_not_on_plan).toBe(true);
      expect(body.household_full).toBeUndefined();
      expect(mockCreateUser).toHaveBeenCalledTimes(1);
      expect(profileUpdates()).toHaveLength(0);
      expect(invitations[0].status).toBe("pending");
    });
  });

  it("joins regardless of the head's plan when plan checks are off", async () => {
    headTier = "free";
    const res = await signup();
    expect((await res.json()).joined_household).toBe(true);
  });
});
