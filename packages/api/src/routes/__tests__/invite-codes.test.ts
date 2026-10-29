import { describe, it, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";
import type { Server } from "http";
import type { Router } from "express";
import { createFakeSupabase, type FakeSupabase } from "../../__tests__/helpers/fake-supabase";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-123";
const OTHER_USER_ID = "user-456";
const TEST_TOKEN = "valid-access-token";

const code = (id: string, createdBy: string | null, extra: Record<string, unknown> = {}) => ({
  id,
  code: `code-${id}`,
  created_by: createdBy,
  used_by: null,
  used_at: null,
  created_at: "2026-01-01T00:00:00Z",
  ...extra,
});

// ---------------------------------------------------------------------------
// Two in-memory databases stand in for the two Supabase clients:
//   - adminDb: the service-role client (supabaseAdmin), which bypasses RLS
//   - userDb:  the caller's RLS client. Clients may only read their own codes
//              and can no longer insert, so inserts here fail the way RLS /
//              revoked grants would.
// ---------------------------------------------------------------------------
let adminDb: FakeSupabase;
let userDb: FakeSupabase;

const mockGetUser = mock(() =>
  Promise.resolve({
    data: { user: { id: TEST_USER_ID, email: "test@example.com" } },
    error: null,
  })
);

mock.module("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, options?: any) => {
    if (options?.global?.headers?.Authorization) {
      return { from: (table: string) => userDb.from(table) };
    }
    return {
      auth: { getUser: mockGetUser },
      from: (table: string) => adminDb.from(table),
    };
  },
}));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const express = (await import("express")).default;
  const { default: inviteCodesRouter } = (await import("../invite-codes")) as { default: Router };
  const { requireAuth } = await import("../../middleware/auth");

  const app = express();
  app.use(express.json());
  app.use("/api/invite-codes", requireAuth, inviteCodesRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") baseUrl = `http://localhost:${addr.port}`;
      resolve();
    });
  });
});

afterAll(() => {
  server?.close();
});

function seed(rows: ReturnType<typeof code>[]) {
  adminDb = createFakeSupabase({ invite_codes: rows });
  // The RLS client only sees the caller's own codes.
  userDb = createFakeSupabase({
    invite_codes: rows.filter((r) => r.created_by === TEST_USER_ID),
  });
}

beforeEach(() => {
  seed([]);
});

const authed = { Authorization: `Bearer ${TEST_TOKEN}`, "Content-Type": "application/json" };

describe("GET /api/invite-codes", () => {
  it("returns 401 without a token", async () => {
    const res = await fetch(`${baseUrl}/api/invite-codes`);
    expect(res.status).toBe(401);
  });

  it("returns only the caller's codes", async () => {
    seed([code("a", TEST_USER_ID), code("b", OTHER_USER_ID), code("c", null)]);

    const res = await fetch(`${baseUrl}/api/invite-codes`, { headers: authed });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any[];
    expect(body.map((r) => r.id)).toEqual(["a"]);
  });
});

describe("POST /api/invite-codes", () => {
  it("creates the code with the service-role client, not the caller's RLS client", async () => {
    userDb.failNextInsert("invite_codes", "permission denied for table invite_codes");

    const res = await fetch(`${baseUrl}/api/invite-codes`, {
      method: "POST",
      headers: authed,
      body: "{}",
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.created_by).toBe(TEST_USER_ID);
    expect(typeof body.code).toBe("string");
    expect(adminDb.tables.invite_codes).toHaveLength(1);
    expect(adminDb.tables.invite_codes[0].created_by).toBe(TEST_USER_ID);
    expect(adminDb.tables.invite_codes[0].used_by ?? null).toBeNull();
  });

  it("only sets code and created_by on the new row", async () => {
    const res = await fetch(`${baseUrl}/api/invite-codes`, {
      method: "POST",
      headers: authed,
      body: JSON.stringify({ created_by: OTHER_USER_ID, used_by: OTHER_USER_ID, code: "chosen" }),
    });

    expect(res.status).toBe(201);
    const row = adminDb.tables.invite_codes[0];
    expect(row.created_by).toBe(TEST_USER_ID);
    expect(row.used_by ?? null).toBeNull();
    expect(row.code).not.toBe("chosen");
  });

  it("rejects a fourth code for the same user", async () => {
    seed([code("a", TEST_USER_ID), code("b", TEST_USER_ID), code("c", TEST_USER_ID)]);

    const res = await fetch(`${baseUrl}/api/invite-codes`, {
      method: "POST",
      headers: authed,
      body: "{}",
    });

    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toBe("Maximum of 3 invite codes allowed");
    expect(adminDb.tables.invite_codes).toHaveLength(3);
  });

  it("counts only the caller's codes toward the limit", async () => {
    seed([
      code("a", TEST_USER_ID),
      code("b", TEST_USER_ID),
      code("c", OTHER_USER_ID),
      code("d", OTHER_USER_ID),
      code("e", OTHER_USER_ID),
    ]);

    const res = await fetch(`${baseUrl}/api/invite-codes`, {
      method: "POST",
      headers: authed,
      body: "{}",
    });

    expect(res.status).toBe(201);
    expect(adminDb.tables.invite_codes.filter((r) => r.created_by === TEST_USER_ID)).toHaveLength(3);
  });

  it("returns 500 when the insert fails", async () => {
    adminDb.failNextInsert("invite_codes", "boom");

    const res = await fetch(`${baseUrl}/api/invite-codes`, {
      method: "POST",
      headers: authed,
      body: "{}",
    });

    expect(res.status).toBe(500);
  });
});
