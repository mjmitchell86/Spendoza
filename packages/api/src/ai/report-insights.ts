import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ReportData {
  total_income: number;
  total_expenses: number;
  savings_rate: number;
  expense_to_income_ratio: number;
  by_category: Array<{ category: string; amount: number; percentage: number }>;
  top_categories: string[];
  month_over_month: { income_change: number; expense_change: number } | null;
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
Respond ONLY with the bullet points, no introduction or conclusion.`;

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
  const model = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0.3,
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

  const userPrompt = `Here is the ${entityLabel} financial summary for this month:

Total Income: $${reportData.total_income.toFixed(2)}
Total Expenses: $${reportData.total_expenses.toFixed(2)}
Net Savings: $${(reportData.total_income - reportData.total_expenses).toFixed(2)}
Savings Rate: ${reportData.savings_rate.toFixed(1)}%
Expense-to-Income Ratio: ${reportData.expense_to_income_ratio.toFixed(2)}

Spending by Category:
${categoryBreakdown || "  No category data available."}

Top Categories: ${reportData.top_categories.join(", ") || "None"}

${momSection}`;

  const response = await model.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(userPrompt),
  ]);

  const content =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

  return content;
}
