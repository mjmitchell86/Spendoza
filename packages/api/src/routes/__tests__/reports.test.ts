import { describe, it, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";
import type { Server } from "http";
import type { Router } from "express";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-123";
const TEST_USER_EMAIL = "test@example.com";
const TEST_TOKEN = "valid-access-token";
const TEST_HOUSEHOLD_ID = "hh-1";
const CRON_SECRET = "test-cron-secret-abc";

const sampleReport = {
  id: "rpt-1",
  entity_type: "user" as const,
  entity_id: TEST_USER_ID,
  report_month: "2026-01-01",
  report_data: {
    total_income: 6500,
    total_expenses: 1800,
    savings_rate: 72.31,
    expense_to_income_ratio: 0.28,
    by_category: [
      { category: "Housing", amount: 1200, percentage: 66.67 },
      { category: "Food", amount: 600, percentage: 33.33 },
    ],
    top_categories: ["Housing", "Food"],
    month_over_month: { income_change: 5.0, expense_change: -3.0 },
  },
  ai_insights: "Your savings rate is excellent.",
  generated_at: "2026-01-31T00:00:00Z",
  has_new_data: false,
};

const sampleHouseholdReport = {
  ...sampleReport,
  id: "rpt-2",
  entity_type: "household" as const,
  entity_id: TEST_HOUSEHOLD_ID,
};

// ---------------------------------------------------------------------------
// Configurable mock results keyed by table
// ---------------------------------------------------------------------------
let adminResults: Record<string, any> = {};
let rlsResults: Record<string, any> = {};
const adminCalls: Array<{ table: string; op: string; args?: any }> = [];

function buildChain(results: Record<string, any>, calls: typeof adminCalls) {
  return (table: string) => {
    const cfg = results[table] || {};

    const makeEqChain = (depth = 0): any => ({
      eq: (...args: any[]) => makeEqChain(depth + 1),
      gte: (...args: any[]) => makeEqChain(depth + 1),
      lte: (...args: any[]) => makeEqChain(depth + 1),
      or: (...args: any[]) => makeEqChain(depth + 1),
      is: (...args: any[]) => makeEqChain(depth + 1),
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
// Mock supabaseAdmin (auth middleware uses getUser)
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

const mockAdminFrom = mock((...args: any[]) =>
  buildChain(adminResults, adminCalls)(args[0])
);

const mockRlsFrom = mock((...args: any[]) =>
  buildChain(rlsResults, adminCalls)(args[0])
);

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Mock AI insights and langchain
// ---------------------------------------------------------------------------
const mockGenerateInsights = mock(() =>
  Promise.resolve("Your savings rate is excellent.")
);

mock.module("../../ai/report-insights", () => ({
  generateInsights: mockGenerateInsights,
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
    constructor(c: string) {
      this.content = c;
    }
  },
  HumanMessage: class {
    content: string;
    constructor(c: string) {
      this.content = c;
    }
  },
}));

// ---------------------------------------------------------------------------
// Mock report service for route tests
// ---------------------------------------------------------------------------
const mockGenerateUserReport = mock(() => Promise.resolve(sampleReport));
const mockGenerateHouseholdReport = mock(() =>
  Promise.resolve(sampleHouseholdReport)
);
const mockGenerateAllReports = mock(() => Promise.resolve());

mock.module("../../services/report.service", () => ({
  generateUserReport: mockGenerateUserReport,
  generateHouseholdReport: mockGenerateHouseholdReport,
  generateAllReports: mockGenerateAllReports,
}));

// ---------------------------------------------------------------------------
// Set env vars before import
// ---------------------------------------------------------------------------
process.env.CRON_SECRET = CRON_SECRET;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const express = (await import("express")).default;
  const { default: reportsRouter } = (await import("../reports")) as {
    default: Router;
  };
  const { default: dashboardRouter } = (await import("../dashboard")) as {
    default: Router;
  };
  const { requireAuth } = await import("../../middleware/auth");

  const app = express();
  app.use(express.json());

  // Mount cron endpoint separately without auth (matches implementation plan)
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

beforeEach(() => {
  adminCalls.length = 0;
  mockAdminFrom.mockClear();
  mockRlsFrom.mockClear();
  mockGetUser.mockClear();
  mockGenerateInsights.mockClear();
  mockGenerateUserReport.mockClear();
  mockGenerateHouseholdReport.mockClear();
  mockGenerateAllReports.mockClear();

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

  mockGenerateUserReport.mockImplementation(() =>
    Promise.resolve(sampleReport)
  );
  mockGenerateHouseholdReport.mockImplementation(() =>
    Promise.resolve(sampleHouseholdReport)
  );
  mockGenerateAllReports.mockImplementation(() => Promise.resolve());

  adminResults = {
    reports: {
      selectSingle: { data: sampleReport, error: null },
      selectMaybeSingle: { data: sampleReport, error: null },
    },
    report_requests: {
      selectMaybeSingle: { data: { request_count: 0 }, error: null },
      upsertResult: { data: null, error: null },
    },
    profiles: {
      selectSingle: {
        data: {
          id: TEST_USER_ID,
          household_id: TEST_HOUSEHOLD_ID,
        },
        error: null,
      },
    },
  };

  rlsResults = {
    reports: {
      selectSingle: { data: sampleReport, error: null },
      selectMaybeSingle: { data: sampleReport, error: null },
    },
    profiles: {
      selectSingle: {
        data: {
          id: TEST_USER_ID,
          household_id: TEST_HOUSEHOLD_ID,
        },
        error: null,
      },
    },
  };
});

// ===========================================================================
// GET /api/reports/personal
// ===========================================================================
describe("GET /api/reports/personal", () => {
  const url = (month?: string) => {
    const base = `${baseUrl}/api/reports/personal`;
    return month ? `${base}?month=${month}` : base;
  };

  it("returns 200 with personal report", async () => {
    const res = await fetch(url("2026-01-01"), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entity_type).toBe("user");
    expect(body.entity_id).toBe(TEST_USER_ID);
    expect(body.report_data.total_income).toBe(6500);
  });

  it("returns 404 when no report exists", async () => {
    adminResults.reports.selectSingle = { data: null, error: null };
    adminResults.reports.selectMaybeSingle = { data: null, error: null };

    const res = await fetch(url("2026-01-01"), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  it("returns 401 without auth token", async () => {
    const res = await fetch(url());

    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// GET /api/reports/household
// ===========================================================================
describe("GET /api/reports/household", () => {
  const url = (month?: string) => {
    const base = `${baseUrl}/api/reports/household`;
    return month ? `${base}?month=${month}` : base;
  };

  it("returns 200 with household report", async () => {
    adminResults.reports.selectSingle = {
      data: sampleHouseholdReport,
      error: null,
    };
    adminResults.reports.selectMaybeSingle = {
      data: sampleHouseholdReport,
      error: null,
    };

    const res = await fetch(url("2026-01-01"), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entity_type).toBe("household");
  });

  it("returns 400 when user has no household", async () => {
    adminResults.profiles.selectSingle = {
      data: { id: TEST_USER_ID, household_id: null },
      error: null,
    };

    const res = await fetch(url("2026-01-01"), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("household");
  });
});

// ===========================================================================
// POST /api/reports/generate
// ===========================================================================
describe("POST /api/reports/generate", () => {
  const url = () => `${baseUrl}/api/reports/generate`;

  it("returns 200 with generated report", async () => {
    adminResults.report_requests.selectMaybeSingle = {
      data: { request_count: 0 },
      error: null,
    };

    const res = await fetch(url(), {
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

  it("returns 429 when at monthly limit", async () => {
    adminResults.report_requests.selectMaybeSingle = {
      data: { request_count: 2 },
      error: null,
    };

    const res = await fetch(url(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
    });

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("Monthly report refresh limit reached");
  });

  it("returns 401 without auth token", async () => {
    const res = await fetch(url(), {
      method: "POST",
    });

    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// POST /api/reports/generate-all (cron endpoint)
// ===========================================================================
describe("POST /api/reports/generate-all", () => {
  const url = () => `${baseUrl}/api/reports/generate-all`;

  it("returns 200 with valid cron secret", async () => {
    const res = await fetch(url(), {
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

  it("returns 401 with invalid cron secret", async () => {
    const res = await fetch(url(), {
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

  it("returns 401 with no auth header", async () => {
    const res = await fetch(url(), {
      method: "POST",
    });

    expect(res.status).toBe(401);
    expect(mockGenerateAllReports).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// GET /api/dashboard/personal
// ===========================================================================
describe("GET /api/dashboard/personal", () => {
  const url = () => `${baseUrl}/api/dashboard/personal`;

  it("returns 200 with structured dashboard data", async () => {
    const res = await fetch(url(), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    // Should have structured summary
    expect(body.summary).toBeDefined();
    expect(body.summary.total_income).toBe(6500);
    expect(body.summary.total_expenses).toBe(1800);
    expect(body.summary.savings_rate).toBeCloseTo(72.31, 1);
    expect(body.summary.net).toBe(4700);

    // Should have by_category
    expect(Array.isArray(body.by_category)).toBe(true);

    // Should have trends
    expect(body.trends).toBeDefined();
    expect(body.trends.income_change).toBe(5.0);
    expect(body.trends.expense_change).toBe(-3.0);

    // Should have insights
    expect(body.insights).toBeDefined();
  });

  it("returns 404 when no report exists for dashboard", async () => {
    adminResults.reports.selectSingle = { data: null, error: null };
    adminResults.reports.selectMaybeSingle = { data: null, error: null };

    const res = await fetch(url(), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(404);
  });

  it("returns 401 without auth token", async () => {
    const res = await fetch(url());

    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// GET /api/dashboard/household
// ===========================================================================
describe("GET /api/dashboard/household", () => {
  const url = () => `${baseUrl}/api/dashboard/household`;

  it("returns 200 with household dashboard data", async () => {
    adminResults.reports.selectSingle = {
      data: sampleHouseholdReport,
      error: null,
    };
    adminResults.reports.selectMaybeSingle = {
      data: sampleHouseholdReport,
      error: null,
    };

    const res = await fetch(url(), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toBeDefined();
    expect(body.summary.total_income).toBe(6500);
  });

  it("returns 400 when user has no household", async () => {
    adminResults.profiles.selectSingle = {
      data: { id: TEST_USER_ID, household_id: null },
      error: null,
    };

    const res = await fetch(url(), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(400);
  });
});
