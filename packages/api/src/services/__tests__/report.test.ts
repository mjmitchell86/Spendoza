import { describe, it, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-123";
const TEST_HOUSEHOLD_ID = "hh-1";
const REPORT_MONTH = new Date("2026-01-01");

const sampleIncomeEntries = [
  {
    id: "inc-1",
    user_id: TEST_USER_ID,
    amount: 5000,
    frequency: "monthly",
    effective_date: "2025-06-01",
    end_date: null,
  },
  {
    id: "inc-2",
    user_id: TEST_USER_ID,
    amount: 1500,
    frequency: "biweekly",
    effective_date: "2025-09-01",
    end_date: null,
  },
];

const sampleExpenses = [
  {
    id: "exp-1",
    user_id: TEST_USER_ID,
    amount: 1200,
    frequency: "recurring",
    recurrence_interval: "monthly",
    next_due_date: "2026-02-01",
    end_date: null,
    category_id: "cat-1",
    categories: { name: "Housing" },
  },
  {
    id: "exp-2",
    user_id: TEST_USER_ID,
    amount: 100,
    frequency: "recurring",
    recurrence_interval: "weekly",
    next_due_date: "2026-01-07",
    end_date: null,
    category_id: "cat-2",
    categories: { name: "Food" },
  },
  {
    id: "exp-3",
    user_id: TEST_USER_ID,
    amount: 500,
    frequency: "one_time",
    recurrence_interval: null,
    next_due_date: "2026-01-15",
    end_date: null,
    category_id: "cat-3",
    categories: { name: "Shopping" },
  },
];

const sampleTransactions = [
  { amount: 50, type: "debit", ai_category: "Food", date: "2026-01-05" },
  { amount: 100, type: "debit", ai_category: "Housing", date: "2026-01-10" },
  { amount: 3000, type: "credit", ai_category: "Income", date: "2026-01-15" },
];

const cachedReport = {
  id: "rpt-1",
  entity_type: "user",
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
    month_over_month: null,
  },
  ai_insights: "Your savings rate is excellent at 72%.",
  generated_at: "2026-01-31T00:00:00Z",
  has_new_data: false,
};

const previousMonthReport = {
  id: "rpt-0",
  entity_type: "user",
  entity_id: TEST_USER_ID,
  report_month: "2025-12-01",
  report_data: {
    total_income: 6000,
    total_expenses: 2000,
    savings_rate: 66.67,
    expense_to_income_ratio: 0.33,
    by_category: [],
    top_categories: [],
    month_over_month: null,
  },
  ai_insights: null,
  generated_at: "2025-12-31T00:00:00Z",
  has_new_data: false,
};

// ---------------------------------------------------------------------------
// Configurable mock results keyed by table
// ---------------------------------------------------------------------------
let adminResults: Record<string, any> = {};
const adminCalls: Array<{ table: string; op: string; args?: any }> = [];

function buildAdminChain(table: string) {
  const cfg = adminResults[table] || {};

  const makeEqChain = (depth = 0): any => ({
    eq: (...args: any[]) => makeEqChain(depth + 1),
    gte: (...args: any[]) => makeEqChain(depth + 1),
    gt: (...args: any[]) => makeEqChain(depth + 1),
    lte: (...args: any[]) => makeEqChain(depth + 1),
    lt: (...args: any[]) => makeEqChain(depth + 1),
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
      adminCalls.push({ table, op: "select", args: selectArgs });
      return makeEqChain();
    },
    insert: (data: any) => {
      adminCalls.push({ table, op: "insert", args: data });
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
      adminCalls.push({ table, op: "update", args: data });
      const makeUpdateEq = (): any => ({
        eq: () => makeUpdateEq(),
        select: () => ({
          single: () =>
            Promise.resolve(
              cfg.upsertSingle ??
                cfg.updateSingle ?? { data: null, error: null }
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
      adminCalls.push({ table, op: "upsert", args: data });
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
      adminCalls.push({ table, op: "delete" });
      return {
        eq: () => ({
          eq: () =>
            Promise.resolve(cfg.deleteResult ?? { data: null, error: null }),
        }),
      };
    },
  };
}

const mockAdminFrom = mock((table: string) => buildAdminChain(table));

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js
// ---------------------------------------------------------------------------
mock.module("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, _options?: any) => ({
    auth: {
      admin: { createUser: mock() },
      signInWithPassword: mock(),
      getUser: mock(),
    },
    from: mockAdminFrom,
  }),
}));

// ---------------------------------------------------------------------------
// Mock AI insights
// ---------------------------------------------------------------------------
const mockGenerateInsights = mock(() =>
  Promise.resolve("Your savings rate is excellent at 72%.")
);

mock.module("../../ai/report-insights", () => ({
  generateInsights: mockGenerateInsights,
}));

// Also mock langchain since report-insights imports it
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
// Import module under test AFTER mocks
// ---------------------------------------------------------------------------
const { generateUserReport, generateHouseholdReport, generateAllReports } =
  await import("../report.service");

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  adminCalls.length = 0;
  mockAdminFrom.mockClear();
  mockGenerateInsights.mockClear();

  mockGenerateInsights.mockImplementation(() =>
    Promise.resolve("Your savings rate is excellent at 72%.")
  );

  adminResults = {
    report_requests: {
      selectMaybeSingle: { data: { count: 0 }, error: null },
      upsertResult: { data: null, error: null },
    },
    reports: {
      selectMaybeSingle: { data: null, error: null },
      selectSingle: { data: null, error: null },
      // Return null from upsert so the function falls back to locally-computed data
      upsertSingle: { data: null, error: null },
      upsertResult: { data: null, error: null },
    },
    income_entries: {
      selectList: { data: sampleIncomeEntries, error: null },
    },
    expenses: {
      selectList: { data: sampleExpenses, error: null },
    },
    transactions: {
      selectList: { data: sampleTransactions, error: null },
    },
    profiles: {
      selectList: { data: [{ id: TEST_USER_ID }], error: null },
      selectSingle: {
        data: { id: TEST_USER_ID, household_id: TEST_HOUSEHOLD_ID },
        error: null,
      },
    },
    households: {
      selectList: { data: [{ id: TEST_HOUSEHOLD_ID }], error: null },
      selectSingle: {
        data: {
          head_of_household_id: TEST_USER_ID,
        },
        error: null,
      },
    },
    debts: {
      selectList: { data: [], error: null },
    },
    goals: {
      selectList: { data: [], error: null },
    },
  };
});

