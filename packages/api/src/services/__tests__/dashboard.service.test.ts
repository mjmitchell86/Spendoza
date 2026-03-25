import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { ServiceContext } from "../context";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-123";
const TEST_EMAIL = "test@example.com";
const TEST_HOUSEHOLD_ID = "hh-abc";

const sampleTransactions = [
  { amount: 6000, type: "credit", ai_category: "Salary", date: "2026-03-15" },
  { amount: 1500, type: "debit", ai_category: "Housing", date: "2026-03-01" },
  { amount: 500, type: "debit", ai_category: "Food", date: "2026-03-10" },
  { amount: 300, type: "debit", ai_category: "Food", date: "2026-03-20" },
];

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

// ---------------------------------------------------------------------------
// Mocks: per-user Supabase client (ctx.supabase)
// ---------------------------------------------------------------------------
const mockTxnCount = mock(() => Promise.resolve({ count: 5 }));

const mockTxnData = mock(() =>
  Promise.resolve({ data: sampleTransactions, error: null })
);

const mockTxnRangeData = mock(() =>
  Promise.resolve({ data: sampleTransactions, error: null })
);

const mockReportMaybeSingle = mock(() =>
  Promise.resolve({ data: sampleReport, error: null })
);

const mockLatestInsightsMaybeSingle = mock(() =>
  Promise.resolve({
    data: { ai_insights: "You are doing great.", report_month: "2026-03-01" },
    error: null,
  })
);

const mockLatestTxn = mock(() =>
  Promise.resolve({ data: [{ date: "2026-03-15" }], error: null })
);

