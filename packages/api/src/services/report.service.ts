import { supabaseAdmin } from "../lib/supabase";
import { generateInsights, type ReportData } from "../ai/report-insights";

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
// generateUserReport
// ---------------------------------------------------------------------------

export async function generateUserReport(
  userId: string,
  month: Date,
  force = false
): Promise<any> {
  const monthStart = startOfMonth(month);

  const monthStr = toDateStr(monthStart);

  // 1. Check for cached report with no new data
  const { data: existingReport } = await supabaseAdmin
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
  const { data: transactions } = await supabaseAdmin
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

  const { data: prevReport } = await supabaseAdmin
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

  // 8. Generate AI insights (non-fatal — save report even if AI fails)
  let aiInsights: string | null = null;
  try {
    aiInsights = await generateInsights(reportData, "user");
  } catch (err) {
    console.error("[report] AI insight generation failed, saving report without insights:", err);
  }

  // 9. Upsert report
  const { data: upsertedReport } = await supabaseAdmin
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
  force = false
): Promise<any> {
  const monthStart = startOfMonth(month);

  const monthStr = toDateStr(monthStart);

  // 1. Check for cached report
  const { data: existingReport } = await supabaseAdmin
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
  const { data: members } = await supabaseAdmin
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

    const { data: transactions } = await supabaseAdmin
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

  const { data: prevReport } = await supabaseAdmin
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

  // 8. Generate AI insights (non-fatal — save report even if AI fails)
  let aiInsights: string | null = null;
  try {
    aiInsights = await generateInsights(reportData, "household");
  } catch (err) {
    console.error("[report] AI insight generation failed, saving report without insights:", err);
  }

  // 9. Upsert report
  const { data: upsertedReport } = await supabaseAdmin
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
