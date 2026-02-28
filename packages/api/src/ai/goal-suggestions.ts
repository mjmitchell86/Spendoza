import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { logLlmUsage } from "./llm-usage-logger";
import { goalSuggestionSchema, type GoalSuggestion } from "@spendoza/shared";
import type { ReportData } from "./report-insights";

const SYSTEM_PROMPT = `You are a personal finance advisor. Given a monthly financial summary and a list of existing goals, suggest 2-4 new financial goals the user should consider.

Each suggestion must be a JSON object with these fields:
- name: short descriptive goal name
- goal_type: one of "budget", "monthly_savings", or "total_savings"
- category: the spending category name (string) for budget goals, or null for savings goals
- target_amount: a positive number for the goal target
- rationale: 1-2 sentence explanation referencing specific numbers from the data

Rules:
- Do NOT suggest goals that duplicate existing goal names
- For budget goals: set target_amount to 10-25% below current spending for that category
- For savings goals: base targets on realistic improvements given current income/expenses
- Reference specific dollar amounts and percentages from the report data in your rationale

Respond ONLY with valid JSON in this exact format:
{"suggestions": [...]}`;

export async function generateGoalSuggestions(
  reportData: ReportData,
  entityType: "user" | "household",
  existingGoalNames: string[]
): Promise<GoalSuggestion[]> {
  console.log(
    `[goal-suggestions] Generating ${entityType} goal suggestions (${reportData.by_category.length} categories, ${existingGoalNames.length} existing goals)`
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

  const userPrompt = `Here is the ${entityLabel} financial summary for this month:

Total Income: $${reportData.total_income.toFixed(2)}
Total Expenses: $${reportData.total_expenses.toFixed(2)}
Net Savings: $${(reportData.total_income - reportData.total_expenses).toFixed(2)}
Savings Rate: ${reportData.savings_rate.toFixed(1)}%

Spending by Category:
${categoryBreakdown || "  No category data available."}

${momSection}

Existing goals (do NOT duplicate these):
${existingGoalNames.length > 0 ? existingGoalNames.map((n) => `  - ${n}`).join("\n") : "  None"}

Suggest 2-4 new goals.`;

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
    const lowerExisting = new Set(existingGoalNames.map((n) => n.toLowerCase()));
    return suggestions.filter((s) => !lowerExisting.has(s.name.toLowerCase()));
  } catch (error) {
    console.error("[goal-suggestions] Failed to generate suggestions:", error);
    return [];
  }
}
