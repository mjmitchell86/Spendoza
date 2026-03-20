import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../lib/supabase";
import { generateInsights, type ReportData } from "../ai/report-insights";
import type { AllocationBreakdown, DebtSummary } from "../ai/report-insights";
import { calculateHealthScore } from "./health-score.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the first day of the given month (Date at 00:00 UTC). */
function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1));
}

/** Format date as YYYY-MM-DD for Supabase queries. */
function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Compute percentage, safe against division by zero. */
function pct(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 10000) / 100; // 2-decimal places
}

// ---------------------------------------------------------------------------
// Allocation, Debt & Health-Score helpers
// ---------------------------------------------------------------------------

async function computeAllocation(
  byCategory: Array<{ category: string; amount: number; percentage: number }>,
  userId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<AllocationBreakdown> {
  const { data: categories } = await db
    .from("categories")
    .select("name, budget_class")
    .eq("user_id", userId);

  const classMap = new Map<string, string>();
  for (const cat of categories ?? []) {
    classMap.set(cat.name.toLowerCase(), cat.budget_class);
  }

  const totals = { need: 0, want: 0, savings: 0, other: 0 };
  let totalAmount = 0;

  for (const cat of byCategory) {
    const budgetClass = classMap.get(cat.category.toLowerCase()) ?? "other";
    totals[budgetClass as keyof typeof totals] += cat.amount;
    totalAmount += cat.amount;
  }

  const pctAlloc = (amt: number) =>
    totalAmount > 0 ? Math.round((amt / totalAmount) * 1000) / 10 : 0;

  return {
    needs: { amount: totals.need, percentage: pctAlloc(totals.need) },
    wants: { amount: totals.want, percentage: pctAlloc(totals.want) },
    savings: { amount: totals.savings, percentage: pctAlloc(totals.savings) },
    unclassified: { amount: totals.other, percentage: pctAlloc(totals.other) },
    benchmark: { needs: 50, wants: 30, savings: 20 },
  };
}

async function computeDebtSummary(
  entityType: "user" | "household",
  entityId: string,
  totalIncome: number,
  db: SupabaseClient = supabaseAdmin
): Promise<DebtSummary | undefined> {
  const { data: debts } = await db
    .from("debts")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .gt("current_balance", 0);

  if (!debts || debts.length === 0) return undefined;

  const totalBalance = debts.reduce((s, d) => s + Number(d.current_balance), 0);
  const creditCardBalance = debts
    .filter((d: any) => d.debt_type === "credit_card")
    .reduce((s, d) => s + Number(d.current_balance), 0);
  const totalMinPayments = debts.reduce((s, d) => s + Number(d.minimum_payment), 0);
  const monthlyInterest = debts.reduce(
    (s, d) => s + (Number(d.current_balance) * Number(d.interest_rate)) / 100 / 12,
    0
  );

  const highest = debts.reduce((max, d) =>
    Number(d.interest_rate) > Number(max.interest_rate) ? d : max
  );

  let estMonths = 0;
  if (totalMinPayments > monthlyInterest) {
    estMonths = Math.ceil(totalBalance / (totalMinPayments - monthlyInterest));
  }

  return {
    total_balance: totalBalance,
    credit_card_balance: creditCardBalance,
    total_minimum_payments: totalMinPayments,
    monthly_interest_cost: Math.round(monthlyInterest * 100) / 100,
    highest_rate_debt: {
      name: highest.name,
      rate: Number(highest.interest_rate),
      balance: Number(highest.current_balance),
    },
    debt_to_income_ratio:
      totalIncome > 0 ? Math.round((totalMinPayments / totalIncome) * 100) / 100 : 0,
    estimated_payoff_months: estMonths,
  };
}

async function getEmergencyFundMonths(
  entityType: "user" | "household",
  entityId: string,
  avgMonthlyExpenses: number,
  db: SupabaseClient = supabaseAdmin
): Promise<number> {
  if (avgMonthlyExpenses <= 0) return 0;

  const { data: efGoals } = await db
    .from("goals")
    .select("current_amount")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("goal_type", "emergency_fund");

  if (!efGoals || efGoals.length === 0) return 0;

  const totalSaved = efGoals.reduce((s, g) => s + Number(g.current_amount), 0);
  return Math.round((totalSaved / avgMonthlyExpenses) * 10) / 10;
}

// ---------------------------------------------------------------------------
// generateUserReport
// ---------------------------------------------------------------------------

export async function generateUserReport(
  userId: string,
  month: Date,
  force = false,
  client?: SupabaseClient
): Promise<any> {
  const db = client ?? supabaseAdmin;
  const monthStart = startOfMonth(month);

  const monthStr = toDateStr(monthStart);

  // 1. Check for cached report with no new data
  const { data: existingReport } = await db
    .from("reports")
    .select("*")
    .eq("entity_type", "user")
    .eq("entity_id", userId)
    .eq("report_month", monthStr)
    .maybeSingle();

  if (!force && existingReport && !existingReport.has_new_data) {
    return existingReport;
  }

  // 2. Query bank transactions for this month (matches what the dashboard displays)
  const nextMonthDate = new Date(
    Date.UTC(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
  );
  const { data: transactions } = await db
    .from("transactions")
    .select("amount, type, ai_category")
    .eq("user_id", userId)
    .gte("date", toDateStr(monthStart))
    .lt("date", toDateStr(nextMonthDate));

  const txns = transactions ?? [];

  let totalIncome: number;
  let totalExpenses: number;
  let byCategory: Array<{ category: string; amount: number; percentage: number }>;

  // Use bank transactions only — same data source the dashboard displays
  totalIncome = txns
    .filter((t) => t.type === "credit")
    .reduce((sum, t) => sum + (t.amount ?? 0), 0);
  totalExpenses = txns
    .filter((t) => t.type === "debit")
    .reduce((sum, t) => sum + (t.amount ?? 0), 0);

  const categoryMap = new Map<string, number>();
  for (const t of txns.filter((t) => t.type === "debit")) {
    const cat = t.ai_category ?? "Uncategorized";
    categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + (t.amount ?? 0));
  }

  byCategory = Array.from(categoryMap.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: pct(amount, totalExpenses),
    }))
    .sort((a, b) => b.amount - a.amount);

  const topCategories = byCategory.slice(0, 5).map((c) => c.category);

  // 5. Compute savings rate and expense-to-income ratio
  const savingsRate = totalIncome > 0 ? pct(totalIncome - totalExpenses, totalIncome) : 0;
  const expenseToIncomeRatio =
    totalIncome > 0
      ? Math.round((totalExpenses / totalIncome) * 100) / 100
      : 0;

  // 6. Get previous month's report for month-over-month
  const prevMonthDate = new Date(
    Date.UTC(monthStart.getFullYear(), monthStart.getMonth() - 1, 1)
  );
  const prevMonthStr = toDateStr(prevMonthDate);

  const { data: prevReport } = await db
    .from("reports")
    .select("report_data")
    .eq("entity_type", "user")
    .eq("entity_id", userId)
    .eq("report_month", prevMonthStr)
    .single();

  let monthOverMonth: ReportData["month_over_month"] = null;
  if (prevReport?.report_data) {
    const prev = prevReport.report_data as any;
    const prevIncome = prev.total_income ?? 0;
    const prevExpenses = prev.total_expenses ?? 0;

    monthOverMonth = {
      income_change:
        prevIncome > 0
          ? Math.round(((totalIncome - prevIncome) / prevIncome) * 10000) / 100
          : 0,
      expense_change:
        prevExpenses > 0
          ? Math.round(
              ((totalExpenses - prevExpenses) / prevExpenses) * 10000
            ) / 100
          : 0,
    };
  }

  // 7. Build report data
  const reportData: ReportData = {
    total_income: totalIncome,
    total_expenses: totalExpenses,
    savings_rate: savingsRate,
    expense_to_income_ratio: expenseToIncomeRatio,
    by_category: byCategory,
    top_categories: topCategories,
    month_over_month: monthOverMonth,
  };

  // Compute allocation breakdown
  const allocation = await computeAllocation(reportData.by_category, userId, db);
  reportData.allocation = allocation;

  // Compute debt summary
  const debtSummary = await computeDebtSummary("user", userId, reportData.total_income, db);
  if (debtSummary) reportData.debt_summary = debtSummary;

  // Get previous health score
  const prevHealthMonth = new Date(month);
  prevHealthMonth.setMonth(prevHealthMonth.getMonth() - 1);
  const { data: prevHealthReport } = await db
    .from("reports")
    .select("report_data")
    .eq("entity_type", "user")
    .eq("entity_id", userId)
    .eq("report_month", prevHealthMonth.toISOString().split("T")[0])
    .single();
  const previousScore = (prevHealthReport?.report_data as any)?.financial_health_score?.score ?? null;

  // Emergency fund months
  const efMonths = await getEmergencyFundMonths("user", userId, reportData.total_expenses, db);

  // Financial health score
  reportData.financial_health_score = calculateHealthScore(
    reportData.savings_rate,
    allocation,
    debtSummary,
    efMonths,
    previousScore
  );

  // 8. Generate AI insights (non-fatal — save report even if AI fails)
  let aiInsights: string | null = null;
  try {
    aiInsights = await generateInsights(reportData, "user");
  } catch (err) {
    console.error("[report] AI insight generation failed, saving report without insights:", err);
  }

  // 9. Upsert report
  const { data: upsertedReport } = await db
    .from("reports")
    .upsert(
      {
        entity_type: "user",
        entity_id: userId,
        report_month: monthStr,
        report_data: reportData,
        ai_insights: aiInsights,
        generated_at: new Date().toISOString(),
        has_new_data: false,
      },
      { onConflict: "entity_type,entity_id,report_month" }
    )
    .select()
    .single();

  return upsertedReport ?? {
    entity_type: "user",
    entity_id: userId,
    report_month: monthStr,
    report_data: reportData,
    ai_insights: aiInsights,
    generated_at: new Date().toISOString(),
    has_new_data: false,
  };
}

