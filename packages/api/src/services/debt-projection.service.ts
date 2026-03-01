import type { Debt, DebtProjection, DebtPayoffStrategy } from "@spendoza/shared";

/**
 * Calculate months to payoff a single debt at a given monthly payment.
 */
function calculatePayoff(
  balance: number,
  annualRate: number,
  monthlyPayment: number
): { months: number; totalInterest: number } {
  if (balance <= 0) return { months: 0, totalInterest: 0 };
  if (monthlyPayment <= 0) return { months: Infinity, totalInterest: Infinity };

  const monthlyRate = annualRate / 100 / 12;
  let remaining = balance;
  let totalInterest = 0;
  let months = 0;
  const maxMonths = 360; // 30 year cap

  if (monthlyRate === 0) {
    return {
      months: Math.ceil(balance / monthlyPayment),
      totalInterest: 0,
    };
  }

  while (remaining > 0 && months < maxMonths) {
    const interest = remaining * monthlyRate;
    totalInterest += interest;
    const principal = Math.min(monthlyPayment - interest, remaining);
    if (principal <= 0) {
      return { months: Infinity, totalInterest: Infinity };
    }
    remaining -= principal;
    months++;
  }

  return {
    months,
    totalInterest: Math.round(totalInterest * 100) / 100,
  };
}

function addMonths(date: Date, months: number): string {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split("T")[0];
}

export function projectSingleDebt(debt: Debt): DebtProjection {
  const { months, totalInterest } = calculatePayoff(
    debt.current_balance,
    debt.interest_rate,
    debt.minimum_payment
  );

  return {
    debt_id: debt.id,
    debt_name: debt.name,
    current_balance: debt.current_balance,
    interest_rate: debt.interest_rate,
    minimum_payment: debt.minimum_payment,
    months_to_payoff: months,
    total_interest: totalInterest,
    payoff_date: months === Infinity ? "Never" : addMonths(new Date(), months),
  };
}

/**
 * Calculate payoff strategy for multiple debts.
 * - avalanche: pay minimums on all, extra toward highest interest rate
 * - snowball: pay minimums on all, extra toward smallest balance
 */
export function calculatePayoffStrategy(
  debts: Debt[],
  extraMonthlyPayment: number,
  strategy: "avalanche" | "snowball"
): DebtPayoffStrategy {
  if (debts.length === 0) {
    return { strategy, debts: [], total_months: 0, total_interest: 0 };
  }

  // Sort by strategy
  const sorted = [...debts].sort((a, b) => {
    if (strategy === "avalanche") return b.interest_rate - a.interest_rate;
    return a.current_balance - b.current_balance;
  });

  // Simulate month-by-month payoff
  const balances = sorted.map((d) => d.current_balance);
  const rates = sorted.map((d) => d.interest_rate / 100 / 12);
  const minimums = sorted.map((d) => d.minimum_payment);
  const interests = sorted.map(() => 0);
  const payoffMonths = sorted.map(() => 0);
  let months = 0;
  const maxMonths = 360;

  while (balances.some((b) => b > 0) && months < maxMonths) {
    months++;
    let extraLeft = extraMonthlyPayment;

    for (let i = 0; i < sorted.length; i++) {
      if (balances[i] <= 0) continue;

      const interest = balances[i] * rates[i];
      interests[i] += interest;
      let payment = minimums[i];

      // Apply extra to first debt with balance (priority order)
      if (extraLeft > 0) {
        const firstWithBalance = balances.findIndex((b) => b > 0);
        if (i === firstWithBalance) {
          payment += extraLeft;
          extraLeft = 0;
        }
      }

      const principal = Math.min(payment - interest, balances[i]);
      if (principal > 0) {
        balances[i] -= principal;
      }

      if (balances[i] <= 0.01) {
        balances[i] = 0;
        if (payoffMonths[i] === 0) payoffMonths[i] = months;
      }
    }
  }

  const projections: DebtProjection[] = sorted.map((d, i) => ({
    debt_id: d.id,
    debt_name: d.name,
    current_balance: d.current_balance,
    interest_rate: d.interest_rate,
    minimum_payment: d.minimum_payment,
    months_to_payoff: payoffMonths[i] || months,
    total_interest: Math.round(interests[i] * 100) / 100,
    payoff_date:
      payoffMonths[i] === 0
        ? "Never"
        : addMonths(new Date(), payoffMonths[i]),
  }));

  return {
    strategy,
    debts: projections,
    total_months: Math.max(...payoffMonths),
    total_interest: Math.round(
      interests.reduce((sum, i) => sum + i, 0) * 100
    ) / 100,
  };
}