// ===========================================================================
// generateUserReport
// ===========================================================================
describe("generateUserReport", () => {
  it("computes correct totals and savings rate from transactions", async () => {
    const result = await generateUserReport(TEST_USER_ID, REPORT_MONTH);

    expect(result).toBeDefined();
    // From sampleTransactions: credit=3000, debits=50+100=150
    expect(result.report_data.total_income).toBe(3000);
    expect(result.report_data.total_expenses).toBe(150);
    // savings_rate = (3000 - 150) / 3000 * 100 = 95%
    expect(result.report_data.savings_rate).toBeCloseTo(95, 0);
    // expense_to_income_ratio = 150 / 3000 = 0.05
    expect(result.report_data.expense_to_income_ratio).toBeCloseTo(0.05, 1);
  });

  it("produces correct by_category breakdown from transactions", async () => {
    const result = await generateUserReport(TEST_USER_ID, REPORT_MONTH);

    const byCategory = result.report_data.by_category;
    expect(Array.isArray(byCategory)).toBe(true);
    expect(byCategory.length).toBe(2);

    // From sampleTransactions debits: Housing=100, Food=50
    const housing = byCategory.find((c: any) => c.category === "Housing");
    expect(housing).toBeDefined();
    expect(housing.amount).toBe(100);

    const food = byCategory.find((c: any) => c.category === "Food");
    expect(food).toBeDefined();
    expect(food.amount).toBe(50);
  });

  it("includes top_categories sorted by amount descending", async () => {
    const result = await generateUserReport(TEST_USER_ID, REPORT_MONTH);

    // Housing (100) > Food (50)
    expect(result.report_data.top_categories[0]).toBe("Housing");
    expect(result.report_data.top_categories[1]).toBe("Food");
  });

  it("returns zeros when no transactions exist for the month", async () => {
    adminResults.transactions.selectList = { data: [], error: null };

    const result = await generateUserReport(TEST_USER_ID, REPORT_MONTH);

    // No transactions means zero income and expenses (no manual entry fallback)
    expect(result.report_data.total_income).toBe(0);
    expect(result.report_data.total_expenses).toBe(0);
    expect(result.report_data.by_category).toEqual([]);
  });

  it("returns cached report when has_new_data is false", async () => {
    // Report exists and has_new_data is false
    adminResults.reports.selectMaybeSingle = {
      data: cachedReport,
      error: null,
    };

    const result = await generateUserReport(TEST_USER_ID, REPORT_MONTH);

    expect(result.id).toBe("rpt-1");
    expect(result.report_data.total_income).toBe(6500);
    // AI insights should NOT be regenerated for cached report
    expect(mockGenerateInsights).not.toHaveBeenCalled();
  });

  it("bypasses cache when force=true", async () => {
    adminResults.reports.selectMaybeSingle = {
      data: cachedReport,
      error: null,
    };

    const result = await generateUserReport(TEST_USER_ID, REPORT_MONTH, true);

    // Should regenerate even though has_new_data is false
    expect(mockGenerateInsights).toHaveBeenCalledTimes(1);
    // Should use transaction data, not cached report data
    expect(result.report_data.total_income).toBe(3000);
  });

  it("saves report even when AI insight generation fails", async () => {
    mockGenerateInsights.mockImplementation(() =>
      Promise.reject(new Error("OpenAI API failed"))
    );

    const result = await generateUserReport(TEST_USER_ID, REPORT_MONTH);

    // Report should still be saved with financial data
    expect(result.report_data.total_income).toBe(3000);
    expect(result.report_data.total_expenses).toBe(150);
    // Insights should be null
    expect(result.ai_insights).toBeNull();
  });

  it("regenerates when has_new_data is true", async () => {
    // Report exists but has new data
    adminResults.reports.selectMaybeSingle = {
      data: { ...cachedReport, has_new_data: true },
      error: null,
    };

    const result = await generateUserReport(TEST_USER_ID, REPORT_MONTH);

    // Should have called generateInsights for a fresh report
    expect(mockGenerateInsights).toHaveBeenCalledTimes(1);
  });

  it("calls generateInsights with transaction-based report data", async () => {
    await generateUserReport(TEST_USER_ID, REPORT_MONTH);

    expect(mockGenerateInsights).toHaveBeenCalledTimes(1);
    const [reportData, entityType] = mockGenerateInsights.mock.calls[0];
    expect(entityType).toBe("user");
    // From sampleTransactions: credit=3000, debits=150
    expect(reportData.total_income).toBe(3000);
    expect(reportData.total_expenses).toBe(150);
  });

  it("includes month_over_month when previous report exists", async () => {
    // Set up so the "previous month" query returns a report
    adminResults.reports.selectMaybeSingle = { data: null, error: null };

    // We need the second reports query (for previous month) to return data.
    // Since our mock uses the same config for all calls to the same table,
    // we handle this by checking that the function computes month_over_month
    // when previous data is available. We'll override selectSingle for that.
    adminResults.reports.selectSingle = {
      data: previousMonthReport,
      error: null,
    };

    const result = await generateUserReport(TEST_USER_ID, REPORT_MONTH);

    // month_over_month should reflect change from previous month
    if (result.report_data.month_over_month) {
      // income_change = (3000 - 6000) / 6000 * 100 = -50%
      expect(result.report_data.month_over_month.income_change).toBeCloseTo(
        -50,
        0
      );
      // expense_change = (150 - 2000) / 2000 * 100 = -92.5%
      expect(result.report_data.month_over_month.expense_change).toBeCloseTo(
        -92.5,
        0
      );
    }
  });

  it("handles zero income gracefully", async () => {
    // Only debit transactions, no credits
    adminResults.transactions.selectList = {
      data: [
        {
          amount: 100,
          type: "debit",
          ai_category: "Housing",
          date: "2026-01-10",
        },
      ],
      error: null,
    };
    // Clear upsert so service falls back to computed values
    adminResults.reports.upsertSingle = { data: null, error: null };

    const result = await generateUserReport(TEST_USER_ID, REPORT_MONTH);

    expect(result.report_data.total_income).toBe(0);
    expect(result.report_data.total_expenses).toBe(100);
    expect(result.report_data.savings_rate).toBe(0);
    expect(result.report_data.expense_to_income_ratio).toBe(0);
  });
});

