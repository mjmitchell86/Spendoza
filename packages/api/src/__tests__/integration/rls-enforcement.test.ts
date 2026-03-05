import { describe, it, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";
import type { Server } from "http";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-rls-1";
const TEST_EMAIL = "rls-test@example.com";
const TEST_TOKEN = "rls-access-token";
const TEST_HOUSEHOLD_ID = "hh-rls-1";

// ---------------------------------------------------------------------------
// Track calls through RLS vs admin clients
// ---------------------------------------------------------------------------
const rlsCalls: Array<{ table: string; op: string }> = [];
const adminCalls: Array<{ table: string; op: string }> = [];

// ---------------------------------------------------------------------------
// Configurable mock results for RLS and admin clients
// ---------------------------------------------------------------------------
let rlsResults: Record<string, any> = {};
let adminResults: Record<string, any> = {};

function buildChain(results: Record<string, any>, calls: typeof rlsCalls) {
  return (table: string) => {
    const cfg = results[table] || {};

    const makeEqChain = (): any => ({
      eq: () => makeEqChain(),
      neq: () => makeEqChain(),
      gte: () => makeEqChain(),
      gt: () => makeEqChain(),
      lte: () => makeEqChain(),
      lt: () => makeEqChain(),
      or: () => makeEqChain(),
      is: () => makeEqChain(),
      not: () => makeEqChain(),
      in: () => makeEqChain(),
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
      select: (...args: any[]) => {
        calls.push({ table, op: "select" });
        return makeEqChain();
      },
      insert: (data: any) => {
        calls.push({ table, op: "insert" });
        return {
          select: () => ({
            single: () =>
              Promise.resolve(cfg.insertSingle ?? { data: null, error: null }),
          }),
          then: (resolve: any, reject?: any) =>
            Promise.resolve(cfg.insertResult ?? { data: null, error: null }).then(resolve, reject),
        };
      },
      update: (data: any) => {
        calls.push({ table, op: "update" });
        const makeUpdateEq = (): any => ({
          eq: () => makeUpdateEq(),
          select: () => ({
            single: () =>
              Promise.resolve(cfg.updateSingle ?? { data: null, error: null }),
          }),
          then: (resolve: any, reject?: any) =>
            Promise.resolve(cfg.updateResult ?? { data: null, error: null }).then(resolve, reject),
        });
        return { eq: () => makeUpdateEq() };
      },
      upsert: (data: any) => {
        calls.push({ table, op: "upsert" });
        return {
          select: () => ({
            single: () =>
              Promise.resolve(cfg.upsertSingle ?? { data: null, error: null }),
          }),
          then: (resolve: any, reject?: any) =>
            Promise.resolve(cfg.upsertResult ?? { data: null, error: null }).then(resolve, reject),
        };
      },
      delete: () => {
        calls.push({ table, op: "delete" });
        return {
          eq: () => ({
            eq: () =>
              Promise.resolve(cfg.deleteResult ?? { data: null, error: null }),
            then: (resolve: any, reject?: any) =>
              Promise.resolve(cfg.deleteResult ?? { data: null, error: null }).then(resolve, reject),
          }),
        };
      },
    };
  };
}

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js — distinguish RLS vs admin clients
// ---------------------------------------------------------------------------
const mockGetUser = mock(() =>
  Promise.resolve({
    data: { user: { id: TEST_USER_ID, email: TEST_EMAIL } },
    error: null,
  })
);

const mockRlsFrom = mock((...args: any[]) =>
  buildChain(rlsResults, rlsCalls)(args[0])
);
const mockAdminFrom = mock((...args: any[]) =>
  buildChain(adminResults, adminCalls)(args[0])
);

// Storage mock (always admin)
const mockStorageFrom = () => ({
  upload: () => Promise.resolve({ data: {}, error: null }),
  getPublicUrl: () => ({ data: { publicUrl: "https://example.com/avatar.jpg" } }),
});

mock.module("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, options?: any) => {
    if (options?.global?.headers?.Authorization) {
      // RLS client — created by createSupabaseClient(token)
      return { from: mockRlsFrom, storage: { from: mockStorageFrom } };
    }
    // Admin client — supabaseAdmin
    return {
      auth: {
        admin: { createUser: mock() },
        signInWithPassword: mock(),
        getUser: mockGetUser,
      },
      from: mockAdminFrom,
      storage: { from: mockStorageFrom },
    };
  },
}));

