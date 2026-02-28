import { describe, it, expect } from "bun:test";
import { calculateHealthScore } from "../health-score.service";
import type {
  AllocationBreakdown,
  DebtSummary,
} from "../../ai/report-insights";

const goodAllocation: AllocationBreakdown = {
  needs: { amount: 2500, percentage: 45 },
  wants: { amount: 1400, percentage: 25 },
  savings: { amount: 1600, percentage: 30 },
  unclassified: { amount: 0, percentage: 0 },
  benchmark: { needs: 50, wants: 30, savings: 20 },
};

const noDebt: DebtSummary = {
  total_balance: 0,
  total_minimum_payments: 0,
  monthly_interest_cost: 0,
  highest_rate_debt: null,
  debt_to_income_ratio: 0,
  estimated_payoff_months: 0,
};

describe("calculateHealthScore", () => {
  it("returns perfect score for ideal finances", () => {
    const result = calculateHealthScore(25, goodAllocation, noDebt, 6, null);
    expect(result.score).toBe(100);
    expect(result.factors.savings_rate.rating).toBe("good");
    expect(result.factors.needs_ratio.rating).toBe("good");
    expect(result.factors.wants_ratio.rating).toBe("good");
    expect(result.factors.emergency_fund.rating).toBe("good");
    expect(result.factors.debt_to_income.rating).toBe("good");
  });

  it("scores low for poor financial health", () => {
    const poorAllocation: AllocationBreakdown = {
      needs: { amount: 4000, percentage: 72 },
      wants: { amount: 1500, percentage: 27 },
      savings: { amount: 100, percentage: 1.8 },
      unclassified: { amount: 0, percentage: 0 },
      benchmark: { needs: 50, wants: 30, savings: 20 },
    };
    const highDebt: DebtSummary = {
      total_balance: 50000,
      total_minimum_payments: 2000,
      monthly_interest_cost: 500,
      highest_rate_debt: { name: "Card", rate: 24, balance: 20000 },
      debt_to_income_ratio: 0.55,
      estimated_payoff_months: 120,
    };
    const result = calculateHealthScore(2, poorAllocation, highDebt, 0, null);
    expect(result.score).toBeLessThan(20);
    expect(result.factors.emergency_fund.rating).toBe("critical");
    expect(result.factors.debt_to_income.rating).toBe("critical");
  });

  it("includes previous_score when provided", () => {
    const result = calculateHealthScore(20, goodAllocation, noDebt, 6, 85);
    expect(result.previous_score).toBe(85);
  });

  it("handles missing allocation and debt gracefully", () => {
    const result = calculateHealthScore(15, undefined, undefined, 0, null);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