// ---------------------------------------------------------------------------
// generateHouseholdReport
// ---------------------------------------------------------------------------

export async function generateHouseholdReport(
  householdId: string,
  month: Date,
  force = false,
  client?: SupabaseClient
): Promise<any> {
  const db = client ?? supabaseAdmin;
  const monthStart = startOfMonth(month);

  const monthStr = toDateStr(monthStart);

  // 1. Check for cached report
  const { data: existingReport } = await db
    .from("reports")
    .select("*")
    .eq("entity_type", "household")
    .eq("entity_id", householdId)
    .eq("report_month", monthStr)
    .maybeSingle();

  if (!force && existingReport && !existingReport.has_new_data) {
    return existingReport;
  }

  // 2. Get all household members with sharing preferences
  const { data: members } = await db
    .from("profiles")
    .select("id, income_sharing_mode, expense_sharing_mode")
    .eq("household_id", householdId);

  const memberIds = (members ?? []).map((m: any) => m.id);

  // 3. Query bank transactions for all sharing members this month
  const nextMonthDate = new Date(
    Date.UTC(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
  );

  let totalIncome = 0;
  let totalExpenses = 0;
  const categoryMap = new Map<string, number>();
  for (const member of members ?? []) {
    const includeIncome = member.income_sharing_mode === "all";
    const includeExpenses = member.expense_sharing_mode === "all";
    if (!includeIncome && !includeExpenses) continue;

    const { data: transactions } = await db
      .from("transactions")
      .select("amount, type, ai_category")
      .eq("user_id", member.id)
      .gte("date", toDateStr(monthStart))
      .lt("date", toDateStr(nextMonthDate));

    const txns = transactions ?? [];
    for (const t of txns) {
      if (t.type === "credit" && includeIncome) {
        totalIncome += t.amount ?? 0;
      }
      if (t.type === "debit" && includeExpenses) {
        totalExpenses += t.amount ?? 0;
        const cat = t.ai_category ?? "Uncategorized";
        categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + (t.amount ?? 0));
      }
    }
  }

  // 4. Build category breakdown
  const byCategory = Array.from(categoryMap.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: pct(amount, totalExpenses),
    }))
    .sort((a, b) => b.amount - a.amount);

  const topCategories = byCategory.slice(0, 5).map((c) => c.category);

  // 5. Compute ratios
  const savingsRate =
    totalIncome > 0 ? pct(totalIncome - totalExpenses, totalIncome) : 0;
  const expenseToIncomeRatio =
    totalIncome > 0
      ? Math.round((totalExpenses / totalIncome) * 100) / 100
      : 0;

  // 6. Previous month comparison
  const prevMonthDate = new Date(
    Date.UTC(monthStart.getFullYear(), monthStart.getMonth() - 1, 1)
  );
  const prevMonthStr = toDateStr(prevMonthDate);

  const { data: prevReport } = await db
    .from("reports")
    .select("report_data")
    .eq("entity_type", "household")
    .eq("entity_id", householdId)
    .eq("report_month", prevMonthStr)
    .single();

  let monthOverMonth: ReportData["month_over_month"] = null;
  if (prevReport?.report_data) {
    const prev = prevReport.report_data as any;
    monthOverMonth = {
      income_change:
        prev.total_income > 0
          ? Math.round(
              ((totalIncome - prev.total_income) / prev.total_income) * 10000
            ) / 100
          : 0,
      expense_change:
        prev.total_expenses > 0
          ? Math.round(
              ((totalExpenses - prev.total_expenses) / prev.total_expenses) *
                10000
            ) / 100
          : 0,
    };
  }

  // 7. Build report data
  const reportData: ReportData = {
    total_income: totalIncome,
    total_expenses: totalExpenses,
    savings_rate: savingsRate,
    expense_to_income_ratio: expenseToIncomeRatio,
    by_category: byCategory,
    top_categories: topCategories,
    month_over_month: monthOverMonth,
  };

  // Use head of household's categories for allocation classification
  const { data: household } = await db
    .from("households")
    .select("head_of_household_id")
    .eq("id", householdId)
    .single();

  const allocation = await computeAllocation(
    reportData.by_category,
    household!.head_of_household_id,
    db
  );
  reportData.allocation = allocation;

  const debtSummary = await computeDebtSummary("household", householdId, reportData.total_income, db);
  if (debtSummary) reportData.debt_summary = debtSummary;

  const efMonths = await getEmergencyFundMonths("household", householdId, reportData.total_expenses, db);

  const prevHHMonth = new Date(month);
  prevHHMonth.setMonth(prevHHMonth.getMonth() - 1);
  const { data: prevHHReport } = await db
    .from("reports")
    .select("report_data")
    .eq("entity_type", "household")
    .eq("entity_id", householdId)
    .eq("report_month", prevHHMonth.toISOString().split("T")[0])
    .single();
  const previousHHScore = (prevHHReport?.report_data as any)?.financial_health_score?.score ?? null;

  reportData.financial_health_score = calculateHealthScore(
    reportData.savings_rate,
    allocation,
    debtSummary,
    efMonths,
    previousHHScore
  );

  // 8. Generate AI insights (non-fatal — save report even if AI fails)
  let aiInsights: string | null = null;
  try {
    aiInsights = await generateInsights(reportData, "household");
  } catch (err) {
    console.error("[report] AI insight generation failed, saving report without insights:", err);
  }

  // 9. Upsert report
  const { data: upsertedReport } = await db
    .from("reports")
    .upsert(
      {
        entity_type: "household",
        entity_id: householdId,
        report_month: monthStr,
        report_data: reportData,
        ai_insights: aiInsights,
        generated_at: new Date().toISOString(),
        has_new_data: false,
      },
      { onConflict: "entity_type,entity_id,report_month" }
    )
    .select()
    .single();

  return upsertedReport ?? {
    entity_type: "household",
    entity_id: householdId,
    report_month: monthStr,
    report_data: reportData,
    ai_insights: aiInsights,
    generated_at: new Date().toISOString(),
    has_new_data: false,
  };
}

// ---------------------------------------------------------------------------
// generateAllReports (called by cron)
// ---------------------------------------------------------------------------

export async function generateAllReports(month: Date): Promise<void> {
  // 1. Get all user IDs
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id");

  // 2. Generate user reports (sequential to avoid overwhelming the AI API)
  for (const profile of profiles ?? []) {
    try {
      await generateUserReport(profile.id, month);
    } catch (err) {
      console.error(`Failed to generate report for user ${profile.id}:`, err);
    }
  }

  // 3. Get all household IDs
  const { data: households } = await supabaseAdmin
    .from("households")
    .select("id");

  // 4. Generate household reports
  for (const household of households ?? []) {
    try {
      await generateHouseholdReport(household.id, month);
    } catch (err) {
      console.error(
        `Failed to generate report for household ${household.id}:`,
        err
      );
    }
  }
}
