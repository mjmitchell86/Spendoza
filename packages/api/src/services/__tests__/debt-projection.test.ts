import { describe, it, expect } from "bun:test";
import {
  projectSingleDebt,
  calculatePayoffStrategy,
} from "../debt-projection.service";
import type { Debt } from "@spendoza/shared";

function makeFakeDebt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: "debt-1",
    user_id: "user-1",
    entity_type: "user",
    entity_id: "user-1",
    name: "Test Card",
    debt_type: "credit_card",
    original_balance: 5000,
    current_balance: 5000,
    interest_rate: 18,
    minimum_payment: 150,
    due_date_day: 15,
    linked_category_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("projectSingleDebt", () => {
  it("calculates payoff for a credit card", () => {
    const debt = makeFakeDebt();
    const projection = projectSingleDebt(debt);
    expect(projection.debt_id).toBe("debt-1");
    expect(projection.months_to_payoff).toBeGreaterThan(0);
    expect(projection.months_to_payoff).toBeLessThan(100);
    expect(projection.total_interest).toBeGreaterThan(0);
    expect(projection.payoff_date).not.toBe("Never");
  });

  it("returns 0 months for zero balance", () => {
    const debt = makeFakeDebt({ current_balance: 0 });
    const projection = projectSingleDebt(debt);
    expect(projection.months_to_payoff).toBe(0);
    expect(projection.total_interest).toBe(0);
  });

  it("returns 0 interest for 0% rate", () => {
    const debt = makeFakeDebt({ interest_rate: 0 });
    const projection = projectSingleDebt(debt);
    expect(projection.total_interest).toBe(0);
    expect(projection.months_to_payoff).toBe(Math.ceil(5000 / 150));
  });

  it("returns Infinity if payment doesn't cover interest", () => {
    const debt = makeFakeDebt({
      current_balance: 100000,
      interest_rate: 30,
      minimum_payment: 10,
    });
    const projection = projectSingleDebt(debt);
    expect(projection.months_to_payoff).toBe(Infinity);
    expect(projection.payoff_date).toBe("Never");
  });
});

describe("calculatePayoffStrategy", () => {
  it("avalanche targets highest interest first", () => {
    const debts = [
      makeFakeDebt({
        id: "low",
        name: "Low Rate",
        interest_rate: 5,
        current_balance: 3000,
        minimum_payment: 100,
      }),
      makeFakeDebt({
        id: "high",
        name: "High Rate",
        interest_rate: 22,
        current_balance: 3000,
        minimum_payment: 100,
      }),
    ];
    const strategy = calculatePayoffStrategy(debts, 200, "avalanche");
    expect(strategy.strategy).toBe("avalanche");
    const highDebt = strategy.debts.find((d) => d.debt_id === "high");
    const lowDebt = strategy.debts.find((d) => d.debt_id === "low");
    expect(highDebt!.months_to_payoff).toBeLessThan(lowDebt!.months_to_payoff);
  });

  it("snowball targets smallest balance first", () => {
    const debts = [
      makeFakeDebt({
        id: "big",
        name: "Big Balance",
        interest_rate: 18,
        current_balance: 10000,
        minimum_payment: 200,
      }),
      makeFakeDebt({
        id: "small",
        name: "Small Balance",
        interest_rate: 18,
        current_balance: 1000,
        minimum_payment: 50,
      }),
    ];
    const strategy = calculatePayoffStrategy(debts, 100, "snowball");
    expect(strategy.strategy).toBe("snowball");
    const smallDebt = strategy.debts.find((d) => d.debt_id === "small");
    const bigDebt = strategy.debts.find((d) => d.debt_id === "big");
    expect(smallDebt!.months_to_payoff).toBeLessThan(bigDebt!.months_to_payoff);
  });

  it("returns empty result for no debts", () => {
    const strategy = calculatePayoffStrategy([], 500, "avalanche");
    expect(strategy.debts).toHaveLength(0);
    expect(strategy.total_months).toBe(0);
    expect(strategy.total_interest).toBe(0);
  });

  it("avalanche saves more on interest than snowball", () => {
    const debts = [
      makeFakeDebt({
        id: "a",
        interest_rate: 24,
        current_balance: 5000,
        minimum_payment: 100,
      }),
      makeFakeDebt({
        id: "b",
        interest_rate: 6,
        current_balance: 2000,
        minimum_payment: 50,
      }),
    ];
    const avalanche = calculatePayoffStrategy(debts, 150, "avalanche");
    const snowball = calculatePayoffStrategy(debts, 150, "snowball");
    expect(avalanche.total_interest).toBeLessThanOrEqual(
      snowball.total_interest
    );
  });
});
