import { describe, it, expect } from "bun:test";
import {
  formatSavingsRate,
  getSavingsRateTier,
  savingsRateArcFraction,
} from "../savings-rate";

// The API returns summary.savings_rate as a percentage (0-100): stored
// report_data.savings_rate and the on-the-fly dashboard computation both use
// ((income - expenses) / income) * 100.

describe("formatSavingsRate", () => {
  it("formats a percentage value without multiplying by 100 again", () => {
    // Regression: income $4,539, expenses $3,583 showed "2106.9%"
    const rate = ((4539 - 3583) / 4539) * 100; // 21.069...
    expect(formatSavingsRate(rate)).toBe("21.1%");
  });

  it("formats zero and negative rates", () => {
    expect(formatSavingsRate(0)).toBe("0.0%");
    expect(formatSavingsRate(-12.345)).toBe("-12.3%");
  });

  it("formats stored report values (2-decimal percentages)", () => {
    expect(formatSavingsRate(72.31)).toBe("72.3%");
  });
});

describe("getSavingsRateTier", () => {
  it("is good at 20% and above", () => {
    expect(getSavingsRateTier(20)).toBe("good");
    expect(getSavingsRateTier(21.06)).toBe("good");
  });

  it("is fair between 5% and 20%", () => {
    expect(getSavingsRateTier(5)).toBe("fair");
    expect(getSavingsRateTier(19.99)).toBe("fair");
  });

  it("is poor below 5% (including negative)", () => {
    expect(getSavingsRateTier(4.9)).toBe("poor");
    expect(getSavingsRateTier(0.5)).toBe("poor");
    expect(getSavingsRateTier(-10)).toBe("poor");
  });
});

describe("savingsRateArcFraction", () => {
  it("maps a percentage to a 0-1 arc fill", () => {
    expect(savingsRateArcFraction(21.06)).toBeCloseTo(0.2106, 4);
    expect(savingsRateArcFraction(50)).toBe(0.5);
  });

  it("clamps out-of-range values", () => {
    expect(savingsRateArcFraction(-30)).toBe(0);
    expect(savingsRateArcFraction(150)).toBe(1);
  });
});
