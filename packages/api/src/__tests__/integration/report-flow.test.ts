import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import type { Server } from "http";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-rpt-1";
const TEST_EMAIL = "report-test@example.com";
const TEST_TOKEN = "rpt-access-token";
const TEST_HOUSEHOLD_ID = "hh-rpt-1";
const CRON_SECRET = "test-cron-secret-rpt";

const sampleReport = {
  id: "rpt-int-1",
  entity_type: "user" as const,
  entity_id: TEST_USER_ID,
  report_month: "2026-02-01",
  report_data: {
    total_income: 7500,
    total_expenses: 2200,
    savings_rate: 70.67,
    expense_to_income_ratio: 0.29,
    by_category: [
      { category: "Housing", amount: 1400, percentage: 63.64 },
      { category: "Food", amount: 500, percentage: 22.73 },
      { category: "Transport", amount: 300, percentage: 13.64 },
    ],
    top_categories: ["Housing", "Food", "Transport"],
    month_over_month: { income_change: 5.0, expense_change: -2.0 },
  },
  ai_insights: "Your savings rate is strong at 70.67%. Housing remains your largest expense.",
  generated_at: "2026-02-28T00:00:00Z",
  has_new_data: false,
};

// ---------------------------------------------------------------------------
// Configurable mock results keyed by table
// ---------------------------------------------------------------------------
let adminResults: Record<string, any> = {};
const adminCalls: Array<{ table: string; op: string; args?: any }> = [];

function buildChain(results: Record<string, any>, calls: typeof adminCalls) {
  return (table: string) => {
    const cfg = results[table] || {};

    const makeEqChain = (depth = 0): any => ({
      eq: (...args: any[]) => makeEqChain(depth + 1),
      gte: (...args: any[]) => makeEqChain(depth + 1),
      gt: (...args: any[]) => makeEqChain(depth + 1),
      lte: (...args: any[]) => makeEqChain(depth + 1),
      lt: (...args: any[]) => makeEqChain(depth + 1),
      or: (...args: any[]) => makeEqChain(depth + 1),
      is: (...args: any[]) => makeEqChain(depth + 1),
      not: (...args: any[]) => makeEqChain(depth + 1),
      in: (...args: any[]) => makeEqChain(depth + 1),
      order: (...args: any[]) => makeEqChain(depth + 1),
      limit: (...args: any[]) => makeEqChain(depth + 1),
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
                cfg.upsertSingle ?? cfg.updateSingle ?? { data: null, error: null }
              ),
          }),
          then: (resolve: any, reject?: any) => {
            const result = cfg.updateResult ?? { data: null, error: null };
            return Promise.resolve(result).then(resolve, reject);
          },
        });
        return { eq: () => makeUpdateEq() };
      },
      upsert: (data: any) => {
        calls.push({ table, op: "upsert", args: data });
        return {
          select: () => ({
            single: () =>
              Promise.resolve(cfg.upsertSingle ?? { data: null, error: null }),
          }),
          eq: () => ({
            select: () => ({
              single: () =>
                Promise.resolve(cfg.upsertSingle ?? { data: null, error: null }),
            }),
          }),
          then: (resolve: any, reject?: any) => {
            const result = cfg.upsertResult ?? { data: null, error: null };
            return Promise.resolve(result).then(resolve, reject);
          },
        };
      },
      delete: () => {
        calls.push({ table, op: "delete" });
        return {
          eq: () => ({
            eq: () =>
              Promise.resolve(cfg.deleteResult ?? { data: null, error: null }),
          }),
        };
      },
    };
  };
}

// ---------------------------------------------------------------------------
// Mock supabaseAdmin auth
// ---------------------------------------------------------------------------
const mockGetUser = mock(() =>
  Promise.resolve({
    data: {
      user: {
        id: TEST_USER_ID,
        email: TEST_EMAIL,
      },
    },
    error: null,
  })
);

