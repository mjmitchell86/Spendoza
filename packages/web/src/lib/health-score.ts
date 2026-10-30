/**
 * Health score bands and part names, shared with the iPhone app:
 * Low 0–39 (red), Fair 40–69 (amber), Good 70–100 (green).
 */
export type ScoreBand = "Low" | "Fair" | "Good";

export function scoreBand(score: number): ScoreBand {
  const rounded = Math.round(score);
  if (rounded < 40) return "Low";
  if (rounded < 70) return "Fair";
  return "Good";
}

export interface ScoreBandStyle {
  /** Tailwind text colour for the score and band name. */
  text: string;
  /** Ring stroke colour. */
  stroke: string;
}

const BAND_STYLES: Record<ScoreBand, ScoreBandStyle> = {
  Low: { text: "text-rose-500", stroke: "#f43f5e" },
  Fair: { text: "text-amber-500", stroke: "#f59e0b" },
  Good: { text: "text-emerald-500", stroke: "#10b981" },
};

export function scoreBandStyle(score: number): ScoreBandStyle {
  return BAND_STYLES[scoreBand(score)];
}

export const FACTOR_LABELS: Record<string, string> = {
  savings_rate: "Savings rate",
  needs_ratio: "Needs",
  wants_ratio: "Wants",
  emergency_fund: "Emergency fund",
  debt_to_income: "Debt vs. income",
};

export interface ReportTotals {
  total_income: number;
  total_expenses: number;
  by_category?: unknown[] | null;
}

/**
 * A month with no income, no spending and no category rows has nothing to score: treat it as no report
 * (its score would only reflect the empty data, not the person's money).
 */
export function isEmptyReport(report: ReportTotals): boolean {
  return (
    report.total_income === 0 &&
    report.total_expenses === 0 &&
    (report.by_category?.length ?? 0) === 0
  );
}
