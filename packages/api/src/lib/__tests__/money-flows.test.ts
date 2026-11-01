import { describe, expect, it } from "bun:test";
import { allocationFor, classMapFrom, summarizeFlows } from "../money-flows";

const classOf = classMapFrom([
  { name: "Housing", budget_class: "need" },
  { name: "Dining Out", budget_class: "want" },
  { name: "Savings", budget_class: "savings" },
  { name: "Debt Payments", budget_class: "savings" },
  { name: "Transfers", budget_class: "transfer" },
  { name: "Other", budget_class: "other" },
]);

const credit = (amount: number | string, ai_category: string | null = "Other") => ({ type: "credit", amount, ai_category });
const debit = (amount: number | string, ai_category: string | null) => ({ type: "debit", amount, ai_category });

describe("summarizeFlows", () => {
  it("counts credits as income and debits as spending", () => {
    const f = summarizeFlows([credit(5000), debit(2000, "Housing"), debit(1000, "Dining Out")], classOf);
    expect(f.income).toBe(5000);
    expect(f.spending).toBe(3000);
    expect(f.saved).toBe(0);
    expect(f.savingsRate).toBe(40);
  });

  it("counts money moved to a savings category as saved, not spent", () => {
    const f = summarizeFlows([credit(5000), debit(4000, "Housing"), debit(1000, "Savings")], classOf);
    expect(f.spending).toBe(4000);
    expect(f.saved).toBe(1000);
    expect(f.savingsRate).toBe(20);
  });

  it("leaves transfers out of income, spending and the category list", () => {
    const f = summarizeFlows(
      [credit(5000), credit(800, "Transfers"), debit(2000, "Housing"), debit(1500, "Transfers")],
      classOf
    );
    expect(f.income).toBe(5000);
    expect(f.spending).toBe(2000);
    expect(f.byCategory.map((c) => c.category)).toEqual(["Housing"]);
  });

  it("treats money taken back out of savings as less saved, not as income", () => {
    const f = summarizeFlows(
      [credit(4000), debit(4000, "Housing"), debit(1000, "Savings"), credit(1000, "Savings")],
      classOf
    );
    expect(f.income).toBe(4000);
    expect(f.spending).toBe(4000);
    expect(f.saved).toBe(0);
    expect(f.savingsRate).toBe(0);
    expect(f.byCategory.map((c) => c.category)).toEqual(["Housing"]);
  });

  it("never reports a negative amount saved when more came out of savings than went in", () => {
    const f = summarizeFlows([credit(3000), debit(500, "Savings"), credit(800, "Savings")], classOf);
    expect(f.saved).toBe(0);
    expect(f.income).toBe(3000);
  });

  it("goes negative when spending beats income", () => {
    const f = summarizeFlows([credit(2000), debit(3000, "Housing")], classOf);
    expect(f.savingsRate).toBe(-50);
  });

  it("is 0 with no income", () => {
    expect(summarizeFlows([debit(300, "Housing")], classOf).savingsRate).toBe(0);
  });

  it("treats unknown and missing categories as spending", () => {
    const f = summarizeFlows([credit(1000), debit(100, "Mystery"), debit(50, null)], classOf);
    expect(f.spending).toBe(150);
    expect(f.byCategory.map((c) => c.category).sort()).toEqual(["Mystery", "Uncategorized"]);
  });

  it("matches categories case-insensitively and reads string amounts", () => {
    const f = summarizeFlows([credit("1000"), debit("250.50", "savings"), debit("100", "TRANSFERS")], classOf);
    expect(f.income).toBe(1000);
    expect(f.saved).toBe(250.5);
    expect(f.spending).toBe(0);
  });

  it("gives category percentages as a share of everything that left (spent plus saved), largest first", () => {
    const f = summarizeFlows([credit(5000), debit(3000, "Housing"), debit(1000, "Savings")], classOf);
    expect(f.byCategory).toEqual([
      { category: "Housing", amount: 3000, percentage: 75 },
      { category: "Savings", amount: 1000, percentage: 25 },
    ]);
  });
});

describe("allocationFor", () => {
  it("measures needs, wants and savings as a share of income", () => {
    const byCategory = [
      { category: "Housing", amount: 2500, percentage: 0 },
      { category: "Dining Out", amount: 1000, percentage: 0 },
      { category: "Savings", amount: 500, percentage: 0 },
      { category: "Mystery", amount: 250, percentage: 0 },
    ];
    const a = allocationFor(byCategory, classOf, 5000);
    expect(a.needs).toEqual({ amount: 2500, percentage: 50 });
    expect(a.wants).toEqual({ amount: 1000, percentage: 20 });
    expect(a.savings).toEqual({ amount: 500, percentage: 10 });
    expect(a.unclassified).toEqual({ amount: 250, percentage: 5 });
    expect(a.benchmark).toEqual({ needs: 50, wants: 30, savings: 20 });
  });

  it("reports spending with no income as 100% of income, so it can't score full points", () => {
    const a = allocationFor([{ category: "Dining Out", amount: 40, percentage: 0 }], classOf, 0);
    expect(a.wants.percentage).toBe(100);
    expect(a.needs.percentage).toBe(0);
  });
});
