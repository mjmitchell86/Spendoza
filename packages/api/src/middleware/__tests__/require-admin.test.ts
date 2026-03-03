import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import type { Server } from "http";

const TEST_USER_ID = "user-admin-test";
const TEST_TOKEN = "valid-token";

let adminResults: Record<string, any> = {};

// Mock supabase before importing app
const mockFrom = (table: string) => {
  const cfg = adminResults[table] || {};
  return {
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve(cfg.selectSingle ?? { data: null, error: null }),
      }),
    }),
  };
};

mock.module("../../lib/supabase", () => ({
  supabaseAdmin: {
    auth: {
      getUser: (token: string) => {
        if (token === TEST_TOKEN) {
          return Promise.resolve({
            data: { user: { id: TEST_USER_ID, email: "admin@test.com" } },
            error: null,
          });
        }
        return Promise.resolve({ data: { user: null }, error: { message: "bad token" } });
      },
    },
    from: mockFrom,
  },
  createSupabaseClient: () => ({ from: mockFrom }),
}));

let server: Server;
let port: number;

beforeAll(async () => {
  const express = (await import("express")).default;
  const { requireAuth } = await import("../auth");
  const { requireAdmin } = await import("../require-admin");

  const app = express();
  app.use(express.json());
  app.get("/test-admin", requireAuth, requireAdmin, (_req, res) => {
    res.json({ ok: true });
  });

  server = app.listen(0);
  port = (server.address() as any).port;
});

afterAll(() => server?.close());

describe("requireAdmin middleware", () => {
  it("returns 401 without auth header", async () => {
    const res = await fetch(`http://localhost:${port}/test-admin`);
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    adminResults = {
      profiles: {
        selectSingle: {
          data: { is_admin: false },
          error: null,
        },
      },
    };
    const res = await fetch(`http://localhost:${port}/test-admin`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Admin access required");
  });

  it("returns 200 when user is admin", async () => {
    adminResults = {
      profiles: {
        selectSingle: {
          data: { is_admin: true },
          error: null,
        },
      },
    };
    const res = await fetch(`http://localhost:${port}/test-admin`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 403 when profile lookup fails", async () => {
    adminResults = {
      profiles: {
        selectSingle: {
          data: null,
          error: { message: "not found" },
        },
      },
    };
    const res = await fetch(`http://localhost:${port}/test-admin`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(res.status).toBe(403);
  });
});
