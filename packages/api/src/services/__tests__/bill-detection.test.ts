import { describe, it, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "user-123";

function makeTx(
  description: string,
  amount: number,
  date: string,
  aiCategory: string = "Subscriptions"
) {
  return { description, amount, date, type: "debit", ai_category: aiCategory };
}

// Monthly Netflix transactions (~30 days apart)
const monthlyNetflix = [
  makeTx("NETFLIX COM 12345", 15.99, "2025-10-01"),
  makeTx("NETFLIX COM 67890", 15.99, "2025-11-01"),
  makeTx("NETFLIX COM 11111", 15.99, "2025-12-01"),
];

// Weekly gym transactions (~7 days apart)
const weeklyGym = [
  makeTx("PLANET FITNESS", 10.0, "2025-12-01", "Health"),
  makeTx("PLANET FITNESS", 10.0, "2025-12-08", "Health"),
  makeTx("PLANET FITNESS", 10.0, "2025-12-15", "Health"),
  makeTx("PLANET FITNESS", 10.0, "2025-12-22", "Health"),
];

// Varying amounts within tolerance (within 20% of avg ~50.49)
const tolerantAmounts = [
  makeTx("SPOTIFY PREMIUM", 49.99, "2025-10-01"),
  makeTx("SPOTIFY PREMIUM", 50.99, "2025-11-01"),
  makeTx("SPOTIFY PREMIUM", 50.49, "2025-12-01"),
];

// High variance amounts (should be rejected)
const highVariance = [
  makeTx("RANDOM STORE", 10.0, "2025-10-01"),
  makeTx("RANDOM STORE", 100.0, "2025-11-01"),
  makeTx("RANDOM STORE", 10.0, "2025-12-01"),
];

// Same store, varying amounts (should be rejected — not a bill)
const groceryStore = [
  makeTx("WHOLE FOODS MKT", 45.23, "2025-10-01", "Groceries"),
  makeTx("WHOLE FOODS MKT", 67.89, "2025-11-01", "Groceries"),
  makeTx("WHOLE FOODS MKT", 52.14, "2025-12-01", "Groceries"),
];

// Consistent amounts but non-bill category (should be rejected by category filter)
const coffeeshop = [
  makeTx("STARBUCKS 12345", 5.99, "2025-10-01", "Dining"),
  makeTx("STARBUCKS 56789", 5.99, "2025-11-01", "Dining"),
  makeTx("STARBUCKS 99999", 5.99, "2025-12-01", "Dining"),
];

// Utility with moderate variation (should be accepted — real bill)
const electricBill = [
  makeTx("CITY ELECTRIC CO", 102.50, "2025-10-01", "Utilities"),
  makeTx("CITY ELECTRIC CO", 98.75, "2025-11-01", "Utilities"),
  makeTx("CITY ELECTRIC CO", 105.20, "2025-12-01", "Utilities"),
];

const userCategories = [
  { id: "cat-sub", name: "Subscriptions" },
  { id: "cat-health", name: "Health" },
  { id: "cat-food", name: "Food" },
  { id: "cat-util", name: "Utilities" },
  { id: "cat-dining", name: "Dining" },
];

// ---------------------------------------------------------------------------
// Configurable mock results keyed by table
// ---------------------------------------------------------------------------
let adminResults: Record<string, any> = {};
const adminCalls: Array<{ table: string; op: string; args?: any }> = [];

function buildAdminChain(table: string) {
  const cfg = adminResults[table] || {};

  const makeChain = (depth = 0): any => ({
    eq: (...args: any[]) => {
      adminCalls.push({ table, op: "eq", args });
      return makeChain(depth + 1);
    },
    gte: (...args: any[]) => makeChain(depth + 1),
    lte: (...args: any[]) => makeChain(depth + 1),
    lt: (...args: any[]) => makeChain(depth + 1),
    or: (...args: any[]) => makeChain(depth + 1),
    is: (...args: any[]) => makeChain(depth + 1),
    order: (...args: any[]) => makeChain(depth + 1),
    limit: (...args: any[]) => makeChain(depth + 1),
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
      return makeChain();
    },
    insert: (data: any) => {
      adminCalls.push({ table, op: "insert", args: data });
      return {
        select: () => ({
          single: () =>
            Promise.resolve(
              cfg.insertSingle ?? { data: null, error: null }
            ),
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
            Promise.resolve(
              cfg.upsertSingle ?? { data: null, error: null }
            ),
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
mock.module("../../ai/friendly-name-generator", () => ({
  generateFriendlyNames: async () => new Map<string, string>(),
}));

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
// Import module under test AFTER mocks
// ---------------------------------------------------------------------------
const {
  detectRecurringBills,
  normalizeDescription,
  detectInterval,
  calculateNextDueDate,
  isBillLikeCategory,
} = await import("../bill-detection.service");

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  adminCalls.length = 0;
  mockAdminFrom.mockClear();

  adminResults = {
    transactions: {
      selectList: { data: [...monthlyNetflix, ...weeklyGym], error: null },
    },
    categories: {
      selectList: { data: userCategories, error: null },
    },
    expenses: {
      selectList: { data: [], error: null },
      insertResult: { data: null, error: null },
      updateResult: { data: null, error: null },
    },
  };
});

// ===========================================================================
// Pure helper function tests
// ===========================================================================
describe("normalizeDescription", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeDescription("NETFLIX.COM/BILLING")).toBe("netflixcombilling");
  });

  it("removes long numbers (reference IDs)", () => {
    expect(normalizeDescription("NETFLIX COM 123456789")).toBe("netflix com");
  });

  it("preserves short numbers", () => {
    expect(normalizeDescription("PLAN 99")).toBe("plan 99");
  });

  it("collapses whitespace", () => {
    expect(normalizeDescription("NETFLIX   COM")).toBe("netflix com");
  });
});

describe("detectInterval", () => {
  it("detects weekly pattern", () => {
    const dates = ["2025-12-01", "2025-12-08", "2025-12-15", "2025-12-22"];
    expect(detectInterval(dates)).toBe("weekly");
  });

  it("detects biweekly pattern", () => {
    const dates = ["2025-10-01", "2025-10-15", "2025-10-29"];
    expect(detectInterval(dates)).toBe("biweekly");
  });

  it("detects monthly pattern", () => {
    const dates = ["2025-10-01", "2025-11-01", "2025-12-01"];
    expect(detectInterval(dates)).toBe("monthly");
  });

  it("detects quarterly pattern", () => {
    const dates = ["2025-01-15", "2025-04-15", "2025-07-15"];
    expect(detectInterval(dates)).toBe("quarterly");
  });

  it("detects annual pattern", () => {
    const dates = ["2023-06-01", "2024-06-01", "2025-06-01"];
    expect(detectInterval(dates)).toBe("annually");
  });

  it("returns null for single transaction", () => {
    expect(detectInterval(["2025-12-01"])).toBeNull();
  });

  it("returns null for irregular intervals", () => {
    const dates = ["2025-01-01", "2025-01-20", "2025-04-05"];
    expect(detectInterval(dates)).toBeNull();
  });
});

describe("calculateNextDueDate", () => {
  it("adds 7 days for weekly", () => {
    expect(calculateNextDueDate("2025-12-22", "weekly")).toBe("2025-12-29");
  });

  it("adds 14 days for biweekly", () => {
    expect(calculateNextDueDate("2025-12-15", "biweekly")).toBe("2025-12-29");
  });

  it("adds 1 month for monthly", () => {
    expect(calculateNextDueDate("2025-12-01", "monthly")).toBe("2026-01-01");
  });

  it("adds 3 months for quarterly", () => {
    expect(calculateNextDueDate("2025-10-01", "quarterly")).toBe("2026-01-01");
  });

  it("adds 1 year for annually", () => {
    expect(calculateNextDueDate("2025-06-01", "annually")).toBe("2026-06-01");
  });
});

describe("isBillLikeCategory", () => {
  it("accepts subscription categories", () => {
    expect(isBillLikeCategory("Subscriptions")).toBe(true);
    expect(isBillLikeCategory("Streaming")).toBe(true);
    expect(isBillLikeCategory("Membership")).toBe(true);
  });

  it("accepts utility categories", () => {
    expect(isBillLikeCategory("Utilities")).toBe(true);
    expect(isBillLikeCategory("Electric")).toBe(true);
    expect(isBillLikeCategory("Internet & Phone")).toBe(true);
  });

  it("accepts housing categories", () => {
    expect(isBillLikeCategory("Rent")).toBe(true);
    expect(isBillLikeCategory("Housing")).toBe(true);
    expect(isBillLikeCategory("Mortgage")).toBe(true);
  });

  it("accepts automotive and insurance", () => {
    expect(isBillLikeCategory("Automotive")).toBe(true);
    expect(isBillLikeCategory("Car Insurance")).toBe(true);
    expect(isBillLikeCategory("Insurance")).toBe(true);
  });

  it("accepts health/fitness (gym memberships)", () => {
    expect(isBillLikeCategory("Health")).toBe(true);
    expect(isBillLikeCategory("Gym")).toBe(true);
    expect(isBillLikeCategory("Fitness")).toBe(true);
  });

  it("rejects non-bill categories", () => {
    expect(isBillLikeCategory("Groceries")).toBe(false);
    expect(isBillLikeCategory("Dining")).toBe(false);
    expect(isBillLikeCategory("Shopping")).toBe(false);
    expect(isBillLikeCategory("Entertainment")).toBe(false);
    expect(isBillLikeCategory("Travel")).toBe(false);
    expect(isBillLikeCategory("Food")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isBillLikeCategory(null)).toBe(false);
  });
});

// ===========================================================================
// detectRecurringBills integration tests
// ===========================================================================
describe("detectRecurringBills", () => {
  it("detects monthly recurring bill (3 txns ~30 days apart)", async () => {
    adminResults.transactions.selectList = {
      data: monthlyNetflix,
      error: null,
    };

    await detectRecurringBills(TEST_USER_ID);

    const inserts = adminCalls.filter(
      (c) => c.table === "expenses" && c.op === "insert"
    );
    expect(inserts.length).toBe(1);
    expect(inserts[0].args.recurrence_interval).toBe("monthly");
    expect(inserts[0].args.auto_detected).toBe(true);
    expect(inserts[0].args.amount).toBeCloseTo(15.99, 2);
  });

  it("detects weekly recurring bill (4 txns ~7 days apart)", async () => {
    adminResults.transactions.selectList = {
      data: weeklyGym,
      error: null,
    };

    await detectRecurringBills(TEST_USER_ID);

    const inserts = adminCalls.filter(
      (c) => c.table === "expenses" && c.op === "insert"
    );
    expect(inserts.length).toBe(1);
    expect(inserts[0].args.recurrence_interval).toBe("weekly");
    expect(inserts[0].args.category_id).toBe("cat-health");
  });

  it("ignores groups with only 1 transaction", async () => {
    adminResults.transactions.selectList = {
      data: [makeTx("ONE TIME PURCHASE", 100.0, "2025-12-01")],
      error: null,
    };

    await detectRecurringBills(TEST_USER_ID);

    const inserts = adminCalls.filter(
      (c) => c.table === "expenses" && c.op === "insert"
    );
    expect(inserts.length).toBe(0);
  });

  it("ignores groups with only 2 transactions (needs 3+)", async () => {
    adminResults.transactions.selectList = {
      data: [
        makeTx("HULU STREAMING", 7.99, "2025-11-01"),
        makeTx("HULU STREAMING", 7.99, "2025-12-01"),
      ],
      error: null,
    };

    await detectRecurringBills(TEST_USER_ID);

    const inserts = adminCalls.filter(
      (c) => c.table === "expenses" && c.op === "insert"
    );
    expect(inserts.length).toBe(0);
  });

  it("handles amount variation within tolerance", async () => {
    adminResults.transactions.selectList = {
      data: tolerantAmounts,
      error: null,
    };

    await detectRecurringBills(TEST_USER_ID);

    const inserts = adminCalls.filter(
      (c) => c.table === "expenses" && c.op === "insert"
    );
    expect(inserts.length).toBe(1);
    // Average of 49.99, 50.99, 50.49 ≈ 50.49
    expect(inserts[0].args.amount).toBeCloseTo(50.49, 1);
  });

  it("rejects groups with high amount variance", async () => {
    adminResults.transactions.selectList = {
      data: highVariance,
      error: null,
    };

    await detectRecurringBills(TEST_USER_ID);

    const inserts = adminCalls.filter(
      (c) => c.table === "expenses" && c.op === "insert"
    );
    expect(inserts.length).toBe(0);
  });

  it("updates existing auto-detected expense on re-run", async () => {
    adminResults.transactions.selectList = {
      data: monthlyNetflix,
      error: null,
    };
    adminResults.expenses.selectList = {
      data: [
        {
          id: "existing-exp-1",
          description: "NETFLIX COM",
          amount: 14.99,
          auto_detected: true,
          end_date: null,
          recurrence_interval: "monthly",
          last_seen_at: "2025-09-01",
        },
      ],
      error: null,
    };

    await detectRecurringBills(TEST_USER_ID);

    const updates = adminCalls.filter(
      (c) => c.table === "expenses" && c.op === "update"
    );
    expect(updates.length).toBeGreaterThanOrEqual(1);
    // Should update, not insert
    const inserts = adminCalls.filter(
      (c) => c.table === "expenses" && c.op === "insert"
    );
    expect(inserts.length).toBe(0);
  });

  it("expires stale auto-detected expenses", async () => {
    // No transactions match the existing expense
    adminResults.transactions.selectList = {
      data: weeklyGym,
      error: null,
    };

    // Existing auto-detected expense that hasn't been seen in a long time
    const staleExpense = {
      id: "stale-exp-1",
      description: "OLD SUBSCRIPTION",
      amount: 9.99,
      auto_detected: true,
      end_date: null,
      recurrence_interval: "monthly",
      last_seen_at: "2025-06-01", // ~8 months ago, well over 2x monthly (60 days)
    };

    // First call returns empty for upsert match, second returns the stale expense for expiry
    adminResults.expenses.selectList = {
      data: [staleExpense],
      error: null,
    };

    await detectRecurringBills(TEST_USER_ID);

    // Should have an update call to set end_date on the stale expense
    const updates = adminCalls.filter(
      (c) => c.table === "expenses" && c.op === "update"
    );
    const expiryUpdate = updates.find(
      (u) => u.args && u.args.end_date !== undefined && u.args.end_date !== null
    );
    expect(expiryUpdate).toBeDefined();
  });

  it("re-activates previously expired expense when pattern reappears", async () => {
    adminResults.transactions.selectList = {
      data: monthlyNetflix,
      error: null,
    };
    adminResults.expenses.selectList = {
      data: [
        {
          id: "expired-exp-1",
          description: "NETFLIX COM",
          amount: 15.99,
          auto_detected: true,
          end_date: "2025-09-01", // Was expired
          recurrence_interval: "monthly",
          last_seen_at: "2025-08-01",
        },
      ],
      error: null,
    };

    await detectRecurringBills(TEST_USER_ID);

    const updates = adminCalls.filter(
      (c) => c.table === "expenses" && c.op === "update"
    );
    // Should set end_date to null (re-activate)
    const reactivation = updates.find(
      (u) => u.args && u.args.end_date === null
    );
    expect(reactivation).toBeDefined();
  });

  it("maps ai_category to category_id correctly", async () => {
    adminResults.transactions.selectList = {
      data: weeklyGym,
      error: null,
    };

    await detectRecurringBills(TEST_USER_ID);

    const inserts = adminCalls.filter(
      (c) => c.table === "expenses" && c.op === "insert"
    );
    expect(inserts.length).toBe(1);
    expect(inserts[0].args.category_id).toBe("cat-health");
  });

  it("groups similar descriptions together", async () => {
    // Descriptions differ only in reference numbers
    adminResults.transactions.selectList = {
      data: [
        makeTx("NETFLIX COM 12345", 15.99, "2025-10-01"),
        makeTx("NETFLIX COM 67890", 15.99, "2025-11-01"),
        makeTx("NETFLIX COM 99999", 15.99, "2025-12-01"),
      ],
      error: null,
    };

    await detectRecurringBills(TEST_USER_ID);

    const inserts = adminCalls.filter(
      (c) => c.table === "expenses" && c.op === "insert"
    );
    // Should be grouped into one bill, not three
    expect(inserts.length).toBe(1);
  });

  it("never modifies manually-created expenses", async () => {
    adminResults.transactions.selectList = {
      data: monthlyNetflix,
      error: null,
    };
    adminResults.expenses.selectList = {
      data: [
        {
          id: "manual-exp-1",
          description: "Netflix",
          amount: 15.99,
          auto_detected: false, // Manually created
          end_date: null,
          recurrence_interval: "monthly",
          last_seen_at: null,
        },
      ],
      error: null,
    };

    await detectRecurringBills(TEST_USER_ID);

    // Since we only query auto_detected=true, manual expenses won't be in the result
    // The service should insert a new auto-detected expense rather than modifying the manual one
    const inserts = adminCalls.filter(
      (c) => c.table === "expenses" && c.op === "insert"
    );
    expect(inserts.length).toBe(1);
    expect(inserts[0].args.auto_detected).toBe(true);
  });

  it("does nothing when no transactions exist", async () => {
    adminResults.transactions.selectList = { data: [], error: null };

    await detectRecurringBills(TEST_USER_ID);

    const inserts = adminCalls.filter(
      (c) => c.table === "expenses" && c.op === "insert"
    );
    expect(inserts.length).toBe(0);
  });

  it("skips bills when category cannot be mapped", async () => {
    adminResults.transactions.selectList = {
      data: [
        makeTx("UNKNOWN VENDOR", 25.0, "2025-10-01", "Unknown Category"),
        makeTx("UNKNOWN VENDOR", 25.0, "2025-11-01", "Unknown Category"),
        makeTx("UNKNOWN VENDOR", 25.0, "2025-12-01", "Unknown Category"),
      ],
      error: null,
    };
    adminResults.categories.selectList = {
      data: [], // No categories
      error: null,
    };

    await detectRecurringBills(TEST_USER_ID);

    const inserts = adminCalls.filter(
      (c) => c.table === "expenses" && c.op === "insert"
    );
    expect(inserts.length).toBe(0);
  });

  it("rejects same store with varying amounts (grocery pattern)", async () => {
    adminResults.transactions.selectList = {
      data: groceryStore,
      error: null,
    };

    await detectRecurringBills(TEST_USER_ID);

    const inserts = adminCalls.filter(
      (c) => c.table === "expenses" && c.op === "insert"
    );
    expect(inserts.length).toBe(0);
  });

  it("rejects non-bill category even with consistent amounts", async () => {
    adminResults.transactions.selectList = {
      data: coffeeshop,
      error: null,
    };

    await detectRecurringBills(TEST_USER_ID);

    const inserts = adminCalls.filter(
      (c) => c.table === "expenses" && c.op === "insert"
    );
    expect(inserts.length).toBe(0);
  });

  it("accepts utility bills with moderate amount variation", async () => {
    adminResults.transactions.selectList = {
      data: electricBill,
      error: null,
    };

    await detectRecurringBills(TEST_USER_ID);

    const inserts = adminCalls.filter(
      (c) => c.table === "expenses" && c.op === "insert"
    );
    expect(inserts.length).toBe(1);
    expect(inserts[0].args.category_id).toBe("cat-util");
    expect(inserts[0].args.recurrence_interval).toBe("monthly");
  });
});
