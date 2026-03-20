import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { logLlmUsage } from "./llm-usage-logger";
import type { ReportData } from "./report-insights";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface FinancialContext {
  reports: Array<{ month: string; data: ReportData }>;
  goals: Array<{ name: string; goal_type: string; target_amount: number; current_amount: number }>;
  debts: Array<{
    name: string;
    debt_type: string;
    current_balance: number;
    interest_rate: number;
    minimum_payment: number;
  }>;
  income_entries: Array<{ source_name: string; amount: number; frequency: string }>;
  expenses: Array<{ description: string; amount: number; category: string; frequency: string }>;
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are a knowledgeable and friendly personal finance advisor for Spendoza, a personal finance tracking app. The user will ask you a question about their finances, and you will be provided with their complete financial context including recent reports, income, expenses, debts, and goals.

Your role:
- Answer the user's specific question using their actual financial data
- Provide actionable, personalized advice based on their numbers
- Reference specific amounts, categories, and trends from their data
- Be encouraging but honest about areas that need improvement
- Keep responses concise (3-6 paragraphs max)
- Use the 50/30/20 budgeting guideline as a reference when relevant
- Never recommend specific investment products, stocks, or securities
- Remind the user that you provide general financial guidance, not professional financial advice

When discussing trends, compare month-over-month data if available. When discussing financial health, reference their health score factors and ratings.`;

// ---------------------------------------------------------------------------
// Build context string from financial data
// ---------------------------------------------------------------------------
function buildContextString(ctx: FinancialContext): string {
  const sections: string[] = [];

  // Reports (most recent first, up to 6 months)
  if (ctx.reports.length > 0) {
    const reportLines = ctx.reports.map((r) => {
      const d = r.data;
      let line = `  ${r.month}: Income $${d.total_income.toFixed(2)}, Expenses $${d.total_expenses.toFixed(2)}, Savings Rate ${d.savings_rate.toFixed(1)}%`;

      if (d.allocation) {
        line += `\n    Allocation — Needs: ${d.allocation.needs.percentage}%, Wants: ${d.allocation.wants.percentage}%, Savings: ${d.allocation.savings.percentage}%`;
      }

      if (d.financial_health_score) {
        const hs = d.financial_health_score;
        line += `\n    Health Score: ${hs.score}/100 (Savings Rate: ${hs.factors.savings_rate.rating}, Needs: ${hs.factors.needs_ratio.rating}, Wants: ${hs.factors.wants_ratio.rating}, Emergency Fund: ${hs.factors.emergency_fund.rating}, Debt-to-Income: ${hs.factors.debt_to_income.rating})`;
      }

      if (d.debt_summary) {
        const ds = d.debt_summary;
        line += `\n    Debt: $${ds.total_balance.toFixed(2)} total, ${(ds.debt_to_income_ratio * 100).toFixed(1)}% DTI, ~${ds.estimated_payoff_months} months to payoff`;
      }

      if (d.by_category.length > 0) {
        const cats = d.by_category
          .slice(0, 8)
          .map((c) => `${c.category}: $${c.amount.toFixed(2)} (${c.percentage.toFixed(1)}%)`)
          .join(", ");
        line += `\n    Top Categories: ${cats}`;
      }

      return line;
    });
    sections.push(`Monthly Reports (most recent first):\n${reportLines.join("\n")}`);
  }

  // Income
  if (ctx.income_entries.length > 0) {
    const incomeLines = ctx.income_entries.map(
      (i) => `  - ${i.source_name}: $${i.amount.toFixed(2)} (${i.frequency})`
    );
    sections.push(`Income Sources:\n${incomeLines.join("\n")}`);
  }

  // Expenses
  if (ctx.expenses.length > 0) {
    const expenseLines = ctx.expenses.map(
      (e) => `  - ${e.description} [${e.category}]: $${e.amount.toFixed(2)} (${e.frequency})`
    );
    sections.push(`Recurring Expenses:\n${expenseLines.join("\n")}`);
  }

  // Debts
  if (ctx.debts.length > 0) {
    const debtLines = ctx.debts.map(
      (d) =>
        `  - ${d.name} (${d.debt_type}): $${d.current_balance.toFixed(2)} at ${d.interest_rate}% APR, min payment $${d.minimum_payment.toFixed(2)}`
    );
    sections.push(`Debts:\n${debtLines.join("\n")}`);
  }

  // Goals
  if (ctx.goals.length > 0) {
    const goalLines = ctx.goals.map(
      (g) =>
        `  - ${g.name} (${g.goal_type}): target $${g.target_amount.toFixed(2)}, current $${g.current_amount.toFixed(2)}`
    );
    sections.push(`Financial Goals:\n${goalLines.join("\n")}`);
  }

  if (sections.length === 0) {
    return "No financial data available yet. The user has not uploaded any bank statements or entered any financial information.";
  }

  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Generate advice
// ---------------------------------------------------------------------------
export async function generateFinancialAdvice(
  question: string,
  context: FinancialContext,
  userId: string
): Promise<string> {
  console.log(
    `[financial-advisor] Generating advice for user ${userId}: "${question.slice(0, 80)}..."`
  );

  const model = new ChatOpenAI({
    modelName: "gpt-5-mini",
    timeout: 60_000,
  });

  const contextStr = buildContextString(context);

  const userPrompt = `Here is my complete financial context:

${contextStr}

My question: ${question}`;

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
    `[financial-advisor] Advice generated in ${elapsed}ms (${content.length} chars)`
  );

  // Log token usage
  const usage = response.usage_metadata;
  if (usage) {
    void logLlmUsage({
      user_id: userId,
      call_type: "financial_advice",
      model: "gpt-5-mini",
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      total_tokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
    });
  }

  return content;
}