const mockUserFrom = mock((table: string) => {
  if (table === "transactions") {
    return {
      select: (cols: string, opts?: any) => {
        if (opts?.count === "exact") {
          return {
            eq: () => ({
              gte: () => ({
                lt: mockTxnCount,
                lte: mockTxnCount,
              }),
              lte: mockTxnCount,
            }),
          };
        }
        if (cols === "date") {
          return {
            eq: () => ({
              order: () => ({
                limit: mockLatestTxn,
              }),
            }),
          };
        }
        // data query
        return {
          eq: () => ({
            gte: () => ({
              lt: mockTxnData,
              lte: () => ({ order: mockTxnRangeData }),
            }),
            lte: () => ({ order: mockTxnRangeData }),
            order: mockTxnRangeData,
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

  return {
    select: () => ({
      eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
    }),
  };
});

// ---------------------------------------------------------------------------
// Mocks: supabaseAdmin (ctx.supabaseAdmin)
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
  Promise.resolve({ data: [{ id: TEST_USER_ID }], error: null })
);

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

const mockAdminFrom = mock((table: string) => {
  if (table === "profiles") {
    return {
      select: (cols: string) => {
        if (cols === "household_id") {
          return { eq: () => ({ single: mockProfileSingle }) };
        }
        if (cols === "id") {
          return { eq: () => mockHouseholdMemberIds() };
        }
        // "id, display_name, income_sharing_mode, expense_sharing_mode"
        return { eq: () => mockHouseholdMembers() };
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
        // "amount, type, ai_category"
        return {
          eq: () => ({
            gte: () => ({
              lt: mockHouseholdTxnData,
              lte: () => mockHouseholdTxnData(),
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
    select: () => ({
      eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
    }),
  };
});

// ---------------------------------------------------------------------------
// Build ServiceContext
// ---------------------------------------------------------------------------
const ctx: ServiceContext = {
  supabase: { from: mockUserFrom } as any,
  supabaseAdmin: { from: mockAdminFrom } as any,
  userId: TEST_USER_ID,
  email: TEST_EMAIL,
};

// ---------------------------------------------------------------------------
// Reset mocks
// ---------------------------------------------------------------------------
beforeEach(() => {
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
  mockAdminFrom.mockClear();

  // Reset defaults
  mockTxnCount.mockImplementation(() => Promise.resolve({ count: 5 }));
  mockTxnData.mockImplementation(() =>
    Promise.resolve({ data: sampleTransactions, error: null })
  );
  mockTxnRangeData.mockImplementation(() =>
    Promise.resolve({ data: sampleTransactions, error: null })
  );
  mockReportMaybeSingle.mockImplementation(() =>
    Promise.resolve({ data: sampleReport, error: null })
  );
  mockLatestInsightsMaybeSingle.mockImplementation(() =>
    Promise.resolve({
      data: { ai_insights: "You are doing great.", report_month: "2026-03-01" },
      error: null,
    })
  );
  mockLatestTxn.mockImplementation(() =>
    Promise.resolve({ data: [{ date: "2026-03-15" }], error: null })
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

// ---------------------------------------------------------------------------
// Import the service (after mocks are set up)
// ---------------------------------------------------------------------------
const {
  aggregateTransactions,
  toDashboardResponse,
  monthRange,
  getPersonalDashboardForMonth,
  getPersonalDashboardForRange,
  getHouseholdDashboardForMonth,
  getHouseholdDashboardForRange,
} = await import("../dashboard.service");

// ===========================================================================
// aggregateTransactions (pure helper)
// ===========================================================================
describe("aggregateTransactions", () => {
  it("correctly groups debits by category and calculates totals", () => {
    const result = aggregateTransactions(sampleTransactions);

    expect(result.summary.total_income).toBe(6000);
    expect(result.summary.total_expenses).toBe(2300); // 1500 + 500 + 300
    expect(result.summary.net).toBe(3700);
    expect(result.summary.savings_rate).toBeCloseTo(61.67, 1);
    expect(result.by_category).toHaveLength(2);
    // Sorted by amount descending
    expect(result.by_category[0].category).toBe("Housing");
    expect(result.by_category[0].amount).toBe(1500);
    expect(result.by_category[1].category).toBe("Food");
    expect(result.by_category[1].amount).toBe(800); // 500 + 300
  });

  it("handles empty transaction array", () => {
    const result = aggregateTransactions([]);

    expect(result.summary.total_income).toBe(0);
    expect(result.summary.total_expenses).toBe(0);
    expect(result.summary.savings_rate).toBe(0);
    expect(result.summary.net).toBe(0);
    expect(result.by_category).toHaveLength(0);
  });

  it("handles transactions with null amounts", () => {
    const txns = [
      { amount: null, type: "debit", ai_category: "Food", date: "2026-03-01" },
      { amount: 100, type: "debit", ai_category: "Food", date: "2026-03-02" },
    ];
    const result = aggregateTransactions(txns);

    expect(result.summary.total_expenses).toBe(100);
  });

  it("handles transactions with missing category", () => {
    const txns = [
      { amount: 50, type: "debit", ai_category: null, date: "2026-03-01" },
    ];
    const result = aggregateTransactions(txns);

    expect(result.by_category[0].category).toBe("Uncategorized");
  });
});

// ===========================================================================
// toDashboardResponse (pure helper)
// ===========================================================================
describe("toDashboardResponse", () => {
  it("normalizes report into dashboard shape", () => {
    const result = toDashboardResponse(sampleReport);

    expect(result.summary.total_income).toBe(6000);
    expect(result.summary.total_expenses).toBe(4000);
    expect(result.summary.net).toBe(2000);
    expect(result.summary.savings_rate).toBe(33.3);
    expect(result.by_category).toHaveLength(2);
    expect(result.trends).toEqual({ income_change: 5, expense_change: -2 });
    expect(result.insights).toBe("You spent less on food this month.");
  });

  it("handles legacy by_category object format", () => {
    const legacyReport = {
      report_data: {
        total_income: 5000,
        total_expenses: 3000,
        savings_rate: 40,
        by_category: { Housing: 1200, Food: 600 },
        month_over_month: null,
      },
      ai_insights: null,
    };

    const result = toDashboardResponse(legacyReport);

    expect(result.by_category).toHaveLength(2);
    expect(result.by_category[0].category).toBe("Housing");
    expect(result.by_category[0].amount).toBe(1200);
    expect(result.trends).toEqual({ income_change: 0, expense_change: 0 });
    expect(result.insights).toBeNull();
  });
});

// ===========================================================================
// monthRange (pure helper)
// ===========================================================================
describe("monthRange", () => {
  it("returns correct start and next month", () => {
    const result = monthRange("2026-03-01");
    expect(result.startDate).toBe("2026-03-01");
    expect(result.nextMonth).toBe("2026-04-01");
  });

  it("handles December correctly (year rollover)", () => {
    const result = monthRange("2026-12-01");
    expect(result.startDate).toBe("2026-12-01");
    expect(result.nextMonth).toBe("2027-01-01");
  });

  it("handles January", () => {
    const result = monthRange("2026-01-01");
    expect(result.startDate).toBe("2026-01-01");
    expect(result.nextMonth).toBe("2026-02-01");
  });
});

// ===========================================================================
// getPersonalDashboardForMonth
// ===========================================================================
describe("getPersonalDashboardForMonth", () => {
  it("returns report data when report exists with meaningful data", async () => {
    const result = await getPersonalDashboardForMonth(ctx, "2026-03-01");

    expect(result.summary.total_income).toBe(6000);
    expect(result.summary.total_expenses).toBe(4000);
    expect(result.has_transactions).toBe(true);
    expect(result.month).toBe("2026-03-01");
  });

  it("computes from transactions when no report exists", async () => {
    mockReportMaybeSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: null })
    );

    const result = await getPersonalDashboardForMonth(ctx, "2026-03-01");

    expect(result.summary).toBeDefined();
    expect(result.summary.total_income).toBe(6000);
    expect(result.has_transactions).toBe(true);
    expect(result.month).toBe("2026-03-01");
  });

  it("computes from transactions when report has zero data", async () => {
    mockReportMaybeSingle.mockImplementation(() =>
      Promise.resolve({
        data: {
          ...sampleReport,
          report_data: {
            total_income: 0,
            total_expenses: 0,
            savings_rate: 0,
            by_category: [],
          },
        },
        error: null,
      })
    );

    const result = await getPersonalDashboardForMonth(ctx, "2026-03-01");

    expect(result.summary).toBeDefined();
    // Should be computed from transactions, not from report
    expect(result.month).toBe("2026-03-01");
  });

  it("includes latest_transaction_month when no transactions in requested month", async () => {
    mockTxnCount.mockImplementation(() => Promise.resolve({ count: 0 }));
    mockReportMaybeSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: null })
    );

    const result = await getPersonalDashboardForMonth(ctx, "2026-01-01");

    expect(result.has_transactions).toBe(false);
    // findLatestTransactionMonth should have been called
    expect(result.latest_transaction_month).toBeDefined();
  });
});

// ===========================================================================
// getPersonalDashboardForRange
// ===========================================================================
describe("getPersonalDashboardForRange", () => {
  it("computes from transactions for a date range", async () => {
    const result = await getPersonalDashboardForRange(ctx, "2026-01-01", "2026-03-31");

    expect(result.summary).toBeDefined();
    expect(result.has_transactions).toBe(true);
  });

  it("includes latest insights when available", async () => {
    const result = await getPersonalDashboardForRange(ctx, "2026-01-01", "2026-03-31");

    expect(result.insights).toBe("You are doing great.");
    expect(result.insights_month).toBe("2026-03-01");
  });
});

// ===========================================================================
// getHouseholdDashboardForMonth
// ===========================================================================
describe("getHouseholdDashboardForMonth", () => {
  it("computes household dashboard from member transactions", async () => {
    const result = await getHouseholdDashboardForMonth(ctx, TEST_HOUSEHOLD_ID, "2026-03-01");

    expect(result.summary).toBeDefined();
    expect(result.summary.total_income).toBe(6000);
    expect(result.summary.total_expenses).toBe(2000);
    expect(result.member_contributions).toBeDefined();
    expect(result.member_contributions).toHaveLength(1);
    expect(result.member_contributions[0].display_name).toBe("Matt");
    expect(result.month).toBe("2026-03-01");
  });

  it("uses report when it exists with meaningful data", async () => {
    const hhReport = {
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
    mockHouseholdReportMaybeSingle.mockImplementation(() =>
      Promise.resolve({ data: hhReport, error: null })
    );

    const result = await getHouseholdDashboardForMonth(ctx, TEST_HOUSEHOLD_ID, "2026-03-01");

    expect(result.summary.total_income).toBe(6000);
    expect(result.summary.total_expenses).toBe(4000);
    expect(result.member_contributions).toBeDefined();
  });
});

// ===========================================================================
// getHouseholdDashboardForRange
// ===========================================================================
describe("getHouseholdDashboardForRange", () => {
  it("computes household dashboard for a date range", async () => {
    const result = await getHouseholdDashboardForRange(
      ctx,
      TEST_HOUSEHOLD_ID,
      "2026-01-01",
      "2026-03-31"
    );

    expect(result.summary).toBeDefined();
    expect(result.has_transactions).toBeDefined();
    expect(result.member_contributions).toBeDefined();
  });
});
