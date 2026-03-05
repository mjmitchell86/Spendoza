import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { logLlmUsage } from "./llm-usage-logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface AllocationBreakdown {
  needs: { amount: number; percentage: number };
  wants: { amount: number; percentage: number };
  savings: { amount: number; percentage: number };
  unclassified: { amount: number; percentage: number };
  benchmark: { needs: number; wants: number; savings: number };
}

export interface DebtSummary {
  total_balance: number;
  total_minimum_payments: number;
  monthly_interest_cost: number;
  highest_rate_debt: { name: string; rate: number; balance: number } | null;
  debt_to_income_ratio: number;
  estimated_payoff_months: number;
}

export interface HealthScoreFactor {
  value: number;
  points: number;
  max: number;
  rating: "good" | "ok" | "warning" | "critical";
}

export interface FinancialHealthScore {
  score: number;
  previous_score: number | null;
  factors: {
    savings_rate: HealthScoreFactor;
    needs_ratio: HealthScoreFactor;
    wants_ratio: HealthScoreFactor;
    emergency_fund: HealthScoreFactor;
    debt_to_income: HealthScoreFactor;
  };
}

export interface ReportData {
  total_income: number;
  total_expenses: number;
  savings_rate: number;
  expense_to_income_ratio: number;
  by_category: Array<{ category: string; amount: number; percentage: number }>;
  top_categories: string[];
  month_over_month: { income_change: number; expense_change: number } | null;
  allocation?: AllocationBreakdown;
  debt_summary?: DebtSummary;
  financial_health_score?: FinancialHealthScore;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are a personal finance advisor. Given a monthly financial summary, provide 3-5 concise bullet-point insights about the user's financial health.

Include observations about:
- Spending trends and notable category changes
- Savings rate assessment
- Actionable recommendations to improve finances
- Any category that seems unusually high or low

Keep each bullet point to 1-2 sentences. Be specific with numbers when relevant.
Respond ONLY with the bullet points, no introduction or conclusion.

If spending allocation data is provided, comment on how the user's needs/wants/savings split compares to the 50/30/20 guideline. Highlight any category that significantly exceeds its benchmark.

If debt information is provided, comment on the debt-to-income ratio and suggest prioritizing high-interest debt payoff if applicable.

If a financial health score is provided, acknowledge the score and highlight the weakest factor as a priority area for improvement. Frame suggestions positively and encouragingly.`;

const ANNUAL_SYSTEM_PROMPT = `You are a personal finance advisor delivering a Year-in-Review report on New Year's Day. Given an annual financial summary covering 12 months, provide 5-7 concise bullet-point insights celebrating the past year and looking forward.

Include observations about:
- Major financial achievements and growth over the year
- Year-over-year spending and savings trends
- Notable category patterns that emerged across the full year
- Goal achievements — celebrate completed goals and encourage continued progress on in-progress ones
- Forward-looking recommendations for the new year
- An inspirational closing thought to start the year strong

Keep each bullet point to 1-2 sentences. Be specific with numbers when relevant.
Respond ONLY with the bullet points, no introduction or conclusion.

Maintain a warm, celebratory New Year's tone — acknowledge progress, highlight wins, and inspire continued financial growth.

If spending allocation data is provided, comment on how the user's needs/wants/savings split compares to the 50/30/20 guideline. Highlight any category that significantly exceeds its benchmark.

If debt information is provided, comment on the debt-to-income ratio and suggest prioritizing high-interest debt payoff if applicable.

If a financial health score is provided, acknowledge the score and highlight the weakest factor as a priority area for improvement. Frame suggestions positively and encouragingly.`;

const QUARTERLY_SYSTEM_PROMPT = `You are a personal finance advisor. Given a quarterly financial summary covering 3 months, provide 4-6 concise bullet-point insights analyzing the full quarter.

Include observations about:
- Spending trends across the quarter (categories with increasing or decreasing spend)
- Savings trajectory over the 3-month period
- Notable category changes or patterns that emerge over the quarter
- Quarterly recommendations to improve finances in the next quarter
- Any category that seems unusually high or low relative to income

Keep each bullet point to 1-2 sentences. Be specific with numbers when relevant.
Respond ONLY with the bullet points, no introduction or conclusion.

If spending allocation data is provided, comment on how the user's needs/wants/savings split compares to the 50/30/20 guideline. Highlight any category that significantly exceeds its benchmark.

If debt information is provided, comment on the debt-to-income ratio and suggest prioritizing high-interest debt payoff if applicable.

If a financial health score is provided, acknowledge the score and highlight the weakest factor as a priority area for improvement. Frame suggestions positively and encouragingly.`;

// ---------------------------------------------------------------------------
// Generate insights
// ---------------------------------------------------------------------------

/**
 * Sends a structured financial summary to OpenAI and returns
 * 3-5 bullet-point insights about financial health.
 */
export async function generateInsights(
  reportData: ReportData,
  entityType: "user" | "household"
): Promise<string> {
  console.log(
    `[report-insights] Generating ${entityType} insights (income: $${reportData.total_income.toFixed(2)}, expenses: $${reportData.total_expenses.toFixed(2)}, ${reportData.by_category.length} categories)`
  );

  const model = new ChatOpenAI({
    modelName: "gpt-5-mini",
    timeout: 60_000,
  });

  const categoryBreakdown = reportData.by_category
    .map(
      (c) =>
        `  - ${c.category}: $${c.amount.toFixed(2)} (${c.percentage.toFixed(1)}%)`
    )
    .join("\n");

  const momSection = reportData.month_over_month
    ? `Month-over-month changes:
  - Income: ${reportData.month_over_month.income_change > 0 ? "+" : ""}${reportData.month_over_month.income_change.toFixed(1)}%
  - Expenses: ${reportData.month_over_month.expense_change > 0 ? "+" : ""}${reportData.month_over_month.expense_change.toFixed(1)}%`
    : "No previous month data available for comparison.";

  const entityLabel = entityType === "household" ? "household" : "personal";

  const allocationSection = reportData.allocation
    ? `\nSpending Allocation (50/30/20 benchmark):
  - Needs: ${reportData.allocation.needs.percentage}% (benchmark: 50%)
  - Wants: ${reportData.allocation.wants.percentage}% (benchmark: 30%)
  - Savings: ${reportData.allocation.savings.percentage}% (benchmark: 20%)`
    : "";

  const debtSection = reportData.debt_summary
    ? `\nDebt Summary:
  - Total debt balance: $${reportData.debt_summary.total_balance.toFixed(2)}
  - Monthly minimum payments: $${reportData.debt_summary.total_minimum_payments.toFixed(2)}
  - Monthly interest cost: $${reportData.debt_summary.monthly_interest_cost.toFixed(2)}
  - Debt-to-income ratio: ${(reportData.debt_summary.debt_to_income_ratio * 100).toFixed(1)}%
  - Estimated payoff: ${reportData.debt_summary.estimated_payoff_months} months`
    : "";

  const healthSection = reportData.financial_health_score
    ? `\nFinancial Health Score: ${reportData.financial_health_score.score}/100
  - Savings Rate: ${reportData.financial_health_score.factors.savings_rate.rating}
  - Needs Ratio: ${reportData.financial_health_score.factors.needs_ratio.rating}
  - Wants Ratio: ${reportData.financial_health_score.factors.wants_ratio.rating}
  - Emergency Fund: ${reportData.financial_health_score.factors.emergency_fund.rating}
  - Debt-to-Income: ${reportData.financial_health_score.factors.debt_to_income.rating}`
    : "";

  const userPrompt = `Here is the ${entityLabel} financial summary for this month:

Total Income: $${reportData.total_income.toFixed(2)}
Total Expenses: $${reportData.total_expenses.toFixed(2)}
Net Savings: $${(reportData.total_income - reportData.total_expenses).toFixed(2)}
Savings Rate: ${reportData.savings_rate.toFixed(1)}%
Expense-to-Income Ratio: ${reportData.expense_to_income_ratio.toFixed(2)}

Spending by Category:
${categoryBreakdown || "  No category data available."}

Top Categories: ${reportData.top_categories.join(", ") || "None"}

${momSection}${allocationSection}${debtSection}${healthSection}`;

  let content: string;
  try {
    const startTime = Date.now();
    const response = await model.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(userPrompt),
    ]);
    const elapsed = Date.now() - startTime;

    content =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    console.log(
      `[report-insights] AI insights generated in ${elapsed}ms (${content.length} chars)`
    );

    // Log token usage
    const usage = response.usage_metadata;
    if (usage) {
      void logLlmUsage({
        user_id: null, // report-insights doesn't have direct user context
        call_type: "insight_generation",
        model: "gpt-5-mini",
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        total_tokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
      });
    }
  } catch (error) {
    console.error("[report-insights] OpenAI API call failed:", error);
    throw new Error(
      `AI insight generation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return content;
}