// ---------------------------------------------------------------------------
// Mock AI/report services (not relevant to RLS tests)
// ---------------------------------------------------------------------------
mock.module("@langchain/openai", () => ({
  ChatOpenAI: class { invoke = mock(() => Promise.resolve({ content: "mocked" })); },
}));
mock.module("@langchain/core/messages", () => ({
  SystemMessage: class { content: string; constructor(c: string) { this.content = c; } },
  HumanMessage: class { content: string; constructor(c: string) { this.content = c; } },
}));
mock.module("../../ai/report-insights", () => ({
  generateInsights: mock(() => Promise.resolve("test insights")),
  generateQuarterlyInsights: mock(() => Promise.resolve("quarterly test insights")),
}));
mock.module("../../services/report.service", () => ({
  generateUserReport: mock(() => Promise.resolve({ id: "r1", report_data: { total_income: 5000, total_expenses: 2000, savings_rate: 60, by_category: [], top_categories: [] }, ai_insights: "test" })),
  generateHouseholdReport: mock(() => Promise.resolve({ id: "r2", entity_type: "household", report_data: { total_income: 10000, total_expenses: 4000, savings_rate: 60, by_category: [], top_categories: [] }, ai_insights: "test" })),
  generateAllReports: mock(() => Promise.resolve()),
}));
mock.module("../../services/pdf-export.service", () => ({
  generatePersonalPdfForUser: mock(() => Promise.resolve({ pdfBuffer: Buffer.from("fake-pdf"), reportData: {}, aiInsights: null })),
  generateHouseholdPdfForHousehold: mock(() => Promise.resolve({ pdfBuffer: Buffer.from("fake-pdf"), reportData: {}, aiInsights: null })),
  generatePersonalPdfForRange: mock(() => Promise.resolve({ pdfBuffer: Buffer.from("fake-pdf"), reportData: {}, aiInsights: null })),
  generateHouseholdPdfForRange: mock(() => Promise.resolve({ pdfBuffer: Buffer.from("fake-pdf"), reportData: {}, aiInsights: null })),
  buildSavingsRecommendations: mock(() => []),
  buildGoalProgress: mock(() => []),
}));