const mockAdminFrom = mock((...args: any[]) =>
  buildChain(adminResults, adminCalls)(args[0])
);

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js
// ---------------------------------------------------------------------------
mock.module("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, options?: any) => {
    if (options?.global?.headers?.Authorization) {
      return { from: mockAdminFrom };
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
// Mock AI and report service
// ---------------------------------------------------------------------------
const mockGenerateInsights = mock(() =>
  Promise.resolve("Your savings rate is strong at 70.67%. Housing remains your largest expense.")
);

mock.module("../../ai/report-insights", () => ({
  generateInsights: mockGenerateInsights,
  generateQuarterlyInsights: mock(() => Promise.resolve("quarterly test insights")),
  generateAnnualInsights: mock(() => Promise.resolve("annual test insights")),
}));

mock.module("@langchain/openai", () => ({
  ChatOpenAI: class MockChatOpenAI {
    constructor(_opts?: any) {}
    invoke = mock(() => Promise.resolve({ content: "mocked" }));
  },
}));

mock.module("@langchain/core/messages", () => ({
  SystemMessage: class {
    content: string;
    constructor(c: string) { this.content = c; }
  },
  HumanMessage: class {
    content: string;
    constructor(c: string) { this.content = c; }
  },
}));

const mockGenerateUserReport = mock(() => Promise.resolve(sampleReport));
const mockGenerateHouseholdReport = mock(() =>
  Promise.resolve({
    ...sampleReport,
    id: "rpt-int-2",
    entity_type: "household" as const,
    entity_id: TEST_HOUSEHOLD_ID,
  })
);
const mockGenerateAllReports = mock(() => Promise.resolve());
const mockGetReport = mock((_ctx: any, _entityType: string, _entityId: string, _month: string) =>
  Promise.resolve({ data: sampleReport, error: null })
);

mock.module("../../services/report.service", () => ({
  generateUserReport: mockGenerateUserReport,
  generateHouseholdReport: mockGenerateHouseholdReport,
  generateAllReports: mockGenerateAllReports,
  getReport: mockGetReport,
}));

// ---------------------------------------------------------------------------
// Set env vars
// ---------------------------------------------------------------------------
process.env.CRON_SECRET = CRON_SECRET;

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const express = (await import("express")).default;
  const { default: reportsRouter } = await import("../../routes/reports");
  const { default: dashboardRouter } = await import("../../routes/dashboard");
  const { requireAuth } = await import("../../middleware/auth");

  const app = express();
  app.use(express.json());
  app.use("/api/reports", reportsRouter);
  app.use("/api/dashboard", requireAuth, dashboardRouter);

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
  adminCalls.length = 0;
  mockAdminFrom.mockClear();
  mockGetUser.mockClear();
  mockGenerateUserReport.mockClear();
  mockGenerateHouseholdReport.mockClear();
  mockGenerateAllReports.mockClear();
  mockGetReport.mockClear();

  mockGetUser.mockImplementation(() =>
    Promise.resolve({
      data: {
        user: {
          id: TEST_USER_ID,
          email: TEST_EMAIL,
        },
      },
      error: null,
    })
  );

  mockGenerateUserReport.mockImplementation(() =>
    Promise.resolve(sampleReport)
  );
  mockGenerateAllReports.mockImplementation(() => Promise.resolve());
  mockGetReport.mockImplementation((_ctx: any, _entityType: string, _entityId: string, _month: string) =>
    Promise.resolve({ data: sampleReport, error: null })
  );
}

// ===========================================================================
// Report Flow Integration Test
// Generate personal report -> Verify data -> Generate again (within limit) ->
// Hit rate limit -> Verify caching via dashboard
// ===========================================================================
describe("Report Flow: Generate -> Verify -> Rate Limit -> Cache", () => {
  it("Step 1: Generates a personal report (first request)", async () => {
    resetMocks();

    adminResults = {
      reports: {
        selectSingle: { data: sampleReport, error: null },
        selectMaybeSingle: { data: sampleReport, error: null },
      },
      report_requests: {
        insertResult: { data: null, error: null },
      },
      profiles: {
        selectSingle: {
          data: { id: TEST_USER_ID, household_id: TEST_HOUSEHOLD_ID },
          error: null,
        },
      },
    };

    const res = await fetch(`${baseUrl}/api/reports/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entity_type).toBe("user");
    expect(body.entity_id).toBe(TEST_USER_ID);
    expect(body.report_data.total_income).toBe(7500);
    expect(body.report_data.total_expenses).toBe(2200);
    expect(body.report_data.savings_rate).toBeCloseTo(70.67, 1);
    expect(body.ai_insights).toBeDefined();
    expect(mockGenerateUserReport).toHaveBeenCalledTimes(1);
  });

  it("Step 2: Retrieves the personal report", async () => {
    resetMocks();

    adminResults = {
      reports: {
        selectSingle: { data: sampleReport, error: null },
        selectMaybeSingle: { data: sampleReport, error: null },
      },
      profiles: {
        selectSingle: {
          data: { id: TEST_USER_ID, household_id: TEST_HOUSEHOLD_ID },
          error: null,
        },
      },
    };

    const res = await fetch(`${baseUrl}/api/reports/personal?month=2026-02-01`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entity_type).toBe("user");
    expect(body.report_data.total_income).toBe(7500);
    expect(body.report_data.by_category).toHaveLength(3);
    expect(body.report_data.top_categories).toContain("Housing");
    expect(body.report_data.month_over_month).toBeDefined();
  });

  it("Step 3: Generates a second report (count=1, still under limit)", async () => {
    resetMocks();

    adminResults = {
      reports: {
        selectMaybeSingle: { data: sampleReport, error: null },
      },
      report_requests: {
        insertResult: { data: null, error: null },
      },
    };

    const res = await fetch(`${baseUrl}/api/reports/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entity_type).toBe("user");
    expect(mockGenerateUserReport).toHaveBeenCalledTimes(1);
  });

  it("Step 4: Hits rate limit on third attempt in production (count=2)", async () => {
    resetMocks();
    const originalEnv = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = "production";

    adminResults = {
      report_requests: {
        selectList: { data: null, count: 2, error: null },
      },
    };

    try {
      const res = await fetch(`${baseUrl}/api/reports/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_TOKEN}`,
        },
      });

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error).toContain("2 per 24 hours");
      expect(mockGenerateUserReport).not.toHaveBeenCalled();
    } finally {
      process.env.VERCEL_ENV = originalEnv;
    }
  });

  it("Step 5: Verifies cached report via dashboard endpoint", async () => {
    resetMocks();

    adminResults = {
      reports: {
        selectMaybeSingle: { data: sampleReport, error: null },
      },
      profiles: {
        selectSingle: {
          data: { id: TEST_USER_ID, household_id: TEST_HOUSEHOLD_ID },
          error: null,
        },
      },
    };

    const res = await fetch(`${baseUrl}/api/dashboard/personal`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    // Dashboard transforms report_data into summary shape
    expect(body.summary).toBeDefined();
    expect(body.summary.total_income).toBe(7500);
    expect(body.summary.total_expenses).toBe(2200);
    expect(body.summary.savings_rate).toBeCloseTo(70.67, 1);
    expect(body.summary.net).toBe(5300);
    expect(body.by_category).toBeDefined();
    expect(Array.isArray(body.by_category)).toBe(true);
    expect(body.trends).toBeDefined();
    expect(body.insights).toBeDefined();
  });

  it("Step 6: Returns 404 when no report exists for a month", async () => {
    resetMocks();

    mockGetReport.mockImplementation(() =>
      Promise.resolve({ data: null, error: null })
    );

    const res = await fetch(`${baseUrl}/api/reports/personal?month=2025-06-01`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  it("Step 7: Cron endpoint generates all reports with valid secret", async () => {
    resetMocks();

    const res = await fetch(`${baseUrl}/api/reports/generate-all`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CRON_SECRET}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain("generated");
    expect(mockGenerateAllReports).toHaveBeenCalledTimes(1);
  });

  it("Step 8: Cron endpoint rejects invalid secret", async () => {
    resetMocks();

    const res = await fetch(`${baseUrl}/api/reports/generate-all`, {
      method: "POST",
      headers: {
        Authorization: "Bearer wrong-secret",
      },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Unauthorized");
    expect(mockGenerateAllReports).not.toHaveBeenCalled();
  });

  it("Step 9: Returns 400 for household report when user has no household", async () => {
    resetMocks();

    adminResults = {
      profiles: {
        selectSingle: {
          data: { id: TEST_USER_ID, household_id: null },
          error: null,
        },
      },
    };

    const res = await fetch(`${baseUrl}/api/reports/household?month=2026-02-01`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("household");
  });
});
