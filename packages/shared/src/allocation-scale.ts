/**
 * Needs, wants, savings and unclassified are shares of income, so together they can pass 100% in a
 * month where spending beat income. The bar then shrinks every segment — and the 50% / 80% guide
 * marks — to fit, and says so.
 */
export function allocationScale(percentages: number[]): {
  widths: number[];
  marks: [number, number];
  overIncome: boolean;
} {
  const total = percentages.reduce((sum, p) => sum + Math.max(0, p), 0);
  const scale = Math.max(100, total);
  const fit = (p: number) => Math.round((Math.max(0, p) / scale) * 1000) / 10;
  return {
    widths: percentages.map(fit),
    marks: [fit(50), fit(80)],
    overIncome: total > 100,
  };
}
