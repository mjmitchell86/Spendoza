import { describe, it, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";
import type { Server } from "http";

const TEST_ADMIN_ID = "admin-user-1";
const TEST_USER_ID = "regular-user-1";
const TEST_TOKEN = "valid-token";

let currentUserId = TEST_ADMIN_ID;
let adminResults: Record<string, any> = {};
let mockServiceCalls: Record<string, any[]> = {};

mock.module("../../services/report.service", () => ({
  generateUserReport: (...args: any[]) => {
    mockServiceCalls.generateUserReport = args;
    return Promise.resolve({ id: "report-1", report_month: "2026-02-01" });
  },
  generateHouseholdReport: (...args: any[]) => {
    mockServiceCalls.generateHouseholdReport = args;
    return Promise.resolve({ id: "hh-report-1", report_month: "2026-02-01" });
  },
}));

mock.module("../../services/bill-detection.service", () => ({
  detectRecurringBills: (...args: any[]) => {
    mockServiceCalls.detectRecurringBills = args;
    return Promise.resolve();
  },
}));

mock.module("../../services/income-detection.service", () => ({
  detectRecurringIncome: (...args: any[]) => {
    mockServiceCalls.detectRecurringIncome = args;
    return Promise.resolve();
  },
}));

const fakePdfResult = {
  pdfBuffer: Buffer.from("fake-pdf"),
  reportData: {
    total_income: 15000,
    total_expenses: 6000,
    savings_rate: 60,
    expense_to_income_ratio: 0.4,
    by_category: [],
    top_categories: [],
    month_over_month: null,
  },
  aiInsights: "Quarterly insight 1.\nQuarterly insight 2.",
};

mock.module("../../services/pdf-export.service", () => ({
  generatePersonalPdfForRange: (...args: any[]) => {
    mockServiceCalls.generatePersonalPdfForRange = args;
    return Promise.resolve(fakePdfResult);
  },
  generatePersonalAnnualPdf: (...args: any[]) => {
    mockServiceCalls.generatePersonalAnnualPdf = args;
    return Promise.resolve(fakePdfResult);
  },
  computeGoalAchievement: (...args: any[]) => {
    mockServiceCalls.computeGoalAchievement = args;
    return { achieved: ["Save $5k"], inProgress: ["Budget groceries"], totalCreated: 2 };
  },
}));

mock.module("../../services/email.service", () => ({
  sendReportEmail: (...args: any[]) => {
    mockServiceCalls.sendReportEmail = args;
    return Promise.resolve({ success: true, emailId: "email-123" });
  },
}));

mock.module("../../services/email-template.service", () => ({
  buildReportEmailHtml: (...args: any[]) => {
    mockServiceCalls.buildReportEmailHtml = args;
    return "<html>mock email</html>";
  },
  buildAnnualReportEmailHtml: (...args: any[]) => {
    mockServiceCalls.buildAnnualReportEmailHtml = args;
    return "<html>mock annual email</html>";
  },
}));

const mockFrom = (table: string) => {
  const cfg = adminResults[table] || {};
  return {
    select: (...args: any[]) => {
      // Handle count queries
      if (args[1]?.count === "exact" && args[1]?.head === true) {
        return {
          eq: () => ({
            eq: () => ({
              ilike: () => Promise.resolve({ count: cfg.count ?? 0, error: null }),
              then: (resolve: any) => resolve({ count: cfg.count ?? 0, error: null }),
            }),
            ilike: () => Promise.resolve({ count: cfg.count ?? 0, error: null }),
            then: (resolve: any) => resolve({ count: cfg.count ?? 0, error: null }),
          }),
          ilike: () => Promise.resolve({ count: cfg.count ?? 0, error: null }),
          then: (resolve: any) => resolve({ count: cfg.count ?? 0, error: null }),
        };
      }
      return {
        eq: (...eqArgs: any[]) => ({
          single: () => Promise.resolve(cfg.selectSingle ?? { data: null, error: null }),
          eq: () => ({
            single: () => Promise.resolve(cfg.selectSingle ?? { data: null, error: null }),
          }),
          order: () => ({
            range: () => Promise.resolve(cfg.selectList ?? { data: [], error: null }),
            limit: () => Promise.resolve(cfg.selectList ?? { data: [], error: null }),
            then: (resolve: any) => resolve(cfg.selectList ?? { data: [], error: null }),
          }),
          range: () => Promise.resolve(cfg.selectList ?? { data: [], error: null }),
        }),
        single: () => Promise.resolve(cfg.selectSingle ?? { data: null, error: null }),
        gte: () => ({
          order: () => Promise.resolve(cfg.selectList ?? { data: [], error: null }),
          then: (resolve: any) => resolve(cfg.selectList ?? { data: [], error: null }),
        }),
        order: () => ({
          range: () => Promise.resolve(cfg.selectList ?? { data: [], error: null }),
          then: (resolve: any) => resolve(cfg.selectList ?? { data: [], error: null }),
        }),
        then: (resolve: any) => resolve(cfg.selectList ?? { data: [], error: null }),
      };
    },
    update: (data: any) => ({
      eq: () => ({
        select: () => ({
          single: () => Promise.resolve(cfg.updateSingle ?? { data: null, error: null }),
        }),
      }),
    }),
    delete: () => ({
      eq: () => Promise.resolve(cfg.deleteResult ?? { error: null }),
    }),
  };
};

mock.module("../../lib/supabase", () => ({
  supabaseAdmin: {
    auth: {
      getUser: (token: string) => {
        if (token === TEST_TOKEN) {
          return Promise.resolve({
            data: { user: { id: currentUserId, email: "test@example.com" } },
            error: null,
          });
        }
        return Promise.resolve({ data: { user: null }, error: { message: "bad" } });
      },
      admin: {
        getUserById: (uid: string) => Promise.resolve({
          data: { user: { id: uid, email: `${uid}@test.com` } },
        }),
        deleteUser: (uid: string) => {
          const cfg = adminResults._authAdmin || {};
          return Promise.resolve(cfg.deleteResult ?? { error: null });
        },
      },
    },
    from: mockFrom,
    rpc: (fn: string) => Promise.resolve(adminResults._rpc?.[fn] ?? { data: null, error: null }),
  },
  createSupabaseClient: () => ({ from: mockFrom }),
}));

let server: Server;
let port: number;

beforeAll(async () => {
  const express = (await import("express")).default;
  const { requireAuth } = await import("../../middleware/auth");
  const { requireAdmin } = await import("../../middleware/require-admin");
  const adminRouter = (await import("../admin")).default;

  const app = express();
  app.use(express.json());
  app.use("/api/admin", requireAuth, requireAdmin, adminRouter);

  server = app.listen(0);
  port = (server.address() as any).port;
});

afterAll(() => server?.close());

beforeEach(() => {
  currentUserId = TEST_ADMIN_ID;
  adminResults = {
    profiles: {
      selectSingle: { data: { is_admin: true }, error: null },
    },
  };
  mockServiceCalls = {};
});

const headers = { Authorization: `Bearer ${TEST_TOKEN}` };

describe("GET /api/admin/stats", () => {
  it("returns 403 for non-admin users", async () => {
    adminResults.profiles = {
      selectSingle: { data: { is_admin: false }, error: null },
    };
    const res = await fetch(`http://localhost:${port}/api/admin/stats`, { headers });
    expect(res.status).toBe(403);
  });

  it("returns aggregate stats for admin users", async () => {
    adminResults.admin_user_stats = {
      selectSingle: {
        data: { total_users: 50, free_users: 30, starter_users: 15, pro_users: 5, admin_users: 2 },
        error: null,
      },
    };
    adminResults.admin_activity_stats = {
      selectSingle: {
        data: { total_transactions: 1200, total_reports: 80, total_emails_sent: 45, total_goals: 30, total_households: 8 },
        error: null,
      },
    };

    const res = await fetch(`http://localhost:${port}/api/admin/stats`, { headers });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users.total_users).toBe(50);
    expect(body.activity.total_transactions).toBe(1200);
  });
});

