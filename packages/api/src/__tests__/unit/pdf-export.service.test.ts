import { describe, it, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// Shared report data fixture
// ---------------------------------------------------------------------------
const REPORT_DATA = {
  total_income: 5000,
  total_expenses: 2000,
  savings_rate: 60,
  expense_to_income_ratio: 0.4,
  by_category: [],
  top_categories: [],
  month_over_month: null,
};

const CACHED_REPORT = {
  id: "r1",
  entity_type: "user",
  entity_id: "u1",
  report_month: "2026-01-01",
  has_new_data: false,
  report_data: REPORT_DATA,
  ai_insights: "Cached insights",
};

const FRESH_REPORT = {
  ...CACHED_REPORT,
  ai_insights: "Fresh insights",
};

// ---------------------------------------------------------------------------
// Supabase mock — chainable query builder
// ---------------------------------------------------------------------------

// maybeSingle result we can control per-test
let maybeSingleResult: { data: any } = { data: null };

function chainable(): any {
  const obj: any = {};
  const methods = [
    "select",
    "eq",
    "in",
    "or",
    "gte",
    "lte",
    "single",
  ];
  for (const m of methods) {
    obj[m] = mock(() => obj);
  }
  obj.maybeSingle = mock(() => maybeSingleResult);
  // single() for profiles / households — return a neutral object
  obj.single = mock(() => ({
    data: { display_name: "Test User", name: "Test Household", id: "u1" },
  }));
  return obj;
}

const mockFromFn = mock(() => chainable());

mock.module("../../lib/supabase", () => ({
  supabaseAdmin: { from: mockFromFn },
}));

// ---------------------------------------------------------------------------
// Report-service mocks (we spy on these)
// ---------------------------------------------------------------------------
const mockGenerateUserReport = mock(() => Promise.resolve(FRESH_REPORT));
const mockGenerateHouseholdReport = mock(() =>
  Promise.resolve({ ...FRESH_REPORT, entity_type: "household", entity_id: "h1" })
);

mock.module("../../services/report.service", () => ({
  generateUserReport: mockGenerateUserReport,
  generateHouseholdReport: mockGenerateHouseholdReport,
}));

// ---------------------------------------------------------------------------
// PDF builder mock
// ---------------------------------------------------------------------------
const mockBuildPdf = mock(() => Promise.resolve(Buffer.from("fake-pdf")));
mock.module("../../services/pdf-report.service", () => ({
  buildReportPdf: mockBuildPdf,
}));

// ---------------------------------------------------------------------------
// Import the module under test (must be after mock.module calls)
// ---------------------------------------------------------------------------
const {
  generatePersonalPdfForUser,
  generateHouseholdPdfForHousehold,
} = await import("../../services/pdf-export.service");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("pdf-export.service", () => {
  beforeEach(() => {
    mockGenerateUserReport.mockClear();
    mockGenerateHouseholdReport.mockClear();
    mockBuildPdf.mockClear();
    mockFromFn.mockClear();
  });

  it("exports generatePersonalPdfForUser function", () => {
    expect(typeof generatePersonalPdfForUser).toBe("function");
  });

  it("exports generateHouseholdPdfForHousehold function", () => {
    expect(typeof generateHouseholdPdfForHousehold).toBe("function");
  });

  // -------------------------------------------------------------------------
  // forceRegenerate — personal
  // -------------------------------------------------------------------------
  describe("generatePersonalPdfForUser with forceRegenerate", () => {
    it("regenerates even when has_new_data is false", async () => {
      // Simulate a cached report with has_new_data = false
      maybeSingleResult = { data: { ...CACHED_REPORT, has_new_data: false } };

      await generatePersonalPdfForUser("u1", "2026-01-01", {
        forceRegenerate: true,
      });

      expect(mockGenerateUserReport).toHaveBeenCalledTimes(1);
    });

    it("does NOT regenerate when has_new_data is false and forceRegenerate is not set", async () => {
      maybeSingleResult = { data: { ...CACHED_REPORT, has_new_data: false } };

      await generatePersonalPdfForUser("u1", "2026-01-01");

      expect(mockGenerateUserReport).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // forceRegenerate — household
  // -------------------------------------------------------------------------
  describe("generateHouseholdPdfForHousehold with forceRegenerate", () => {
    it("regenerates even when has_new_data is false", async () => {
      maybeSingleResult = {
        data: {
          ...CACHED_REPORT,
          entity_type: "household",
          entity_id: "h1",
          has_new_data: false,
        },
      };

      await generateHouseholdPdfForHousehold("h1", "2026-01-01", {
        forceRegenerate: true,
      });

      expect(mockGenerateHouseholdReport).toHaveBeenCalledTimes(1);
    });

    it("does NOT regenerate when has_new_data is false and forceRegenerate is not set", async () => {
      maybeSingleResult = {
        data: {
          ...CACHED_REPORT,
          entity_type: "household",
          entity_id: "h1",
          has_new_data: false,
        },
      };

      await generateHouseholdPdfForHousehold("h1", "2026-01-01");

      expect(mockGenerateHouseholdReport).not.toHaveBeenCalled();
    });
  });
});
