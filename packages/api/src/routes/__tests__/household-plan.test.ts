import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  mock,
} from "bun:test";
import type { Server } from "http";
import type { Router } from "express";

// ---------------------------------------------------------------------------
// Plan rule: members on any plan can use a household whose head is on Pro;
// creating a household and head-only management need the caller on Pro.
// One stateful Supabase mock serves both the RLS and the admin client.
// ---------------------------------------------------------------------------
const HEAD = "head-1";
const MEMBER = "member-1";
const HH = "hh-1";
const CODE = "abcdefghjk";

type Tier = "free" | "starter" | "pro";
interface UserRow {
  id: string;
  household_id: string | null;
  subscription_tier: Tier;
}

let users: Record<string, UserRow> = {};
let households: Record<string, { id: string; name: string; head_of_household_id: string }> = {};
let invitations: Array<{
  id: string;
  household_id: string;
  email: string;
  status: string;
  code: string;
  expires_at: string;
}> = [];
let currentUserId = MEMBER;

type Filter = [string, unknown];

function profileRow(u: UserRow) {
  return {
    ...u,
    display_name: u.id,
    income_sharing_mode: "all",
    expense_sharing_mode: "all",
  };
}

function resolve(table: string, op: string, filters: Filter[]) {
  const f = (col: string) => filters.find(([c]) => c === col)?.[1];
  const none = { data: null, error: null };
  if (table === "profiles") {
    if (f("id") !== undefined) {
      const u = users[f("id") as string];
      return u ? { data: profileRow(u), error: null } : none;
    }
    if (f("household_id") !== undefined) {
      return {
        data: Object.values(users)
          .filter((u) => u.household_id === f("household_id"))
          .map(profileRow),
        error: null,
      };
    }
  }
  if (table === "households" && op === "select") {
    const h = households[f("id") as string];
    return h ? { data: h, error: null } : none;
  }
  if (table === "household_invite_codes" && op === "select") {
    if (f("code") === CODE || f("household_id") === HH) {
      return { data: { household_id: HH, code: CODE }, error: null };
    }
    return none;
  }
  if (table === "household_invitations" && op === "select") {
    const inv = invitations.find((i) => i.id === f("id"));
    return inv ? { data: inv, error: null } : none;
  }
  return none;
}

function chain(table: string, op: string) {
  const filters: Filter[] = [];
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.eq = (col: string, val: unknown) => (filters.push([col, val]), c);
  for (const m of ["is", "gt", "order", "limit", "in"]) c[m] = () => c;
  c.single = () => Promise.resolve(resolve(table, op, filters));
  c.maybeSingle = () => Promise.resolve(resolve(table, op, filters));
  c.then = (res: (v: unknown) => void, rej?: (e: unknown) => void) =>
    Promise.resolve(
      op === "select" ? resolve(table, op, filters) : { data: null, error: null }
    ).then(res, rej);
  return c;
}

const client = {
  auth: {
    getUser: () =>
      Promise.resolve({
        data: { user: { id: currentUserId, email: `${currentUserId}@example.com` } },
        error: null,
      }),
    admin: { createUser: () => Promise.resolve({ data: null, error: null }) },
  },
  from: (table: string) => ({
    select: () => chain(table, "select"),
    update: () => chain(table, "update"),
    insert: () => chain(table, "insert"),
    delete: () => chain(table, "delete"),
    upsert: () => chain(table, "upsert"),
  }),
};

mock.module("@supabase/supabase-js", () => ({ createClient: () => client }));
mock.module("../../services/email.service", () => ({
  sendHouseholdInvitationEmail: () => Promise.resolve(),
  sendReportEmail: () => Promise.resolve({ success: true }),
}));
mock.module("../../services/household.service", () => ({
  generateHouseholdCode: () => "k3m9p2x7qz",
  deleteHousehold: () => Promise.resolve(),
}));

let server: Server;
let baseUrl: string;
const originalStripeKey = process.env.STRIPE_SECRET_KEY;

beforeAll(async () => {
  const express = (await import("express")).default;
  const { default: householdsRouter } = (await import("../households")) as {
    default: Router;
  };
  const { requireAuth } = await import("../../middleware/auth");
  const app = express();
  app.use(express.json());
  app.use("/api/households", requireAuth, householdsRouter);
  app.use("/api/household", requireAuth, householdsRouter);
  await new Promise<void>((r) => {
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") baseUrl = `http://localhost:${addr.port}`;
      r();
    });
  });
});

afterAll(() => server?.close());

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  currentUserId = MEMBER;
  users = {
    [HEAD]: { id: HEAD, household_id: HH, subscription_tier: "pro" },
    [MEMBER]: { id: MEMBER, household_id: HH, subscription_tier: "free" },
    outsider: { id: "outsider", household_id: null, subscription_tier: "free" },
  };
  households = { [HH]: { id: HH, name: "Home", head_of_household_id: HEAD } };
  invitations = [
    {
      id: "inv-1",
      household_id: HH,
      email: "outsider@example.com",
      status: "pending",
      code: CODE,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    },
  ];
});

