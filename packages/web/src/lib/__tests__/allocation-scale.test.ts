import { describe, expect, it } from "bun:test";
import { allocationScale } from "@spendoza/shared";

describe("allocationScale", () => {
  it("draws shares of income as-is when they fit in 100%", () => {
    const s = allocationScale([50, 20, 10, 0]);
    expect(s.widths).toEqual([50, 20, 10, 0]);
    expect(s.marks).toEqual([50, 80]);
    expect(s.overIncome).toBe(false);
  });

  it("shrinks everything to fit when the shares add up to more than income", () => {
    const s = allocationScale([100, 60, 0, 40]);
    expect(s.widths).toEqual([50, 30, 0, 20]);
    expect(s.marks).toEqual([25, 40]);
    expect(s.overIncome).toBe(true);
  });
});
