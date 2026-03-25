import { describe, it, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";
import type { Server } from "http";
import type { Router } from "express";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-123";
const TEST_TOKEN = "valid-access-token";
const TEST_HOUSEHOLD_ID = "hh-abc";

const sampleReport = {
  id: "rpt-1",
  entity_type: "user",
  entity_id: TEST_USER_ID,
  report_month: "2026-03-01",
  report_data: {
    total_income: 6000,
    total_expenses: 4000,
    savings_rate: 33.3,
    by_category: [
      { category: "Housing", amount: 1500, percentage: 37.5 },
      { category: "Food", amount: 500, percentage: 12.5 },
    ],
    month_over_month: { income_change: 5, expense_change: -2 },
  },
  ai_insights: "You spent less on food this month.",
};

const sampleHouseholdReport = {
  ...sampleReport,
  entity_type: "household",
  entity_id: TEST_HOUSEHOLD_ID,
  report_data: {
    ...sampleReport.report_data,
    member_contributions: [
      { user_id: TEST_USER_ID, display_name: "Matt", income: 6000, expenses: 4000 },
    ],
  },
};

// ---------------------------------------------------------------------------
// Chainable mock: personal endpoint (uses req.supabase = per-user client)
// ---------------------------------------------------------------------------

// Tracks which table + columns are being queried
let lastTable = "";
let lastSelectCols = "";

// transactions count result
const mockTxnCount = mock(() => Promise.resolve({ count: 5 }));

// transactions select for computeFromTransactions
const mockTxnData = mock(() =>
  Promise.resolve({
    data: [
      { amount: 6000, type: "credit", ai_category: "Salary", date: "2026-03-15" },
      { amount: 1500, type: "debit", ai_category: "Housing", date: "2026-03-01" },
      { amount: 500, type: "debit", ai_category: "Food", date: "2026-03-10" },
    ],
    error: null,
  })
);

// transactions for range query
const mockTxnRangeData = mock(() =>
  Promise.resolve({
    data: [
      { amount: 6000, type: "credit", ai_category: "Salary", date: "2026-03-15" },
      { amount: 2000, type: "debit", ai_category: "Housing", date: "2026-03-01" },
    ],
    error: null,
  })
);

// reports maybeSingle
const mockReportMaybeSingle = mock(() =>
  Promise.resolve({ data: sampleReport, error: null })
);

// latest AI insights report
const mockLatestInsightsMaybeSingle = mock(() =>
  Promise.resolve({
    data: { ai_insights: "You are doing great.", report_month: "2026-03-01" },
    error: null,
  })
);

// findLatestTransactionMonth
const mockLatestTxn = mock(() =>
  Promise.resolve({ data: [{ date: "2026-03-15" }], error: null })
);

// Build a flexible per-user client mock
const mockUserFrom = mock((table: string) => {
  lastTable = table;

  if (table === "transactions") {
    return {
      select: (cols: string, opts?: any) => {
        lastSelectCols = cols;
        if (opts?.count === "exact") {
          // count query: .select("id", { count: "exact", head: true }).eq(...).gte(...).lt(...)
          return {
            eq: () => ({
              gte: () => ({
                lt: mockTxnCount,
                lte: mockTxnCount, // range variant
              }),
              lte: mockTxnCount, // range variant without from
              in: () => ({
                gte: () => ({ lt: mockTxnCount }),
              }),
            }),
            in: () => ({
              gte: () => ({
                lt: mockTxnCount,
                lte: mockTxnCount,
              }),
              lte: mockTxnCount,
            }),
          };
        }
        // data query: .select("amount, type, ai_category, date").eq(...).gte(...).lt(...)
        return {
          eq: () => ({
            gte: () => ({
              lt: mockTxnData,
              lte: () => ({ order: mockTxnRangeData }),
            }),
            lte: () => ({ order: mockTxnRangeData }),
            order: mockTxnRangeData, // no gte/lte
          }),
        };
      },
    };
  }

  if (table === "reports") {
    return {
      select: (cols: string) => {
        if (cols === "ai_insights, report_month") {
          return {
            eq: () => ({
              eq: () => ({
                not: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: mockLatestInsightsMaybeSingle,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        // select("*") for report fetch
        return {
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: mockReportMaybeSingle,
              }),
            }),
          }),
        };
      },
    };
  }

  // fallback
  return {
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: () => mockLatestTxn,
        }),
      }),
    }),
  };
});