afterEach(() => {
  if (originalStripeKey === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = originalStripeKey;
});

function call(method: string, path: string, body?: unknown) {
  return fetch(`${baseUrl}/api/household${path}`, {
    method,
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function expectUpgrade(res: Response, current: Tier = "free") {
  expect(res.status).toBe(403);
  expect(await res.json()).toEqual({
    error: "Upgrade required",
    required_tier: "pro",
    current_tier: current,
  });
}

describe("free member of a Pro head's household", () => {
  it("can view the household", async () => {
    expect((await call("GET", "")).status).toBe(200);
    expect((await call("GET", `/${HH}`)).status).toBe(200);
  });

  it("can leave", async () => {
    expect((await call("POST", "/leave")).status).toBe(200);
  });

  it("can edit their own sharing", async () => {
    const res = await call("PUT", "/sharing", {
      income_sharing_mode: "none",
      shared_income_amount: null,
      expense_sharing_mode: "none",
    });
    expect(res.status).toBe(200);
  });

  it("cannot invite, rotate, rename, delete, transfer or remove", async () => {
    await expectUpgrade(await call("POST", "/invite", { email: "a@b.co" }));
    await expectUpgrade(await call("POST", "/invite-code"));
    await expectUpgrade(await call("PATCH", "", { name: "New" }));
    await expectUpgrade(await call("DELETE", "", { confirm_name: "Home" }));
    await expectUpgrade(await call("POST", "/transfer", { new_head_id: HEAD }));
    await expectUpgrade(await call("DELETE", "/members/other"));
    await expectUpgrade(await call("GET", "/invitations"));
    await expectUpgrade(await call("DELETE", "/invitations/inv-1"));
    await expectUpgrade(await call("POST", `/${HH}/invite`, { email: "a@b.co" }));
    await expectUpgrade(await call("PATCH", `/${HH}`, { name: "New" }));
  });

  it("cannot create a household", async () => {
    currentUserId = "outsider";
    await expectUpgrade(await call("POST", "", { name: "Mine" }));
  });
});

describe("a free head", () => {
  it("gets the plan message on head-only routes", async () => {
    currentUserId = HEAD;
    users[HEAD].subscription_tier = "free";
    await expectUpgrade(await call("POST", "/invite", { email: "a@b.co" }));
    await expectUpgrade(await call("PATCH", "", { name: "New" }));
  });
});

describe("head drops to free", () => {
  it("members get 403 on GET", async () => {
    users[HEAD].subscription_tier = "free";
    await expectUpgrade(await call("GET", ""));
  });
});

describe("joining", () => {
  beforeEach(() => {
    currentUserId = "outsider";
  });

  it("a free user joins a Pro head's household by code", async () => {
    expect((await call("POST", "/join", { invite_code: CODE })).status).toBe(200);
    expect(
      (await call("POST", `/${HH}/join`, { invite_code: CODE })).status
    ).toBe(200);
  });

  it("a free user cannot join a free head's household", async () => {
    users[HEAD].subscription_tier = "free";
    await expectUpgrade(await call("POST", "/join", { invite_code: CODE }));
  });

  it("an unknown code is left to the handler", async () => {
    const res = await call("POST", "/join", { invite_code: "zzzzzzzzzz" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid invite code");
  });

  it("accepts an invitation to a Pro head's household", async () => {
    const res = await call("POST", "/invitations/inv-1/accept", { code: CODE });
    expect(res.status).toBe(200);
  });

  it("cannot accept an invitation to a free head's household", async () => {
    users[HEAD].subscription_tier = "free";
    await expectUpgrade(
      await call("POST", "/invitations/inv-1/accept", { code: CODE })
    );
  });

  it("can list and decline invitations on any plan", async () => {
    users[HEAD].subscription_tier = "free";
    expect((await call("GET", "/invitations/mine")).status).toBe(200);
    expect(
      (await call("POST", "/invitations/inv-1/decline", { code: CODE })).status
    ).toBe(204);
  });
});

describe("plan checks off", () => {
  it("leaves everything open", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    users[HEAD].subscription_tier = "free";
    expect((await call("GET", "")).status).toBe(200);
    expect(
      (
        await call("PUT", "/sharing", {
          income_sharing_mode: "none",
          shared_income_amount: null,
          expense_sharing_mode: "none",
        })
      ).status
    ).toBe(200);
    const memberInvite = await call("POST", "/invite", { email: "a@b.co" });
    expect(memberInvite.status).toBe(403);
    expect((await memberInvite.json()).error).toBe(
      "Only the head of household can invite members"
    );
    currentUserId = HEAD;
    expect((await call("POST", "/invite", { email: "a@b.co" })).status).not.toBe(403);
    currentUserId = "outsider";
    expect((await call("POST", "", { name: "Mine" })).status).not.toBe(403);
  });
});
