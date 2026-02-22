import { supabaseAdmin } from "../lib/supabase";
import { generateInsights, type ReportData } from "../ai/report-insights";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the first day of the given month (Date at 00:00 UTC). */
function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1));
}

/** Returns the last day of the given month (Date at 23:59:59.999 UTC). */
function endOfMonth(date: Date): Date {
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
  );
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
  month: Date
): Promise<any> {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const monthStr = toDateStr(monthStart);

  // 1. Check for cached report with no new data
  const { data: existingReport } = await supabaseAdmin
    .from("reports")
    .select("*")
    .eq("entity_type", "user")
    .eq("entity_id", userId)
    .eq("report_month", monthStr)
    .maybeSingle();

  if (existingReport && !existingReport.has_new_data) {
    return existingReport;
  }

  // 2. Query income entries for this month
  //    Income is active if effective_date <= month end AND (end_date IS NULL OR end_date >= month start)
  const { data: incomeEntries } = await supabaseAdmin
    .from("income_entries")
    .select("*")
    .eq("user_id", userId)
    .lte("effective_date", toDateStr(monthEnd))
    .or(`end_date.is.null,end_date.gte.${toDateStr(monthStart)}`);

  const totalIncome = (incomeEntries ?? []).reduce(
    (sum: number, e: any) => sum + (e.amount ?? 0),
    0
  );

  // 3. Query expenses for this month (with category join)
  const { data: expenses } = await supabaseAdmin
    .from("expenses")
    .select("*, categories(name)")
    .eq("user_id", userId);

  const totalExpenses = (expenses ?? []).reduce(
    (sum: number, e: any) => sum + (e.amount ?? 0),
    0
  );

  // 4. Compute by_category breakdown
  const categoryMap = new Map<string, number>();
  for (const exp of expenses ?? []) {
    const catName =
      exp.categories?.name ?? "Uncategorized";
    categoryMap.set(catName, (categoryMap.get(catName) ?? 0) + exp.amount);
  }

  const byCategory = Array.from(categoryMap.entries())
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

  // 8. Generate AI insights
  const aiInsights = await generateInsights(reportData, "user");

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
  month: Date
): Promise<any> {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const monthStr = toDateStr(monthStart);

  // 1. Check for cached report
  const { data: existingReport } = await supabaseAdmin
    .from("reports")
    .select("*")
    .eq("entity_type", "household")
    .eq("entity_id", householdId)
    .eq("report_month", monthStr)
    .maybeSingle();

  if (existingReport && !existingReport.has_new_data) {
    return existingReport;
  }

  // 2. Get all household members with sharing preferences
  const { data: members } = await supabaseAdmin
    .from("profiles")
    .select("id, income_sharing_mode, expense_sharing_mode")
    .eq("household_id", householdId);

  const memberIds = (members ?? []).map((m: any) => m.id);

  // 3. Aggregate income across sharing members
  let totalIncome = 0;
  let totalExpenses = 0;
  const categoryMap = new Map<string, number>();

  for (const member of members ?? []) {
    // Income: only include if sharing mode is "all"
    if (member.income_sharing_mode === "all") {
      const { data: incomeEntries } = await supabaseAdmin
        .from("income_entries")
        .select("amount")
        .eq("user_id", member.id)
        .lte("effective_date", toDateStr(monthEnd))
        .or(`end_date.is.null,end_date.gte.${toDateStr(monthStart)}`);

      totalIncome += (incomeEntries ?? []).reduce(
        (sum: number, e: any) => sum + (e.amount ?? 0),
        0
      );
    }

    // Expenses: only include if sharing mode is "all"
    if (member.expense_sharing_mode === "all") {
      const { data: expenses } = await supabaseAdmin
        .from("expenses")
        .select("*, categories(name)")
        .eq("user_id", member.id);

      for (const exp of expenses ?? []) {
        totalExpenses += exp.amount ?? 0;
        const catName = exp.categories?.name ?? "Uncategorized";
        categoryMap.set(catName, (categoryMap.get(catName) ?? 0) + exp.amount);
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

  // 8. Generate AI insights
  const aiInsights = await generateInsights(reportData, "household");

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