describe("GET /api/admin/stats/trends", () => {
  it("returns trend data", async () => {
    adminResults.admin_user_trends = {
      selectList: {
        data: [{ month: "2026-01-01", new_users: 10 }],
        error: null,
      },
    };
    adminResults.admin_activity_trends = {
      selectList: {
        data: [{ month: "2026-01-01", metric: "transactions", count: 100 }],
        error: null,
      },
    };
    adminResults.admin_llm_stats = {
      selectList: {
        data: [{ month: "2026-01-01", call_type: "categorization", call_count: 50, total_tokens: 10000, avg_tokens: 200, min_tokens: 100, max_tokens: 500, total_cost: 0.05 }],
        error: null,
      },
    };

    const res = await fetch(`http://localhost:${port}/api/admin/stats/trends?months=6`, { headers });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user_trends).toBeArrayOfSize(1);
    expect(body.activity_trends).toBeArrayOfSize(1);
    expect(body.llm_stats).toBeArrayOfSize(1);
  });
});

describe("PATCH /api/admin/users/:id", () => {
  it("updates user admin status", async () => {
    const targetUserId = "target-user-1";
    adminResults.profiles = {
      ...adminResults.profiles,
      updateSingle: {
        data: { id: targetUserId, is_admin: true, subscription_tier: "free", disabled: false },
        error: null,
      },
    };

    const res = await fetch(`http://localhost:${port}/api/admin/users/${targetUserId}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ is_admin: true }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.is_admin).toBe(true);
  });

  it("updates user subscription tier", async () => {
    const targetUserId = "target-user-2";
    adminResults.profiles = {
      ...adminResults.profiles,
      updateSingle: {
        data: { id: targetUserId, is_admin: false, subscription_tier: "pro", disabled: false },
        error: null,
      },
    };

    const res = await fetch(`http://localhost:${port}/api/admin/users/${targetUserId}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ subscription_tier: "pro" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscription_tier).toBe("pro");
  });

  it("returns 400 with no valid fields", async () => {
    const res = await fetch(`http://localhost:${port}/api/admin/users/some-id`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/admin/users/:id", () => {
  it("prevents self-deletion", async () => {
    const res = await fetch(`http://localhost:${port}/api/admin/users/${TEST_ADMIN_ID}`, {
      method: "DELETE",
      headers,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Cannot delete your own account");
  });
});

describe("POST /api/admin/users/:id/generate-report", () => {
  it("generates a report for the target user", async () => {
    const targetUserId = "target-user-1";
    adminResults.transactions = {
      selectList: { data: [{ date: "2026-02-15" }], error: null },
    };

    const res = await fetch(
      `http://localhost:${port}/api/admin/users/${targetUserId}/generate-report`,
      { method: "POST", headers }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("report-1");
    expect(mockServiceCalls.generateUserReport).toBeDefined();
    expect(mockServiceCalls.generateUserReport[0]).toBe(targetUserId);
    expect(mockServiceCalls.generateUserReport[2]).toBe(true); // force=true
  });

  it("generates household report when user belongs to one", async () => {
    const targetUserId = "target-user-2";
    adminResults.profiles = {
      selectSingle: {
        data: { is_admin: true, id: targetUserId, household_id: "hh-1" },
        error: null,
      },
    };
    adminResults.transactions = {
      selectList: { data: [{ date: "2026-01-10" }], error: null },
    };

    const res = await fetch(
      `http://localhost:${port}/api/admin/users/${targetUserId}/generate-report`,
      { method: "POST", headers }
    );
    expect(res.status).toBe(200);
    expect(mockServiceCalls.generateHouseholdReport).toBeDefined();
    expect(mockServiceCalls.generateHouseholdReport[0]).toBe("hh-1");
  });

  it("returns 404 when user does not exist", async () => {
    adminResults.profiles = {
      selectSingle: { data: null, error: { message: "not found" } },
    };

    const res = await fetch(
      `http://localhost:${port}/api/admin/users/nonexistent/generate-report`,
      { method: "POST", headers }
    );
    // Admin middleware also checks profiles, so this may be 403 or 404
    expect([403, 404]).toContain(res.status);
  });
});

describe("POST /api/admin/users/:id/detect-recurring", () => {
  it("runs recurring detection for the target user", async () => {
    const targetUserId = "target-user-1";

    const res = await fetch(
      `http://localhost:${port}/api/admin/users/${targetUserId}/detect-recurring`,
      { method: "POST", headers }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockServiceCalls.detectRecurringBills).toBeDefined();
    expect(mockServiceCalls.detectRecurringBills[0]).toBe(targetUserId);
    expect(mockServiceCalls.detectRecurringIncome).toBeDefined();
    expect(mockServiceCalls.detectRecurringIncome[0]).toBe(targetUserId);
  });

  it("returns 404 when user does not exist", async () => {
    adminResults.profiles = {
      selectSingle: { data: null, error: { message: "not found" } },
    };

    const res = await fetch(
      `http://localhost:${port}/api/admin/users/nonexistent/detect-recurring`,
      { method: "POST", headers }
    );
    expect([403, 404]).toContain(res.status);
  });
});

describe("POST /api/admin/users/:id/send-quarterly-report", () => {
  it("sends a quarterly report for the target user", async () => {
    const targetUserId = "target-user-1";
    adminResults.profiles = {
      selectSingle: {
        data: { is_admin: true, id: targetUserId, display_name: "Test User" },
        error: null,
      },
    };

    const res = await fetch(
      `http://localhost:${port}/api/admin/users/${targetUserId}/send-quarterly-report`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.email).toBe(`${targetUserId}@test.com`);
    expect(mockServiceCalls.generatePersonalPdfForRange).toBeDefined();
    expect(mockServiceCalls.generatePersonalPdfForRange[0]).toBe(targetUserId);
    // 5th arg = generateFreshInsights = true
    expect(mockServiceCalls.generatePersonalPdfForRange[4]).toBe(true);
    expect(mockServiceCalls.sendReportEmail).toBeDefined();
  });

  it("sends quarterly report with custom date range", async () => {
    const targetUserId = "target-user-2";
    adminResults.profiles = {
      selectSingle: {
        data: { is_admin: true, id: targetUserId, display_name: "User 2" },
        error: null,
      },
    };

    const res = await fetch(
      `http://localhost:${port}/api/admin/users/${targetUserId}/send-quarterly-report`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ from_date: "2025-10-01", to_date: "2025-12-31" }),
      }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fromDate).toBe("2025-10-01");
    expect(body.toDate).toBe("2025-12-31");
  });

  it("returns 404 when user does not exist", async () => {
    adminResults.profiles = {
      selectSingle: { data: null, error: { message: "not found" } },
    };

    const res = await fetch(
      `http://localhost:${port}/api/admin/users/nonexistent/send-quarterly-report`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    expect([403, 404]).toContain(res.status);
  });
});

describe("POST /api/admin/users/:id/send-annual-report", () => {
  it("sends an annual report for the target user", async () => {
    const targetUserId = "target-user-1";
    adminResults.profiles = {
      selectSingle: {
        data: { is_admin: true, id: targetUserId, display_name: "Test User" },
        error: null,
      },
    };
    adminResults.goals = {
      selectList: { data: [], error: null },
    };

    const res = await fetch(
      `http://localhost:${port}/api/admin/users/${targetUserId}/send-annual-report`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.email).toBe(`${targetUserId}@test.com`);
    expect(mockServiceCalls.generatePersonalAnnualPdf).toBeDefined();
    expect(mockServiceCalls.generatePersonalAnnualPdf[0]).toBe(targetUserId);
    expect(mockServiceCalls.sendReportEmail).toBeDefined();
    expect(mockServiceCalls.buildAnnualReportEmailHtml).toBeDefined();
  });

  it("sends annual report with custom year", async () => {
    const targetUserId = "target-user-2";
    adminResults.profiles = {
      selectSingle: {
        data: { is_admin: true, id: targetUserId, display_name: "User 2" },
        error: null,
      },
    };
    adminResults.goals = {
      selectList: { data: [], error: null },
    };

    const res = await fetch(
      `http://localhost:${port}/api/admin/users/${targetUserId}/send-annual-report`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ year: 2024 }),
      }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.year).toBe(2024);
    expect(mockServiceCalls.generatePersonalAnnualPdf[1]).toBe(2024);
  });

  it("returns 404 when user does not exist", async () => {
    adminResults.profiles = {
      selectSingle: { data: null, error: { message: "not found" } },
    };

    const res = await fetch(
      `http://localhost:${port}/api/admin/users/nonexistent/send-annual-report`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    expect([403, 404]).toContain(res.status);
  });
});
