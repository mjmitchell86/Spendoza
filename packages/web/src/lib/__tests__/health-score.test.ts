import { describe, it, expect } from "bun:test";
import {
  FACTOR_LABELS,
  isEmptyReport,
  scoreBand,
  scoreBandStyle,
} from "../health-score";

// The iPhone app's bands and part names (spec 2026-10-29-ios-app-design.md); the web shows the same.

describe("scoreBand", () => {
  it("is Low from 0 to 39", () => {
    expect(scoreBand(0)).toBe("Low");
    expect(scoreBand(39)).toBe("Low");
  });

  it("is Fair from 40 to 69", () => {
    expect(scoreBand(40)).toBe("Fair");
    expect(scoreBand(55)).toBe("Fair");
    expect(scoreBand(69)).toBe("Fair");
  });

  it("is Good from 70 to 100", () => {
    expect(scoreBand(70)).toBe("Good");
    expect(scoreBand(100)).toBe("Good");
  });

  it("rounds a fractional score the way the app does", () => {
    expect(scoreBand(39.6)).toBe("Fair");
    expect(scoreBand(69.4)).toBe("Fair");
  });
});

describe("scoreBandStyle", () => {
  it("draws Low in red, Fair in amber and Good in green", () => {
    expect(scoreBandStyle(20).text).toContain("rose");
    expect(scoreBandStyle(50).text).toContain("amber");
    expect(scoreBandStyle(80).text).toContain("emerald");
  });

  it("gives each band a distinct ring colour", () => {
    const strokes = new Set([scoreBandStyle(20).stroke, scoreBandStyle(50).stroke, scoreBandStyle(80).stroke]);
    expect(strokes.size).toBe(3);
  });
});

describe("FACTOR_LABELS", () => {
  it("uses the app's part names", () => {
    expect(FACTOR_LABELS).toEqual({
      savings_rate: "Savings rate",
      needs_ratio: "Needs",
      wants_ratio: "Wants",
      emergency_fund: "Emergency fund",
      debt_to_income: "Debt vs. income",
    });
  });
});

describe("isEmptyReport", () => {
  it("treats no income, no spending and no categories as no report", () => {
    expect(isEmptyReport({ total_income: 0, total_expenses: 0, by_category: [] })).toBe(true);
  });

  it("treats a missing category list like an empty one", () => {
    expect(isEmptyReport({ total_income: 0, total_expenses: 0 })).toBe(true);
  });

  it("keeps a month with any income, spending or category rows", () => {
    expect(isEmptyReport({ total_income: 10, total_expenses: 0, by_category: [] })).toBe(false);
    expect(isEmptyReport({ total_income: 0, total_expenses: 5, by_category: [] })).toBe(false);
    expect(
      isEmptyReport({
        total_income: 0,
        total_expenses: 0,
        by_category: [{ category: "Groceries", amount: 0, percentage: 0 }],
      })
    ).toBe(false);
  });
});