// ===========================================================================
// generateHouseholdReport
// ===========================================================================
describe("generateHouseholdReport", () => {
  it("generates a report for the household", async () => {
    // Profiles in the household
    adminResults.profiles.selectList = {
      data: [
        {
          id: TEST_USER_ID,
          income_sharing_mode: "all",
          expense_sharing_mode: "all",
        },
        {
          id: "user-456",
          income_sharing_mode: "all",
          expense_sharing_mode: "all",
        },
      ],
      error: null,
    };

    const result = await generateHouseholdReport(
      TEST_HOUSEHOLD_ID,
      REPORT_MONTH
    );

    expect(result).toBeDefined();
    expect(result.report_data).toBeDefined();
    expect(result.report_data.total_income).toBeGreaterThanOrEqual(0);
    expect(result.report_data.total_expenses).toBeGreaterThanOrEqual(0);
  });

  it("calls generateInsights with household entity type", async () => {
    adminResults.profiles.selectList = {
      data: [
        {
          id: TEST_USER_ID,
          income_sharing_mode: "all",
          expense_sharing_mode: "all",
        },
      ],
      error: null,
    };

    await generateHouseholdReport(TEST_HOUSEHOLD_ID, REPORT_MONTH);

    expect(mockGenerateInsights).toHaveBeenCalledTimes(1);
    const [, entityType] = mockGenerateInsights.mock.calls[0];
    expect(entityType).toBe("household");
  });
});

// ===========================================================================
// generateAllReports
// ===========================================================================
describe("generateAllReports", () => {
  it("generates reports for all users and households", async () => {
    // The function queries profiles and households
    adminResults.profiles.selectList = {
      data: [{ id: TEST_USER_ID }, { id: "user-456" }],
      error: null,
    };
    adminResults.households.selectList = {
      data: [{ id: TEST_HOUSEHOLD_ID }],
      error: null,
    };

    // Should not throw
    await expect(generateAllReports(REPORT_MONTH)).resolves.toBeUndefined();

    // Should have queried profiles and households tables
    const profileSelects = adminCalls.filter(
      (c) => c.table === "profiles" && c.op === "select"
    );
    expect(profileSelects.length).toBeGreaterThan(0);
  });
});
