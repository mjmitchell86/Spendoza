// The API returns savings_rate as a percentage (0-100), e.g. 21.06 means 21.06%.
// Stored report_data.savings_rate and the on-the-fly dashboard computation both
// use ((income - expenses) / income) * 100, so never multiply it by 100 here.

export type SavingsRateTier = "good" | "fair" | "poor";

/** e.g. 21.069 -> "21.1%" */
export function formatSavingsRate(ratePercent: number): string {
  return `${ratePercent.toFixed(1)}%`;
}

/** 20%+ is good (the 50/30/20 guideline), 5-20% fair, below 5% poor. */
export function getSavingsRateTier(ratePercent: number): SavingsRateTier {
  if (ratePercent >= 20) return "good";
  if (ratePercent >= 5) return "fair";
  return "poor";
}

/** Fill fraction (0-1) for the savings-rate arc. */
export function savingsRateArcFraction(ratePercent: number): number {
  return Math.max(0, Math.min(1, ratePercent / 100));
}