// ---------------------------------------------------------------------------
// Generate quarterly insights
// ---------------------------------------------------------------------------

/**
 * Sends a structured quarterly financial summary to OpenAI and returns
 * 4-6 bullet-point insights analyzing the full quarter.
 */
export async function generateQuarterlyInsights(
  reportData: ReportData,
  entityType: "user" | "household",
  periodLabel: string
): Promise<string> {
  console.log(
    `[report-insights] Generating quarterly ${entityType} insights for ${periodLabel} (income: $${reportData.total_income.toFixed(2)}, expenses: $${reportData.total_expenses.toFixed(2)}, ${reportData.by_category.length} categories)`
  );

  const model = new ChatOpenAI({
    modelName: "gpt-5-mini",
    timeout: 60_000,
  });

  const categoryBreakdown = reportData.by_category
    .map(
      (c) =>
        `  - ${c.category}: $${c.amount.toFixed(2)} (${c.percentage.toFixed(1)}%)`
    )
    .join("\n");

  const entityLabel = entityType === "household" ? "household" : "personal";

  const allocationSection = reportData.allocation
    ? `\nSpending Allocation (50/30/20 benchmark):
  - Needs: ${reportData.allocation.needs.percentage}% (benchmark: 50%)
  - Wants: ${reportData.allocation.wants.percentage}% (benchmark: 30%)
  - Savings: ${reportData.allocation.savings.percentage}% (benchmark: 20%)`
    : "";

  const debtSection = reportData.debt_summary
    ? `\nDebt Summary:
  - Total debt balance: $${reportData.debt_summary.total_balance.toFixed(2)}
  - Monthly minimum payments: $${reportData.debt_summary.total_minimum_payments.toFixed(2)}
  - Monthly interest cost: $${reportData.debt_summary.monthly_interest_cost.toFixed(2)}
  - Debt-to-income ratio: ${(reportData.debt_summary.debt_to_income_ratio * 100).toFixed(1)}%
  - Estimated payoff: ${reportData.debt_summary.estimated_payoff_months} months`
    : "";

  const healthSection = reportData.financial_health_score
    ? `\nFinancial Health Score: ${reportData.financial_health_score.score}/100
  - Savings Rate: ${reportData.financial_health_score.factors.savings_rate.rating}
  - Needs Ratio: ${reportData.financial_health_score.factors.needs_ratio.rating}
  - Wants Ratio: ${reportData.financial_health_score.factors.wants_ratio.rating}
  - Emergency Fund: ${reportData.financial_health_score.factors.emergency_fund.rating}
  - Debt-to-Income: ${reportData.financial_health_score.factors.debt_to_income.rating}`
    : "";

  const userPrompt = `Here is the ${entityLabel} financial summary for ${periodLabel}:

Total Income: $${reportData.total_income.toFixed(2)}
Total Expenses: $${reportData.total_expenses.toFixed(2)}
Net Savings: $${(reportData.total_income - reportData.total_expenses).toFixed(2)}
Savings Rate: ${reportData.savings_rate.toFixed(1)}%
Expense-to-Income Ratio: ${reportData.expense_to_income_ratio.toFixed(2)}

Spending by Category:
${categoryBreakdown || "  No category data available."}

Top Categories: ${reportData.top_categories.join(", ") || "None"}${allocationSection}${debtSection}${healthSection}`;

  let content: string;
  try {
    const startTime = Date.now();
    const response = await model.invoke([
      new SystemMessage(QUARTERLY_SYSTEM_PROMPT),
      new HumanMessage(userPrompt),
    ]);
    const elapsed = Date.now() - startTime;

    content =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    console.log(
      `[report-insights] Quarterly AI insights generated in ${elapsed}ms (${content.length} chars)`
    );

    // Log token usage
    const usage = response.usage_metadata;
    if (usage) {
      void logLlmUsage({
        user_id: null,
        call_type: "quarterly_insight_generation",
        model: "gpt-5-mini",
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        total_tokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
      });
    }
  } catch (error) {
    console.error("[report-insights] Quarterly OpenAI API call failed:", error);
    throw new Error(
      `Quarterly AI insight generation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return content;
}

// ---------------------------------------------------------------------------
// Generate annual insights
// ---------------------------------------------------------------------------

export interface GoalSummary {
  achieved: string[];
  inProgress: string[];
  totalCreated: number;
}

/**
 * Sends a structured annual financial summary to OpenAI and returns
 * 5-7 bullet-point insights for a Year-in-Review report.
 */
export async function generateAnnualInsights(
  reportData: ReportData,
  entityType: "user" | "household",
  periodLabel: string,
  goalSummary?: GoalSummary
): Promise<string> {
  console.log(
    `[report-insights] Generating annual ${entityType} insights for ${periodLabel} (income: $${reportData.total_income.toFixed(2)}, expenses: $${reportData.total_expenses.toFixed(2)}, ${reportData.by_category.length} categories)`
  );

  const model = new ChatOpenAI({
    modelName: "gpt-5-mini",
    timeout: 90_000,
  });

  const categoryBreakdown = reportData.by_category
    .map(
      (c) =>
        `  - ${c.category}: $${c.amount.toFixed(2)} (${c.percentage.toFixed(1)}%)`
    )
    .join("\n");

  const entityLabel = entityType === "household" ? "household" : "personal";

  const allocationSection = reportData.allocation
    ? `\nSpending Allocation (50/30/20 benchmark):
  - Needs: ${reportData.allocation.needs.percentage}% (benchmark: 50%)
  - Wants: ${reportData.allocation.wants.percentage}% (benchmark: 30%)
  - Savings: ${reportData.allocation.savings.percentage}% (benchmark: 20%)`
    : "";

  const debtSection = reportData.debt_summary
    ? `\nDebt Summary:
  - Total debt balance: $${reportData.debt_summary.total_balance.toFixed(2)}
  - Monthly minimum payments: $${reportData.debt_summary.total_minimum_payments.toFixed(2)}
  - Monthly interest cost: $${reportData.debt_summary.monthly_interest_cost.toFixed(2)}
  - Debt-to-income ratio: ${(reportData.debt_summary.debt_to_income_ratio * 100).toFixed(1)}%
  - Estimated payoff: ${reportData.debt_summary.estimated_payoff_months} months`
    : "";

  const healthSection = reportData.financial_health_score
    ? `\nFinancial Health Score: ${reportData.financial_health_score.score}/100
  - Savings Rate: ${reportData.financial_health_score.factors.savings_rate.rating}
  - Needs Ratio: ${reportData.financial_health_score.factors.needs_ratio.rating}
  - Wants Ratio: ${reportData.financial_health_score.factors.wants_ratio.rating}
  - Emergency Fund: ${reportData.financial_health_score.factors.emergency_fund.rating}
  - Debt-to-Income: ${reportData.financial_health_score.factors.debt_to_income.rating}`
    : "";

  const goalSection = goalSummary
    ? `\nGoal Summary (${goalSummary.totalCreated} total goals created):
  - Achieved: ${goalSummary.achieved.length > 0 ? goalSummary.achieved.join(", ") : "None"}
  - In Progress: ${goalSummary.inProgress.length > 0 ? goalSummary.inProgress.join(", ") : "None"}`
    : "";

  const userPrompt = `Here is the ${entityLabel} financial summary for ${periodLabel}:

Total Income: $${reportData.total_income.toFixed(2)}
Total Expenses: $${reportData.total_expenses.toFixed(2)}
Net Savings: $${(reportData.total_income - reportData.total_expenses).toFixed(2)}
Savings Rate: ${reportData.savings_rate.toFixed(1)}%
Expense-to-Income Ratio: ${reportData.expense_to_income_ratio.toFixed(2)}

Spending by Category:
${categoryBreakdown || "  No category data available."}

Top Categories: ${reportData.top_categories.join(", ") || "None"}${allocationSection}${debtSection}${healthSection}${goalSection}`;

  let content: string;
  try {
    const startTime = Date.now();
    const response = await model.invoke([
      new SystemMessage(ANNUAL_SYSTEM_PROMPT),
      new HumanMessage(userPrompt),
    ]);
    const elapsed = Date.now() - startTime;

    content =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    console.log(
      `[report-insights] Annual AI insights generated in ${elapsed}ms (${content.length} chars)`
    );

    // Log token usage
    const usage = response.usage_metadata;
    if (usage) {
      void logLlmUsage({
        user_id: null,
        call_type: "annual_insight_generation",
        model: "gpt-5-mini",
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        total_tokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
      });
    }
  } catch (error) {
    console.error("[report-insights] Annual OpenAI API call failed:", error);
    throw new Error(
      `Annual AI insight generation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return content;
}
