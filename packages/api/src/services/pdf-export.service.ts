import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../lib/supabase";
import {
  generateUserReport,
  generateHouseholdReport,
} from "../services/report.service";
import { buildReportPdf } from "../services/pdf-report.service";
import type { ReportData } from "../ai/report-insights";

// ---------------------------------------------------------------------------
// Options for PDF export generators
// ---------------------------------------------------------------------------
export interface PdfExportOptions {
  forceRegenerate?: boolean;
}

// ---------------------------------------------------------------------------
// Return type for both generators
// ---------------------------------------------------------------------------
interface PdfExportResult {
  pdfBuffer: Buffer;
  reportData: ReportData;
  aiInsights: string | null;
}

// ---------------------------------------------------------------------------
// Helper: format currency (same as reports.ts)
// ---------------------------------------------------------------------------
function formatCurrencySimple(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// ---------------------------------------------------------------------------
// Helper: build savings recommendations from spending data
// ---------------------------------------------------------------------------
export function buildSavingsRecommendations(
  reportData: ReportData,
  subscriptions: Array<{
    name: string;
    amount: number;
    category: string | null;
    recurrence_interval: string;
  }>
): Array<{
  category: string;
  amount: number;
  percentage: number;
  suggestion: string;
}> {
  const recommendations: Array<{
    category: string;
    amount: number;
    percentage: number;
    suggestion: string;
  }> = [];

  if (reportData.total_expenses === 0) return recommendations;

  // Fixed-cost categories that aren't easily reducible
  const fixedCostKeywords = [
    "housing", "rent", "mortgage", "loan", "debt", "insurance",
  ];
  const isFixedCost = (category: string) =>
    fixedCostKeywords.some((kw) => category.toLowerCase().includes(kw));

  // Categorize spending and identify high-spend areas
  const sortedCategories = [...reportData.by_category].sort(
    (a, b) => b.amount - a.amount
  );

  // Flag categories that take up more than 20% of expenses
  for (const cat of sortedCategories) {
    // Skip fixed costs — not easily in the user's control
    if (isFixedCost(cat.category)) continue;
    if (cat.percentage >= 20) {
      recommendations.push({
        category: cat.category,
        amount: cat.amount,
        percentage: cat.percentage,
        suggestion: `This is your largest spending category. Consider setting a budget goal to reduce it by 10-15% next month.`,
      });
    } else if (cat.percentage >= 10) {
      recommendations.push({
        category: cat.category,
        amount: cat.amount,
        percentage: cat.percentage,
        suggestion: `This category is a significant portion of expenses. Review individual transactions for potential cuts.`,
      });
    }
  }

  // Check subscription burden
  const totalSubs = subscriptions.reduce((sum, s) => sum + s.amount, 0);
  if (totalSubs > 0 && reportData.total_expenses > 0) {
    const subPct = (totalSubs / reportData.total_expenses) * 100;
    if (subPct >= 15) {
      recommendations.push({
        category: "Subscriptions",
        amount: totalSubs,
        percentage: Math.round(subPct * 10) / 10,
        suggestion: `Subscriptions make up ${subPct.toFixed(0)}% of your expenses. Review each subscription to identify any you no longer use.`,
      });
    }
  }

  // Check savings rate health
  if (reportData.savings_rate < 20 && reportData.total_income > 0) {
    const targetSavings = reportData.total_income * 0.2;
    const currentSavings = reportData.total_income - reportData.total_expenses;
    const gap = targetSavings - currentSavings;
    if (gap > 0) {
      recommendations.push({
        category: "Overall Savings",
        amount: gap,
        percentage: reportData.savings_rate,
        suggestion: `Your savings rate is ${reportData.savings_rate.toFixed(1)}%. Aim for 20% by finding ${formatCurrencySimple(gap)} in monthly savings.`,
      });
    }
  }

  return recommendations.slice(0, 5); // Limit to top 5 recommendations
}

// ---------------------------------------------------------------------------
// Helper: build goal progress from goals and report data
// ---------------------------------------------------------------------------
export function buildGoalProgress(
  goals: any[],
  reportData: ReportData
): Array<{
  name: string;
  goal_type: string;
  current: number;
  target: number;
  category_name: string | null;
  target_date: string | null;
}> {
  return goals.map((goal: any) => {
    let current = 0;
    if (goal.goal_type === "budget") {
      const catName = goal.categories?.name?.toLowerCase();
      if (catName && reportData.by_category) {
        const match = reportData.by_category.find(
          (c) => c.category?.toLowerCase() === catName
        );
        current = match?.amount ?? 0;
      }
    } else if (goal.goal_type === "savings_amount") {
      current = reportData.total_income - reportData.total_expenses;
    } else if (goal.goal_type === "target_savings") {
      current = goal.current_amount ?? 0;
    }
    return {
      name: goal.name,
      goal_type: goal.goal_type,
      current,
      target: goal.target_amount,
      category_name: goal.categories?.name ?? null,
      target_date: goal.target_date ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// generatePersonalPdfForUser
// ---------------------------------------------------------------------------
export async function generatePersonalPdfForUser(
  userId: string,
  month: string,
  opts?: PdfExportOptions,
  client?: SupabaseClient
): Promise<PdfExportResult | null> {
  const db = client ?? supabaseAdmin;

  // Try cached report
  let { data: report } = await db
    .from("reports")
    .select("*")
    .eq("entity_type", "user")
    .eq("entity_id", userId)
    .eq("report_month", month)
    .maybeSingle();

  // Regenerate if missing, stale, or forced
  if (!report || report.has_new_data === true || opts?.forceRegenerate) {
    report = await generateUserReport(
      userId,
      new Date(month + "T00:00:00Z"),
      true,
      client
    );
  }

  if (!report?.report_data) {
    return null;
  }

  // Fetch supplementary data in parallel
  const monthDate = new Date(month + "T00:00:00Z");
  const monthEndDate = new Date(
    Date.UTC(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
  );
  const monthEndStr = monthEndDate.toISOString().slice(0, 10);

  const [
    { data: recurringBills },
    { data: incomeSources },
    { data: profile },
    { data: allRecurringExpenses },
    { data: goals },
    { data: debts },
  ] = await Promise.all([
    db
      .from("expenses")
      .select(
        "description, friendly_name, amount, recurrence_interval, next_due_date"
      )
      .eq("user_id", userId)
      .eq("frequency", "recurring")
      .gte("next_due_date", new Date().toISOString().slice(0, 10))
      .order("next_due_date", { ascending: true }),
    db
      .from("income_entries")
      .select("source_name, amount, frequency, attributed_to_name")
      .eq("user_id", userId)
      .neq("frequency", "one_time")
      .or(`end_date.is.null,end_date.gte.${month}`),
    db
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .single(),
    db
      .from("expenses")
      .select(
        "description, friendly_name, amount, recurrence_interval, category_id, categories(name)"
      )
      .eq("user_id", userId)
      .eq("frequency", "recurring")
      .or(`end_date.is.null,end_date.gte.${month}`),
    db
      .from("goals")
      .select("*, categories(name)")
      .eq("user_id", userId),
    db
      .from("debts")
      .select(
        "name, debt_type, current_balance, interest_rate, minimum_payment"
      )
      .eq("entity_type", "user")
      .eq("entity_id", userId)
      .gt("current_balance", 0),
  ]);

  // Split recurring expenses: true subscriptions vs other recurring expenses
  const allMapped = (allRecurringExpenses ?? []).map((e: any) => ({
    name: e.friendly_name || e.description,
    amount: e.amount ?? 0,
    category: e.categories?.name ?? null,
    recurrence_interval: e.recurrence_interval ?? "monthly",
  }));
  const subscriptionsPaid = allMapped.filter(
    (e) => e.category === "Subscriptions"
  );
  const recurringExpenses = allMapped.filter(
    (e) => e.category !== "Subscriptions"
  );

  // Build goal progress
  const reportData = report.report_data as ReportData;
  const goalProgress = buildGoalProgress(goals ?? [], reportData);

  // Build savings recommendations from category spending
  const savingsRecommendations = buildSavingsRecommendations(
    reportData,
    subscriptionsPaid
  );

  const monthLabel = new Date(month + "T00:00:00Z").toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric", timeZone: "UTC" }
  );

  const pdfBuffer = await buildReportPdf({
    title: `${profile?.display_name ?? "Personal"} — Personal Finance Report`,
    month: monthLabel,
    reportData,
    aiInsights: report.ai_insights ?? null,
    recurringBills: recurringBills ?? [],
    incomeSources: incomeSources ?? [],
    subscriptionsPaid,
    recurringExpenses,
    goalProgress,
    savingsRecommendations,
    allocation: (report.report_data as any).allocation ?? undefined,
    healthScore:
      (report.report_data as any).financial_health_score ?? undefined,
    debts: debts ?? [],
  });

  return {
    pdfBuffer,
    reportData,
    aiInsights: report.ai_insights ?? null,
  };
}

// ---------------------------------------------------------------------------
// generateHouseholdPdfForHousehold
// ---------------------------------------------------------------------------
export async function generateHouseholdPdfForHousehold(
  householdId: string,
  month: string,
  opts?: PdfExportOptions,
  client?: SupabaseClient
): Promise<PdfExportResult | null> {
  const db = client ?? supabaseAdmin;

  // Get household name
  const { data: household } = await db
    .from("households")
    .select("name")
    .eq("id", householdId)
    .single();

  // Try cached report
  let { data: report } = await db
    .from("reports")
    .select("*")
    .eq("entity_type", "household")
    .eq("entity_id", householdId)
    .eq("report_month", month)
    .maybeSingle();

  // Regenerate if missing, stale, or forced
  if (!report || report.has_new_data === true || opts?.forceRegenerate) {
    report = await generateHouseholdReport(
      householdId,
      new Date(month + "T00:00:00Z"),
      true,
      client
    );
  }

  if (!report?.report_data) {
    return null;
  }

  // Get all household member IDs
  const { data: members } = await db
    .from("profiles")
    .select("id, display_name")
    .eq("household_id", householdId);

  const memberIds = (members ?? []).map((m) => m.id);

  // Fetch recurring bills, income, subscriptions, goals, and debts for all members in parallel
  const [
    { data: recurringBills },
    { data: incomeSources },
    { data: allRecurringExpenses },
    { data: goals },
    { data: debts },
  ] = await Promise.all([
    db
      .from("expenses")
      .select(
        "description, friendly_name, amount, recurrence_interval, next_due_date"
      )
      .in("user_id", memberIds)
      .eq("frequency", "recurring")
      .gte("next_due_date", new Date().toISOString().slice(0, 10))
      .order("next_due_date", { ascending: true }),
    db
      .from("income_entries")
      .select("source_name, amount, frequency, attributed_to_name")
      .in("user_id", memberIds)
      .neq("frequency", "one_time")
      .or(`end_date.is.null,end_date.gte.${month}`),
    db
      .from("expenses")
      .select(
        "description, friendly_name, amount, recurrence_interval, category_id, categories(name)"
      )
      .in("user_id", memberIds)
      .eq("frequency", "recurring")
      .or(`end_date.is.null,end_date.gte.${month}`),
    db
      .from("goals")
      .select("*, categories(name)")
      .in("user_id", memberIds),
    db
      .from("debts")
      .select(
        "name, debt_type, current_balance, interest_rate, minimum_payment"
      )
      .eq("entity_type", "household")
      .eq("entity_id", householdId)
      .gt("current_balance", 0),
  ]);

  // Split recurring expenses: true subscriptions vs other recurring expenses
  const allMappedHH = (allRecurringExpenses ?? []).map((e: any) => ({
    name: e.friendly_name || e.description,
    amount: e.amount ?? 0,
    category: e.categories?.name ?? null,
    recurrence_interval: e.recurrence_interval ?? "monthly",
  }));
  const subscriptionsPaid = allMappedHH.filter(
    (e) => e.category === "Subscriptions"
  );
  const recurringExpenses = allMappedHH.filter(
    (e) => e.category !== "Subscriptions"
  );

  // Build goal progress
  const reportData = report.report_data as ReportData;
  const goalProgress = buildGoalProgress(goals ?? [], reportData);

  // Build savings recommendations
  const savingsRecommendations = buildSavingsRecommendations(
    reportData,
    subscriptionsPaid
  );

  // Compute member contributions from transactions
  const monthStart = month;
  const monthEnd = new Date(
    new Date(month + "T00:00:00Z").getFullYear(),
    new Date(month + "T00:00:00Z").getMonth() + 1,
    0
  )
    .toISOString()
    .slice(0, 10);

  const memberContributions = await Promise.all(
    (members ?? []).map(async (member) => {
      const { data: txns } = await db
        .from("transactions")
        .select("type, amount")
        .eq("user_id", member.id)
        .gte("date", monthStart)
        .lte("date", monthEnd);

      let income = 0;
      let expenses = 0;
      for (const t of txns ?? []) {
        if (t.type === "credit") income += Number(t.amount);
        else if (t.type === "debit") expenses += Number(t.amount);
      }

      return {
        display_name: member.display_name ?? "Unknown",
        income,
        expenses,
      };
    })
  );

  const monthLabel = new Date(month + "T00:00:00Z").toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric", timeZone: "UTC" }
  );

  const pdfBuffer = await buildReportPdf({
    title: `${household?.name ?? "Household"} — Household Finance Report`,
    month: monthLabel,
    reportData,
    aiInsights: report.ai_insights ?? null,
    recurringBills: recurringBills ?? [],
    incomeSources: incomeSources ?? [],
    memberContributions,
    subscriptionsPaid,
    recurringExpenses,
    goalProgress,
    savingsRecommendations,
    allocation: (report.report_data as any).allocation ?? undefined,
    healthScore:
      (report.report_data as any).financial_health_score ?? undefined,
    debts: debts ?? [],
  });

  return {
    pdfBuffer,
    reportData,
    aiInsights: report.ai_insights ?? null,
  };
}

// ---------------------------------------------------------------------------
// Helper: format a date range as a human-readable label
// ---------------------------------------------------------------------------
function formatRangeLabel(fromDate: string, toDate: string): string {
  const fmt = (d: string) =>
    new Date(d + "T00:00:00Z").toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  return `${fmt(fromDate)} – ${fmt(toDate)}`;
}

// ---------------------------------------------------------------------------
// Helper: aggregate transactions into ReportData shape for a date range
// ---------------------------------------------------------------------------
async function aggregateTransactionsForRange(
  db: SupabaseClient,
  userIds: string[],
  fromDate: string,
  toDate: string
): Promise<ReportData> {
  const { data: transactions } = await db
    .from("transactions")
    .select("type, amount, categories(name)")
    .in("user_id", userIds)
    .gte("date", fromDate)
    .lte("date", toDate);

  let totalIncome = 0;
  let totalExpenses = 0;
  const categoryMap = new Map<string, number>();

  for (const t of transactions ?? []) {
    const amount = Number(t.amount);
    if (t.type === "credit") {
      totalIncome += amount;
    } else if (t.type === "debit") {
      totalExpenses += amount;
      const catName = (t as any).categories?.name ?? "Uncategorized";
      categoryMap.set(catName, (categoryMap.get(catName) ?? 0) + amount);
    }
  }

  const byCategory = Array.from(categoryMap.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const savingsRate =
    totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;

  return {
    total_income: totalIncome,
    total_expenses: totalExpenses,
    savings_rate: Math.round(savingsRate * 10) / 10,
    expense_to_income_ratio:
      totalIncome > 0
        ? Math.round((totalExpenses / totalIncome) * 1000) / 10
        : 0,
    by_category: byCategory,
    top_categories: byCategory.slice(0, 5).map((c) => c.category),
    month_over_month: null,
  };
}

// ---------------------------------------------------------------------------
// generatePersonalPdfForRange — multi-month personal PDF
// ---------------------------------------------------------------------------
export async function generatePersonalPdfForRange(
  userId: string,
  fromDate: string,
  toDate: string,
  client?: SupabaseClient
): Promise<PdfExportResult | null> {
  const db = client ?? supabaseAdmin;

  // Aggregate transactions for the date range
  const reportData = await aggregateTransactionsForRange(
    db,
    [userId],
    fromDate,
    toDate
  );

  if (reportData.total_income === 0 && reportData.total_expenses === 0) {
    return null;
  }

  // Find most recent AI insights from any report for this user
  const { data: latestReport } = await db
    .from("reports")
    .select("ai_insights")
    .eq("entity_type", "user")
    .eq("entity_id", userId)
    .not("ai_insights", "is", null)
    .order("report_month", { ascending: false })
    .limit(1)
    .maybeSingle();

  const aiInsights = latestReport?.ai_insights ?? null;

  // Fetch supplementary data in parallel
  const [
    { data: recurringBills },
    { data: incomeSources },
    { data: profile },
    { data: allRecurringExpenses },
    { data: goals },
    { data: debts },
  ] = await Promise.all([
    db
      .from("expenses")
      .select(
        "description, friendly_name, amount, recurrence_interval, next_due_date"
      )
      .eq("user_id", userId)
      .eq("frequency", "recurring")
      .gte("next_due_date", new Date().toISOString().slice(0, 10))
      .order("next_due_date", { ascending: true }),
    db
      .from("income_entries")
      .select("source_name, amount, frequency, attributed_to_name")
      .eq("user_id", userId)
      .neq("frequency", "one_time")
      .or(`end_date.is.null,end_date.gte.${fromDate}`),
    db
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .single(),
    db
      .from("expenses")
      .select(
        "description, friendly_name, amount, recurrence_interval, category_id, categories(name)"
      )
      .eq("user_id", userId)
      .eq("frequency", "recurring")
      .or(`end_date.is.null,end_date.gte.${fromDate}`),
    db
      .from("goals")
      .select("*, categories(name)")
      .eq("user_id", userId),
    db
      .from("debts")
      .select(
        "name, debt_type, current_balance, interest_rate, minimum_payment"
      )
      .eq("entity_type", "user")
      .eq("entity_id", userId)
      .gt("current_balance", 0),
  ]);

  // Split recurring expenses
  const allMapped = (allRecurringExpenses ?? []).map((e: any) => ({
    name: e.friendly_name || e.description,
    amount: e.amount ?? 0,
    category: e.categories?.name ?? null,
    recurrence_interval: e.recurrence_interval ?? "monthly",
  }));
  const subscriptionsPaid = allMapped.filter(
    (e) => e.category === "Subscriptions"
  );
  const recurringExpenses = allMapped.filter(
    (e) => e.category !== "Subscriptions"
  );

  const goalProgress = buildGoalProgress(goals ?? [], reportData);
  const savingsRecommendations = buildSavingsRecommendations(
    reportData,
    subscriptionsPaid
  );

  const pdfBuffer = await buildReportPdf({
    title: `${profile?.display_name ?? "Personal"} — Personal Finance Report`,
    month: formatRangeLabel(fromDate, toDate),
    reportData,
    aiInsights,
    recurringBills: recurringBills ?? [],
    incomeSources: incomeSources ?? [],
    subscriptionsPaid,
    recurringExpenses,
    goalProgress,
    savingsRecommendations,
    debts: debts ?? [],
  });

  return { pdfBuffer, reportData, aiInsights };
}

// ---------------------------------------------------------------------------
// generateHouseholdPdfForRange — multi-month household PDF
// ---------------------------------------------------------------------------
export async function generateHouseholdPdfForRange(
  householdId: string,
  fromDate: string,
  toDate: string,
  client?: SupabaseClient
): Promise<PdfExportResult | null> {
  const db = client ?? supabaseAdmin;

  // Get household name
  const { data: household } = await db
    .from("households")
    .select("name")
    .eq("id", householdId)
    .single();

  // Get all household member IDs
  const { data: members } = await db
    .from("profiles")
    .select("id, display_name")
    .eq("household_id", householdId);

  const memberIds = (members ?? []).map((m) => m.id);

  if (memberIds.length === 0) return null;

  // Aggregate transactions for the date range
  const reportData = await aggregateTransactionsForRange(
    db,
    memberIds,
    fromDate,
    toDate
  );

  if (reportData.total_income === 0 && reportData.total_expenses === 0) {
    return null;
  }

  // Find most recent AI insights from any household report
  const { data: latestReport } = await db
    .from("reports")
    .select("ai_insights")
    .eq("entity_type", "household")
    .eq("entity_id", householdId)
    .not("ai_insights", "is", null)
    .order("report_month", { ascending: false })
    .limit(1)
    .maybeSingle();

  const aiInsights = latestReport?.ai_insights ?? null;

  // Fetch supplementary data in parallel
  const [
    { data: recurringBills },
    { data: incomeSources },
    { data: allRecurringExpenses },
    { data: goals },
    { data: debts },
  ] = await Promise.all([
    db
      .from("expenses")
      .select(
        "description, friendly_name, amount, recurrence_interval, next_due_date"
      )
      .in("user_id", memberIds)
      .eq("frequency", "recurring")
      .gte("next_due_date", new Date().toISOString().slice(0, 10))
      .order("next_due_date", { ascending: true }),
    db
      .from("income_entries")
      .select("source_name, amount, frequency, attributed_to_name")
      .in("user_id", memberIds)
      .neq("frequency", "one_time")
      .or(`end_date.is.null,end_date.gte.${fromDate}`),
    db
      .from("expenses")
      .select(
        "description, friendly_name, amount, recurrence_interval, category_id, categories(name)"
      )
      .in("user_id", memberIds)
      .eq("frequency", "recurring")
      .or(`end_date.is.null,end_date.gte.${fromDate}`),
    db
      .from("goals")
      .select("*, categories(name)")
      .in("user_id", memberIds),
    db
      .from("debts")
      .select(
        "name, debt_type, current_balance, interest_rate, minimum_payment"
      )
      .eq("entity_type", "household")
      .eq("entity_id", householdId)
      .gt("current_balance", 0),
  ]);

  // Split recurring expenses
  const allMappedHH = (allRecurringExpenses ?? []).map((e: any) => ({
    name: e.friendly_name || e.description,
    amount: e.amount ?? 0,
    category: e.categories?.name ?? null,
    recurrence_interval: e.recurrence_interval ?? "monthly",
  }));
  const subscriptionsPaid = allMappedHH.filter(
    (e) => e.category === "Subscriptions"
  );
  const recurringExpenses = allMappedHH.filter(
    (e) => e.category !== "Subscriptions"
  );

  const goalProgress = buildGoalProgress(goals ?? [], reportData);
  const savingsRecommendations = buildSavingsRecommendations(
    reportData,
    subscriptionsPaid
  );

  // Compute member contributions for the date range
  const memberContributions = await Promise.all(
    (members ?? []).map(async (member) => {
      const { data: txns } = await db
        .from("transactions")
        .select("type, amount")
        .eq("user_id", member.id)
        .gte("date", fromDate)
        .lte("date", toDate);

      let income = 0;
      let expenses = 0;
      for (const t of txns ?? []) {
        if (t.type === "credit") income += Number(t.amount);
        else if (t.type === "debit") expenses += Number(t.amount);
      }

      return {
        display_name: member.display_name ?? "Unknown",
        income,
        expenses,
      };
    })
  );

  const pdfBuffer = await buildReportPdf({
    title: `${household?.name ?? "Household"} — Household Finance Report`,
    month: formatRangeLabel(fromDate, toDate),
    reportData,
    aiInsights,
    recurringBills: recurringBills ?? [],
    incomeSources: incomeSources ?? [],
    memberContributions,
    subscriptionsPaid,
    recurringExpenses,
    goalProgress,
    savingsRecommendations,
    debts: debts ?? [],
  });

  return { pdfBuffer, reportData, aiInsights };
}
