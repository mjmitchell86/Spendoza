import type {
  AllocationBreakdown,
  DebtSummary,
  FinancialHealthScore,
  HealthScoreFactor,
} from "../ai/report-insights";

function rating(
  points: number,
  max: number
): "good" | "ok" | "warning" | "critical" {
  const ratio = points / max;
  if (ratio >= 0.8) return "good";
  if (ratio >= 0.5) return "ok";
  if (ratio >= 0.25) return "warning";
  return "critical";
}

function scoreSavingsRate(savingsRate: number): HealthScoreFactor {
  const max = 25;
  const points = savingsRate >= 20 ? max : Math.round((savingsRate / 20) * max);
  return {
    value: savingsRate,
    points: Math.min(points, max),
    max,
    rating: rating(points, max),
  };
}

function scoreNeedsRatio(needsPercentage: number): HealthScoreFactor {
  const max = 20;
  let points = max;
  if (needsPercentage > 50) {
    points = Math.max(0, max - Math.round((needsPercentage - 50) * 2));
  }
  return {
    value: needsPercentage,
    points: Math.min(points, max),
    max,
    rating: rating(points, max),
  };
}

function scoreWantsRatio(wantsPercentage: number): HealthScoreFactor {
  const max = 15;
  let points = max;
  if (wantsPercentage > 30) {
    points = Math.max(0, max - Math.round((wantsPercentage - 30) * 1.5));
  }
  return {
    value: wantsPercentage,
    points: Math.min(points, max),
    max,
    rating: rating(points, max),
  };
}

function scoreEmergencyFund(monthsCovered: number): HealthScoreFactor {
  const max = 20;
  let points = 0;
  if (monthsCovered >= 6) points = 20;
  else if (monthsCovered >= 3) points = 15;
  else if (monthsCovered >= 1) points = 10;
  return { value: monthsCovered, points, max, rating: rating(points, max) };
}

function scoreDebtToIncome(ratio: number): HealthScoreFactor {
  const max = 20;
  let points = 0;
  if (ratio <= 0.1) points = 20;
  else if (ratio <= 0.2) points = 15;
  else if (ratio <= 0.36) points = 10;
  else if (ratio <= 0.5) points = 5;
  return { value: ratio, points, max, rating: rating(points, max) };
}

export function calculateHealthScore(
  savingsRate: number,
  allocation: AllocationBreakdown | undefined,
  debtSummary: DebtSummary | undefined,
  emergencyFundMonths: number,
  previousScore: number | null
): FinancialHealthScore {
  const savingsRateFactor = scoreSavingsRate(savingsRate);
  const needsFactor = scoreNeedsRatio(allocation?.needs.percentage ?? 0);
  const wantsFactor = scoreWantsRatio(allocation?.wants.percentage ?? 0);
  const emergencyFactor = scoreEmergencyFund(emergencyFundMonths);
  const debtFactor = scoreDebtToIncome(debtSummary?.debt_to_income_ratio ?? 0);

  const score =
    savingsRateFactor.points +
    needsFactor.points +
    wantsFactor.points +
    emergencyFactor.points +
    debtFactor.points;

  return {
    score,
    previous_score: previousScore,
    factors: {
      savings_rate: savingsRateFactor,
      needs_ratio: needsFactor,
      wants_ratio: wantsFactor,
      emergency_fund: emergencyFactor,
      debt_to_income: debtFactor,
    },
  };
}