// ---------------------------------------------------------------------------
// Set env vars
// ---------------------------------------------------------------------------
process.env.CRON_SECRET = "test-cron-secret";

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const express = (await import("express")).default;
  const { requireAuth } = await import("../../middleware/auth");
  const { requireAdmin } = await import("../../middleware/require-admin");

  const { default: categoriesRouter } = await import("../../routes/categories");
  const { default: expensesRouter } = await import("../../routes/expenses");
  const { default: incomeRouter } = await import("../../routes/income");
  const { default: transactionsRouter } = await import("../../routes/transactions");
  const { default: profileRouter } = await import("../../routes/profile");
  const { default: dashboardRouter } = await import("../../routes/dashboard");
  const { default: reportsRouter } = await import("../../routes/reports");
  const { default: goalsRouter } = await import("../../routes/goals");
  const { default: debtsRouter } = await import("../../routes/debts");
  const { default: householdsRouter } = await import("../../routes/households");
  const { default: adminRouter } = await import("../../routes/admin");

  const app = express();
  app.use(express.json());

  // User-facing routes (behind requireAuth)
  app.use("/api/categories", requireAuth, categoriesRouter);
  app.use("/api/expenses", requireAuth, expensesRouter);
  app.use("/api/income", requireAuth, incomeRouter);
  app.use("/api/transactions", requireAuth, transactionsRouter);
  app.use("/api/profile", requireAuth, profileRouter);
  app.use("/api/dashboard", requireAuth, dashboardRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/goals", requireAuth, goalsRouter);
  app.use("/api/debts", requireAuth, debtsRouter);
  app.use("/api/households", requireAuth, householdsRouter);
  app.use("/api/admin", requireAuth, requireAdmin, adminRouter);

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

function resetMocks() {
  rlsCalls.length = 0;
  adminCalls.length = 0;
  rlsResults = {};
  adminResults = {};
  mockRlsFrom.mockClear();
  mockAdminFrom.mockClear();
  mockGetUser.mockClear();
  mockGetUser.mockImplementation(() =>
    Promise.resolve({
      data: { user: { id: TEST_USER_ID, email: TEST_EMAIL } },
      error: null,
    })
  );
}

function authHeaders() {
  return { Authorization: `Bearer ${TEST_TOKEN}`, "Content-Type": "application/json" };
}

// ===========================================================================
// 1. Unauthenticated access — all protected routes return 401
// ===========================================================================
describe("Unauthenticated access returns 401", () => {
  beforeEach(resetMocks);

  const protectedRoutes = [
    { method: "GET", path: "/api/categories" },
    { method: "GET", path: "/api/expenses" },
    { method: "GET", path: "/api/income" },
    { method: "GET", path: "/api/transactions" },
    { method: "GET", path: "/api/profile" },
    { method: "GET", path: "/api/dashboard/personal" },
    { method: "GET", path: "/api/goals" },
    { method: "GET", path: "/api/debts" },
    { method: "GET", path: "/api/households" },
  ];

  for (const route of protectedRoutes) {
    it(`${route.method} ${route.path} returns 401 without auth`, async () => {
      const res = await fetch(`${baseUrl}${route.path}`, {
        method: route.method,
      });
      expect(res.status).toBe(401);
      // No RLS or admin calls should be made for unauthenticated requests
      expect(rlsCalls.length).toBe(0);
      expect(adminCalls.length).toBe(0);
    });
  }
});

// ===========================================================================
// 2. User data isolation — queries go through RLS client
// ===========================================================================
describe("User data queries go through RLS client (not admin)", () => {
  beforeEach(resetMocks);

  it("GET /api/categories uses RLS client", async () => {
    rlsResults = {
      categories: { selectList: { data: [], error: null } },
    };

    const res = await fetch(`${baseUrl}/api/categories`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const rlsCategoryCalls = rlsCalls.filter((c) => c.table === "categories");
    expect(rlsCategoryCalls.length).toBeGreaterThan(0);
    const adminCategoryCalls = adminCalls.filter((c) => c.table === "categories");
    expect(adminCategoryCalls.length).toBe(0);
  });

  it("GET /api/expenses uses RLS client", async () => {
    rlsResults = {
      expenses: { selectList: { data: [], error: null } },
    };

    const res = await fetch(`${baseUrl}/api/expenses`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const rlsExpenseCalls = rlsCalls.filter((c) => c.table === "expenses");
    expect(rlsExpenseCalls.length).toBeGreaterThan(0);
    const adminExpenseCalls = adminCalls.filter((c) => c.table === "expenses");
    expect(adminExpenseCalls.length).toBe(0);
  });

  it("GET /api/income uses RLS client", async () => {
    rlsResults = {
      income_entries: { selectList: { data: [], error: null } },
    };

    const res = await fetch(`${baseUrl}/api/income`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const rlsCalls_ = rlsCalls.filter((c) => c.table === "income_entries");
    expect(rlsCalls_.length).toBeGreaterThan(0);
    const adminCalls_ = adminCalls.filter((c) => c.table === "income_entries");
    expect(adminCalls_.length).toBe(0);
  });

  it("GET /api/transactions uses RLS client", async () => {
    rlsResults = {
      transactions: { selectList: { data: [], error: null } },
    };

    const res = await fetch(`${baseUrl}/api/transactions`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const rlsTxnCalls = rlsCalls.filter((c) => c.table === "transactions");
    expect(rlsTxnCalls.length).toBeGreaterThan(0);
    const adminTxnCalls = adminCalls.filter((c) => c.table === "transactions");
    expect(adminTxnCalls.length).toBe(0);
  });

  it("GET /api/profile uses RLS client", async () => {
    rlsResults = {
      profiles: {
        selectSingle: {
          data: { id: TEST_USER_ID, display_name: "Test User" },
          error: null,
        },
      },
    };

    const res = await fetch(`${baseUrl}/api/profile`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const rlsProfileCalls = rlsCalls.filter((c) => c.table === "profiles");
    expect(rlsProfileCalls.length).toBeGreaterThan(0);
    const adminProfileCalls = adminCalls.filter((c) => c.table === "profiles");
    expect(adminProfileCalls.length).toBe(0);
  });

  it("GET /api/goals uses RLS client", async () => {
    rlsResults = {
      profiles: {
        selectSingle: {
          data: { id: TEST_USER_ID, household_id: null },
          error: null,
        },
      },
      goals: { selectList: { data: [], error: null } },
    };

    const res = await fetch(`${baseUrl}/api/goals?entity_type=user`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const rlsGoalCalls = rlsCalls.filter((c) => c.table === "goals");
    expect(rlsGoalCalls.length).toBeGreaterThan(0);
    const adminGoalCalls = adminCalls.filter((c) => c.table === "goals");
    expect(adminGoalCalls.length).toBe(0);
  });

  it("GET /api/debts uses RLS client", async () => {
    rlsResults = {
      debts: { selectList: { data: [], error: null } },
    };

    const res = await fetch(`${baseUrl}/api/debts?entity_type=user`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const rlsDebtCalls = rlsCalls.filter((c) => c.table === "debts");
    expect(rlsDebtCalls.length).toBeGreaterThan(0);
    const adminDebtCalls = adminCalls.filter((c) => c.table === "debts");
    expect(adminDebtCalls.length).toBe(0);
  });
});

// ===========================================================================
// 3. Personal dashboard uses RLS, household dashboard uses admin
// ===========================================================================
describe("Dashboard scoping", () => {
  beforeEach(resetMocks);

  it("GET /api/dashboard/personal uses RLS client for all queries", async () => {
    rlsResults = {
      transactions: {
        selectList: { data: [], error: null, count: 0 },
      },
      reports: {
        selectMaybeSingle: { data: null, error: null },
      },
    };

    const res = await fetch(`${baseUrl}/api/dashboard/personal`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    // Transaction and report queries should go through RLS
    const rlsTransactionCalls = rlsCalls.filter((c) => c.table === "transactions");
    expect(rlsTransactionCalls.length).toBeGreaterThan(0);
    // No admin calls for personal dashboard data
    const adminTransactionCalls = adminCalls.filter((c) => c.table === "transactions");
    expect(adminTransactionCalls.length).toBe(0);
  });

  it("GET /api/dashboard/household uses admin client for cross-user reads", async () => {
    // Dashboard household stays on admin for cross-user transaction reads
    rlsResults = {};
    adminResults = {
      profiles: {
        selectSingle: {
          data: { id: TEST_USER_ID, household_id: TEST_HOUSEHOLD_ID },
          error: null,
        },
        selectList: {
          data: [{ id: TEST_USER_ID, display_name: "Test", income_sharing_mode: "all", expense_sharing_mode: "all" }],
          error: null,
        },
      },
      transactions: {
        selectList: { data: [], error: null, count: 0 },
      },
      reports: {
        selectMaybeSingle: { data: null, error: null },
      },
    };

    const res = await fetch(`${baseUrl}/api/dashboard/household`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    // Household dashboard should use admin for cross-user reads
    const adminProfileCalls = adminCalls.filter((c) => c.table === "profiles");
    expect(adminProfileCalls.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 4. Income PUT fix — now includes user_id filter via RLS client
// ===========================================================================
describe("Income PUT vulnerability fix", () => {
  beforeEach(resetMocks);

  it("PUT /api/income/:id uses RLS client (not admin)", async () => {
    rlsResults = {
      income_entries: {
        updateSingle: {
          data: { id: "inc-1", user_id: TEST_USER_ID, amount: 5000, source_name: "Salary" },
          error: null,
        },
      },
    };

    const res = await fetch(`${baseUrl}/api/income/inc-1`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ amount: 5500, source_name: "Salary", frequency: "monthly" }),
    });

    expect(res.status).toBe(200);
    // Should go through RLS client
    const rlsIncomeCalls = rlsCalls.filter((c) => c.table === "income_entries" && c.op === "update");
    expect(rlsIncomeCalls.length).toBe(1);
    // NOT through admin
    const adminIncomeCalls = adminCalls.filter((c) => c.table === "income_entries" && c.op === "update");
    expect(adminIncomeCalls.length).toBe(0);
  });
});

// ===========================================================================
// 5. Admin routes still use admin client
// ===========================================================================
describe("Admin routes use admin client", () => {
  beforeEach(resetMocks);

  it("GET /api/admin/stats uses admin client for cross-user data", async () => {
    // requireAdmin reads profile via RLS client
    rlsResults = {
      profiles: {
        selectSingle: { data: { is_admin: true }, error: null },
      },
    };
    // Admin stats queries go through admin (admin_user_stats, admin_activity_stats)
    adminResults = {
      admin_user_stats: {
        selectSingle: { data: { total_users: 5 }, error: null },
      },
      admin_activity_stats: {
        selectSingle: { data: { active_today: 2 }, error: null },
      },
    };

    const res = await fetch(`${baseUrl}/api/admin/stats`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    // requireAdmin middleware uses RLS for profile check
    const rlsProfileCalls = rlsCalls.filter((c) => c.table === "profiles");
    expect(rlsProfileCalls.length).toBeGreaterThan(0);

    // Admin stats queries go through admin client (not RLS)
    const adminStatsCalls = adminCalls.filter(
      (c) => c.table === "admin_user_stats" || c.table === "admin_activity_stats"
    );
    expect(adminStatsCalls.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 6. Cron routes use admin client only (no user context)
// ===========================================================================
describe("Cron routes use admin client (no RLS)", () => {
  beforeEach(resetMocks);

  it("POST /api/reports/generate-all uses admin via CRON_SECRET", async () => {
    const res = await fetch(`${baseUrl}/api/reports/generate-all`, {
      method: "POST",
      headers: { Authorization: "Bearer test-cron-secret" },
    });

    expect(res.status).toBe(200);
    // No RLS calls — cron has no user context
    expect(rlsCalls.length).toBe(0);
  });

  it("POST /api/reports/generate-all rejects wrong secret", async () => {
    const res = await fetch(`${baseUrl}/api/reports/generate-all`, {
      method: "POST",
      headers: { Authorization: "Bearer wrong-secret" },
    });

    expect(res.status).toBe(401);
    expect(rlsCalls.length).toBe(0);
    expect(adminCalls.length).toBe(0);
  });
});

// ===========================================================================
// 7. Household join stays on admin (user not yet a member)
// ===========================================================================
describe("Household join uses admin client", () => {
  beforeEach(resetMocks);

  it("POST /api/households/:id/join uses admin for household lookup", async () => {
    adminResults = {
      households: {
        selectSingle: {
          data: { id: TEST_HOUSEHOLD_ID, invite_code: "ABC123", head_of_household_id: "other-user" },
          error: null,
        },
      },
      profiles: {
        selectSingle: {
          data: { id: TEST_USER_ID, household_id: null },
          error: null,
        },
        selectList: {
          data: [{ id: "other-user" }],
          error: null,
        },
      },
    };

    const res = await fetch(`${baseUrl}/api/households/${TEST_HOUSEHOLD_ID}/join`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ invite_code: "ABC123" }),
    });

    expect(res.status).toBe(200);
    // Join handler uses admin for household + profile reads
    const adminHouseholdCalls = adminCalls.filter((c) => c.table === "households");
    expect(adminHouseholdCalls.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 8. Reports personal/household export uses RLS client
// ===========================================================================
describe("Report endpoints use RLS client", () => {
  beforeEach(resetMocks);

  it("GET /api/reports/personal uses RLS client", async () => {
    rlsResults = {
      reports: {
        selectMaybeSingle: {
          data: {
            id: "r1",
            entity_type: "user",
            entity_id: TEST_USER_ID,
            report_month: "2026-02-01",
            report_data: { total_income: 5000, total_expenses: 2000, savings_rate: 60, by_category: [], top_categories: [] },
            ai_insights: "test",
          },
          error: null,
        },
        selectSingle: {
          data: {
            id: "r1",
            entity_type: "user",
            entity_id: TEST_USER_ID,
            report_month: "2026-02-01",
            report_data: { total_income: 5000, total_expenses: 2000, savings_rate: 60, by_category: [], top_categories: [] },
            ai_insights: "test",
          },
          error: null,
        },
      },
    };

    const res = await fetch(`${baseUrl}/api/reports/personal?month=2026-02-01`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const rlsReportCalls = rlsCalls.filter((c) => c.table === "reports");
    expect(rlsReportCalls.length).toBeGreaterThan(0);
    const adminReportCalls = adminCalls.filter((c) => c.table === "reports");
    expect(adminReportCalls.length).toBe(0);
  });
});

// ===========================================================================
// 9. Middleware uses RLS client
// ===========================================================================
describe("Middleware uses RLS client for user data", () => {
  beforeEach(resetMocks);

  it("requireAdmin middleware reads profile via RLS client", async () => {
    // requireAdmin now uses req.supabase (RLS client) to read profile
    rlsResults = {
      profiles: {
        selectSingle: { data: { is_admin: false }, error: null },
      },
    };

    const res = await fetch(`${baseUrl}/api/admin/stats`, {
      headers: authHeaders(),
    });

    // Should be 403 (not admin)
    expect(res.status).toBe(403);
    // The profile check went through RLS, not admin
    const rlsProfileCalls = rlsCalls.filter((c) => c.table === "profiles");
    expect(rlsProfileCalls.length).toBeGreaterThan(0);
  });
});
