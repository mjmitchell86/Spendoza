import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { logLlmUsage } from "./llm-usage-logger";
import { goalSuggestionSchema, type GoalSuggestion } from "@spendoza/shared";
import type { ReportData } from "./report-insights";

const SYSTEM_PROMPT = `You are a certified financial planner. Given a monthly financial summary, spending allocation analysis, debt information, and existing goals, suggest 2-4 new financial goals following this priority framework (suggest from the highest applicable priority):

PRIORITY 1 - EMERGENCY FUND: If no emergency fund goal exists, suggest one. Target = average monthly expenses × 3 (minimum) or × 6 (recommended). Use goal_type "emergency_fund".

PRIORITY 2 - HIGH-INTEREST DEBT: If debts exist above 10% APR and no debt_payoff goal exists for them, suggest paying off the highest-rate debt first (avalanche method). Use goal_type "debt_payoff" and include debt_name.

PRIORITY 3 - SAVINGS RATE: If savings rate is below 20% and no savings_rate goal exists, suggest improving to 20% (the 50/30/20 guideline). Use goal_type "savings_rate". The target_amount should be the target percentage (e.g., 20).

PRIORITY 4 - SPENDING REDUCTION: Target categories with the highest month-over-month increases. Prioritize discretionary spending (wants) over essential spending (needs). Set target_amount to 15-25% below current spending for wants, 5-10% for needs. Use goal_type "budget".

PRIORITY 5 - SUBSCRIPTION AUDIT: If subscriptions exceed 5% of total expenses, suggest reducing them. Use goal_type "budget" with category "Subscriptions".

PRIORITY 6 - SAVINGS MILESTONES: If the user is already saving 20%+, suggest target_savings goals for common milestones (vacation, home down payment, etc.). Use goal_type "target_savings".

Each suggestion must be a JSON object with these fields:
- name: short descriptive goal name
- goal_type: one of "budget", "savings_amount", "savings_rate", "emergency_fund", "debt_payoff", or "target_savings"
- category: the spending category name for budget goals, or null for other types
- target_amount: a positive number (dollar amount, or percentage for savings_rate)
- debt_name: for debt_payoff goals, the name of the debt to link (null for other types)
- rationale: 1-2 sentence explanation citing specific dollar amounts AND the financial planning principle behind the suggestion

Rules:
- Do NOT suggest goals that duplicate existing goal names or types already covered
- Reference specific dollar amounts and percentages from the report data
- Prioritize higher-priority suggestions over lower ones

Respond ONLY with valid JSON in this exact format:
{"suggestions": [...]}`;

export async function generateGoalSuggestions(
  reportData: ReportData,
  entityType: "user" | "household",
  existingGoals: Array<{ name: string; goal_type: string }>
): Promise<GoalSuggestion[]> {
  console.log(
    `[goal-suggestions] Generating ${entityType} goal suggestions (${reportData.by_category.length} categories, ${existingGoals.length} existing goals)`
  );

  const model = new ChatOpenAI({
    modelName: "gpt-5-mini",
    timeout: 60_000,
  });

  const entityLabel = entityType === "household" ? "household" : "personal";

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

  const existingGoalSection =
    existingGoals.length > 0
      ? existingGoals
          .map((g) => `  - ${g.name} (type: ${g.goal_type})`)
          .join("\n")
      : "  None";

  const hasEmergencyFund = existingGoals.some(
    (g) => g.goal_type === "emergency_fund"
  );
  const hasSavingsRate = existingGoals.some(
    (g) => g.goal_type === "savings_rate"
  );

  const allocationSection = reportData.allocation
    ? `\nSpending Allocation (50/30/20):
  - Needs: ${reportData.allocation.needs.percentage}% ($${reportData.allocation.needs.amount.toFixed(2)}) — benchmark: 50%
  - Wants: ${reportData.allocation.wants.percentage}% ($${reportData.allocation.wants.amount.toFixed(2)}) — benchmark: 30%
  - Savings: ${reportData.allocation.savings.percentage}% ($${reportData.allocation.savings.amount.toFixed(2)}) — benchmark: 20%`
    : "";

  const debtSection = reportData.debt_summary
    ? `\nDebt Information:
  - Total balance: $${reportData.debt_summary.total_balance.toFixed(2)}
  - Monthly payments: $${reportData.debt_summary.total_minimum_payments.toFixed(2)}
  - Monthly interest cost: $${reportData.debt_summary.monthly_interest_cost.toFixed(2)}
  - Highest rate: ${reportData.debt_summary.highest_rate_debt?.name} at ${reportData.debt_summary.highest_rate_debt?.rate}% ($${reportData.debt_summary.highest_rate_debt?.balance.toFixed(2)} balance)`
    : "\nNo tracked debts.";

  const contextFlags = `\nContext:
  - Has emergency fund goal: ${hasEmergencyFund ? "yes" : "no"}
  - Has savings rate goal: ${hasSavingsRate ? "yes" : "no"}
  - Average monthly expenses: $${reportData.total_expenses.toFixed(2)}`;

  const userPrompt = `Here is the ${entityLabel} financial summary for this month:

Total Income: $${reportData.total_income.toFixed(2)}
Total Expenses: $${reportData.total_expenses.toFixed(2)}
Net Savings: $${(reportData.total_income - reportData.total_expenses).toFixed(2)}
Savings Rate: ${reportData.savings_rate.toFixed(1)}%

Spending by Category:
${categoryBreakdown || "  No category data available."}
${allocationSection}

${momSection}
${debtSection}
${contextFlags}

Existing goals (do NOT duplicate these):
${existingGoalSection}

Suggest 2-4 new goals following the priority framework.`;

  try {
    const startTime = Date.now();
    const response = await model.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(userPrompt),
    ]);
    const elapsed = Date.now() - startTime;

    const content =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    console.log(
      `[goal-suggestions] AI response in ${elapsed}ms (${content.length} chars)`
    );

    const usage = response.usage_metadata;
    if (usage) {
      void logLlmUsage({
        user_id: null,
        call_type: "goal_suggestions",
        model: "gpt-5-mini",
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        total_tokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
      });
    }

    const parsed = JSON.parse(content);
    const suggestions = z.array(goalSuggestionSchema).parse(parsed.suggestions);

    // Filter out any that match existing goal names (case-insensitive)
    const lowerExisting = new Set(
      existingGoals.map((g) => g.name.toLowerCase())
    );
    return suggestions.filter((s) => !lowerExisting.has(s.name.toLowerCase()));
  } catch (error) {
    console.error("[goal-suggestions] Failed to generate suggestions:", error);
    return [];
  }
}