// ---------------------------------------------------------------------------
// Chainable mock: supabaseAdmin (for household queries + auth)
// ---------------------------------------------------------------------------
const mockProfileSingle = mock(() =>
  Promise.resolve({ data: { household_id: TEST_HOUSEHOLD_ID }, error: null })
);

const mockHouseholdMembers = mock(() =>
  Promise.resolve({
    data: [
      {
        id: TEST_USER_ID,
        display_name: "Matt",
        income_sharing_mode: "all",
        expense_sharing_mode: "all",
      },
    ],
    error: null,
  })
);

const mockHouseholdMemberIds = mock(() =>
  Promise.resolve({
    data: [{ id: TEST_USER_ID }],
    error: null,
  })
);

// Household transaction data for computeHouseholdFromTransactions
const mockHouseholdTxnData = mock(() =>
  Promise.resolve({
    data: [
      { amount: 6000, type: "credit", ai_category: "Salary" },
      { amount: 2000, type: "debit", ai_category: "Housing" },
    ],
    error: null,
  })
);

const mockHouseholdTxnCount = mock(() => Promise.resolve({ count: 3 }));

const mockHouseholdReportMaybeSingle = mock(() =>
  Promise.resolve({ data: null, error: null })
);

const mockHouseholdLatestInsightsMaybeSingle = mock(() =>
  Promise.resolve({ data: null, error: null })
);

const mockGetUser = mock(() =>
  Promise.resolve({
    data: {
      user: {
        id: TEST_USER_ID,
        email: "test@example.com",
      },
    },
    error: null,
  })
);

// supabaseAdmin.from() dispatcher
const mockAdminFrom = mock((table: string) => {
  if (table === "profiles") {
    return {
      select: (cols: string) => {
        if (cols === "household_id") {
          return {
            eq: () => ({ single: mockProfileSingle }),
          };
        }
        if (cols === "id") {
          return {
            eq: () => mockHouseholdMemberIds(),
          };
        }
        // "id, display_name, income_sharing_mode, expense_sharing_mode"
        return {
          eq: () => mockHouseholdMembers(),
        };
      },
    };
  }

  if (table === "transactions") {
    return {
      select: (cols: string, opts?: any) => {
        if (opts?.count === "exact") {
          return {
            in: () => ({
              gte: () => ({
                lt: mockHouseholdTxnCount,
                lte: mockHouseholdTxnCount,
              }),
              lte: mockHouseholdTxnCount,
            }),
          };
        }
        if (cols === "date") {
          return {
            in: () => ({
              order: () => ({
                limit: () =>
                  Promise.resolve({ data: [{ date: "2026-03-15" }], error: null }),
              }),
            }),
          };
        }
        // amount, type, ai_category
        return {
          eq: () => ({
            gte: () => ({
              lt: mockHouseholdTxnData,
            }),
            lte: () => mockHouseholdTxnData(),
          }),
        };
      },
    };
  }

  if (table === "reports") {
    return {
      select: (cols: string) => {
        if (cols === "ai_insights, report_month") {
          return {
            eq: () => ({
              eq: () => ({
                not: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: mockHouseholdLatestInsightsMaybeSingle,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: mockHouseholdReportMaybeSingle,
              }),
            }),
          }),
        };
      },
    };
  }

  return {
    select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
  };
});

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js
// ---------------------------------------------------------------------------
mock.module("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, options?: any) => {
    // Per-user client (created with Authorization header)
    if (options?.global?.headers?.Authorization) {
      return { from: mockUserFrom };
    }
    // Admin client
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
// Test helpers
// ---------------------------------------------------------------------------
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const express = (await import("express")).default;
  const { default: dashboardRouter } = (await import("../dashboard")) as { default: Router };
  const { requireAuth } = await import("../../middleware/auth");

  const app = express();
  app.use(express.json());
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
  // Clear all mocks
  mockTxnCount.mockClear();
  mockTxnData.mockClear();
  mockTxnRangeData.mockClear();
  mockReportMaybeSingle.mockClear();
  mockLatestInsightsMaybeSingle.mockClear();
  mockLatestTxn.mockClear();
  mockUserFrom.mockClear();
  mockProfileSingle.mockClear();
  mockHouseholdMembers.mockClear();
  mockHouseholdMemberIds.mockClear();
  mockHouseholdTxnData.mockClear();
  mockHouseholdTxnCount.mockClear();
  mockHouseholdReportMaybeSingle.mockClear();
  mockHouseholdLatestInsightsMaybeSingle.mockClear();
  mockGetUser.mockClear();
  mockAdminFrom.mockClear();

  // Reset defaults
  mockGetUser.mockImplementation(() =>
    Promise.resolve({
      data: { user: { id: TEST_USER_ID, email: "test@example.com" } },
      error: null,
    })
  );

  mockTxnCount.mockImplementation(() => Promise.resolve({ count: 5 }));
  mockReportMaybeSingle.mockImplementation(() =>
    Promise.resolve({ data: sampleReport, error: null })
  );
  mockLatestInsightsMaybeSingle.mockImplementation(() =>
    Promise.resolve({
      data: { ai_insights: "You are doing great.", report_month: "2026-03-01" },
      error: null,
    })
  );
  mockProfileSingle.mockImplementation(() =>
    Promise.resolve({ data: { household_id: TEST_HOUSEHOLD_ID }, error: null })
  );
  mockHouseholdMembers.mockImplementation(() =>
    Promise.resolve({
      data: [
        {
          id: TEST_USER_ID,
          display_name: "Matt",
          income_sharing_mode: "all",
          expense_sharing_mode: "all",
        },
      ],
      error: null,
    })
  );
  mockHouseholdMemberIds.mockImplementation(() =>
    Promise.resolve({ data: [{ id: TEST_USER_ID }], error: null })
  );
  mockHouseholdTxnData.mockImplementation(() =>
    Promise.resolve({
      data: [
        { amount: 6000, type: "credit", ai_category: "Salary" },
        { amount: 2000, type: "debit", ai_category: "Housing" },
      ],
      error: null,
    })
  );
  mockHouseholdTxnCount.mockImplementation(() => Promise.resolve({ count: 3 }));
  mockHouseholdReportMaybeSingle.mockImplementation(() =>
    Promise.resolve({ data: null, error: null })
  );
  mockHouseholdLatestInsightsMaybeSingle.mockImplementation(() =>
    Promise.resolve({ data: null, error: null })
  );
});

