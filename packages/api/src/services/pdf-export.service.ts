import { supabaseAdmin } from "../lib/supabase";
import {
  generateUserReport,
  generateHouseholdReport,
} from "./report.service";
import { buildReportPdf } from "./pdf-report.service";
import type { ReportData } from "../ai/report-insights";

// ---------------------------------------------------------------------------
// Helper: format currency without cents
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
function buildSavingsRecommendations(
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

  // Categorize spending and identify high-spend areas
  const sortedCategories = [...reportData.by_category].sort(
    (a, b) => b.amount - a.amount
  );

  // Flag categories that take up more than 20% of expenses
  for (const cat of sortedCategories) {
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
function buildGoalProgress(
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
    } else if (goal.goal_type === "monthly_savings") {
      current = reportData.total_income - reportData.total_expenses;
    } else if (goal.goal_type === "total_savings") {
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
// Generate personal PDF for a user
// ---------------------------------------------------------------------------
export async function generatePersonalPdfForUser(
  userId: string,
  month: string // YYYY-MM-DD format
): Promise<{
  pdfBuffer: Buffer;
  reportData: ReportData;
  aiInsights: string | null;
} | null> {
  // Try cached report
  let { data: report } = await supabaseAdmin
    .from("reports")
    .select("*")
    .eq("entity_type", "user")
    .eq("entity_id", userId)
    .eq("report_month", month)
    .maybeSingle();

  // Regenerate if missing or stale
  if (!report || report.has_new_data === true) {
    report = await generateUserReport(
      userId,
      new Date(month + "T00:00:00Z"),
      true
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
  ] = await Promise.all([
    supabaseAdmin
      .from("expenses")
      .select(
        "description, friendly_name, amount, recurrence_interval, next_due_date"
      )
      .eq("user_id", userId)
      .eq("frequency", "recurring"),
    supabaseAdmin
      .from("income_entries")
      .select("source_name, amount, frequency, attributed_to_name")
      .eq("user_id", userId),
    supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .single(),
    supabaseAdmin
      .from("expenses")
      .select(
        "description, friendly_name, amount, recurrence_interval, category_id, categories(name)"
      )
      .eq("user_id", userId)
      .eq("frequency", "recurring")
      .or(`end_date.is.null,end_date.gte.${month}`),
    supabaseAdmin
      .from("goals")
      .select("*, categories(name)")
      .eq("user_id", userId),
  ]);

  // Build subscriptions paid this month from recurring expenses
  const subscriptionsPaid = (allRecurringExpenses ?? []).map((e: any) => ({
    name: e.friendly_name || e.description,
    amount: e.amount ?? 0,
    category: e.categories?.name ?? null,
    recurrence_interval: e.recurrence_interval ?? "monthly",
  }));

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

  const aiInsights = report.ai_insights ?? null;

  const pdfBuffer = await buildReportPdf({
    title: profile?.display_name ?? "Personal",
    month: monthLabel,
    reportData,
    aiInsights,
    recurringBills: recurringBills ?? [],
    incomeSources: incomeSources ?? [],
    subscriptionsPaid,
    goalProgress,
    savingsRecommendations,
  });

  return { pdfBuffer, reportData, aiInsights };
}

// ---------------------------------------------------------------------------
// Generate household PDF for a household
// ---------------------------------------------------------------------------
export async function generateHouseholdPdfForHousehold(
  householdId: string,
  month: string // YYYY-MM-DD format
): Promise<{
  pdfBuffer: Buffer;
  reportData: ReportData;
  aiInsights: string | null;
} | null> {
  // Get household name
  const { data: household } = await supabaseAdmin
    .from("households")
    .select("name")
    .eq("id", householdId)
    .single();

  // Try cached report
  let { data: report } = await supabaseAdmin
    .from("reports")
    .select("*")
    .eq("entity_type", "household")
    .eq("entity_id", householdId)
    .eq("report_month", month)
    .maybeSingle();

  // Regenerate if missing or stale
  if (!report || report.has_new_data === true) {
    report = await generateHouseholdReport(
      householdId,
      new Date(month + "T00:00:00Z"),
      true
    );
  }

  if (!report?.report_data) {
    return null;
  }

  // Get all household member IDs
  const { data: members } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name")
    .eq("household_id", householdId);

  const memberIds = (members ?? []).map((m) => m.id);

  // Fetch recurring bills, income, subscriptions, and goals for all members in parallel
  const [
    { data: recurringBills },
    { data: incomeSources },
    { data: allRecurringExpenses },
    { data: goals },
  ] = await Promise.all([
    supabaseAdmin
      .from("expenses")
      .select(
        "description, friendly_name, amount, recurrence_interval, next_due_date"
      )
      .in("user_id", memberIds)
      .eq("frequency", "recurring"),
    supabaseAdmin
      .from("income_entries")
      .select("source_name, amount, frequency, attributed_to_name")
      .in("user_id", memberIds),
    supabaseAdmin
      .from("expenses")
      .select(
        "description, friendly_name, amount, recurrence_interval, category_id, categories(name)"
      )
      .in("user_id", memberIds)
      .eq("frequency", "recurring")
      .or(`end_date.is.null,end_date.gte.${month}`),
    supabaseAdmin
      .from("goals")
      .select("*, categories(name)")
      .in("user_id", memberIds),
  ]);

  // Build subscriptions paid this month
  const subscriptionsPaid = (allRecurringExpenses ?? []).map((e: any) => ({
    name: e.friendly_name || e.description,
    amount: e.amount ?? 0,
    category: e.categories?.name ?? null,
    recurrence_interval: e.recurrence_interval ?? "monthly",
  }));

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
      const { data: txns } = await supabaseAdmin
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

  const aiInsights = report.ai_insights ?? null;

  const pdfBuffer = await buildReportPdf({
    title: household?.name ?? "Household",
    month: monthLabel,
    reportData,
    aiInsights,
    recurringBills: recurringBills ?? [],
    incomeSources: incomeSources ?? [],
    memberContributions,
    subscriptionsPaid,
    goalProgress,
    savingsRecommendations,
  });

  return { pdfBuffer, reportData, aiInsights };
}