// ===========================================================================
// GET /api/dashboard/personal
// ===========================================================================
describe("GET /api/dashboard/personal", () => {
  const url = (params?: string) =>
    `${baseUrl}/api/dashboard/personal${params ? `?${params}` : ""}`;

  it("returns 200 with dashboard data for a month (report exists with data)", async () => {
    const res = await fetch(url("month=2026-03-01"), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toBeDefined();
    expect(body.summary.total_income).toBe(6000);
    expect(body.summary.total_expenses).toBe(4000);
    expect(body.by_category).toBeDefined();
    expect(body.has_transactions).toBe(true);
    expect(body.month).toBe("2026-03-01");
  });

  it("returns 200 with computed data for range query", async () => {
    const res = await fetch(url("from_date=2026-01-01&to_date=2026-03-31"), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toBeDefined();
    expect(body.has_transactions).toBe(true);
  });

  it("returns 401 without auth token", async () => {
    const res = await fetch(url("month=2026-03-01"));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Missing authorization header");
  });
});

// ===========================================================================
// GET /api/dashboard/household
// ===========================================================================
describe("GET /api/dashboard/household", () => {
  const url = (params?: string) =>
    `${baseUrl}/api/dashboard/household${params ? `?${params}` : ""}`;

  it("returns 200 with household dashboard data for a month", async () => {
    const res = await fetch(url("month=2026-03-01"), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toBeDefined();
    expect(body.summary.total_income).toBeGreaterThanOrEqual(0);
    expect(body.member_contributions).toBeDefined();
  });

  it("returns 400 when user has no household", async () => {
    mockProfileSingle.mockImplementation(() =>
      Promise.resolve({ data: { household_id: null }, error: null })
    );

    const res = await fetch(url("month=2026-03-01"), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("household");
  });
});
