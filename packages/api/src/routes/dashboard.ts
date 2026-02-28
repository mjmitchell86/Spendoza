import { Router, type Request, type Response } from "express";
import { supabaseAdmin } from "../lib/supabase";
import type { AuthenticatedRequest } from "../middleware/auth";

const router = Router();

// ---------------------------------------------------------------------------
// Helper: derive date range for a month string (YYYY-MM-01)
// ---------------------------------------------------------------------------
function monthRange(month: string) {
  const startDate = month.slice(0, 7) + "-01";
  const endYear = parseInt(month.slice(0, 4));
  const endMonth = parseInt(month.slice(5, 7));
  const nextMonth = endMonth === 12
    ? `${endYear + 1}-01-01`
    : `${endYear}-${String(endMonth + 1).padStart(2, "0")}-01`;
  return { startDate, nextMonth };
}

// ---------------------------------------------------------------------------
// Helper: find the most recent month that has transactions for a user
// ---------------------------------------------------------------------------
async function findLatestTransactionMonth(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("transactions")
    .select("date")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return null;
  // Return first day of that month
  const d = data[0].date as string;
  return d.slice(0, 7) + "-01";
}

// ---------------------------------------------------------------------------
// Helper: compute dashboard data from transactions when no report exists
// ---------------------------------------------------------------------------
async function computeFromTransactions(userId: string, month: string) {
  const { startDate, nextMonth } = monthRange(month);

  const { data: transactions } = await supabaseAdmin
    .from("transactions")
    .select("amount, type, ai_category, date")
    .eq("user_id", userId)
    .gte("date", startDate)
    .lt("date", nextMonth);

  const txns = transactions ?? [];

  const totalCredits = txns
    .filter((t) => t.type === "credit")
    .reduce((sum, t) => sum + (t.amount ?? 0), 0);

  const totalDebits = txns
    .filter((t) => t.type === "debit")
    .reduce((sum, t) => sum + (t.amount ?? 0), 0);

  // Group debits by category
  const categoryMap = new Map<string, number>();
  for (const t of txns.filter((t) => t.type === "debit")) {
    const cat = t.ai_category ?? "Uncategorized";
    categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + (t.amount ?? 0));
  }

  const byCategory = Array.from(categoryMap.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: totalDebits > 0 ? (amount / totalDebits) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    summary: {
      total_income: totalCredits,
      total_expenses: totalDebits,
      savings_rate: totalCredits > 0
        ? ((totalCredits - totalDebits) / totalCredits) * 100
        : 0,
      net: totalCredits - totalDebits,
    },
    by_category: byCategory,
    trends: { income_change: 0, expense_change: 0 },
    insights: null,
  };
}

// ---------------------------------------------------------------------------
// Helper: get current month string (YYYY-MM-01)
// ---------------------------------------------------------------------------
function currentMonthStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

// ---------------------------------------------------------------------------
// Helper: transform report into dashboard shape
// ---------------------------------------------------------------------------
function normalizeByCategoryArray(raw: unknown): Array<{ category: string; amount: number; percentage: number }> {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    // Handle legacy format: { "Housing": 1200, "Food": 600 }
    const entries = Object.entries(raw as Record<string, number>);
    const total = entries.reduce((sum, [, amt]) => sum + amt, 0);
    return entries
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: total > 0 ? (amount / total) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }
  return [];
}

function toDashboardResponse(report: any) {
  const rd = report.report_data as any;

  return {
    summary: {
      total_income: rd.total_income,
      total_expenses: rd.total_expenses,
      savings_rate: rd.savings_rate,
      net: rd.total_income - rd.total_expenses,
    },
    by_category: normalizeByCategoryArray(rd.by_category),
    trends: rd.month_over_month ?? { income_change: 0, expense_change: 0 },
    insights: report.ai_insights ?? null,
  };
}

// ---------------------------------------------------------------------------
// GET /personal — personal dashboard data
// ---------------------------------------------------------------------------
router.get("/personal", async (req: Request, res: Response) => {
  res.set("Cache-Control", "no-store");
  const { user } = req as AuthenticatedRequest;
  const requestedMonth = (req.query.month as string) ?? currentMonthStr();

  // Check if the requested month has bank statement transactions
  const { startDate: reqStart, nextMonth: reqNext } = monthRange(requestedMonth);
  const { count: txnCount } = await supabaseAdmin
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("date", reqStart)
    .lt("date", reqNext);

  const hasTransactions = (txnCount ?? 0) > 0;
  const month = requestedMonth;

  // Always tell the frontend which month has the latest transactions
  const latestTransactionMonth = hasTransactions
    ? null
    : await findLatestTransactionMonth(user.id);

  const { data: report } = await supabaseAdmin
    .from("reports")
    .select("*")
    .eq("entity_type", "user")
    .eq("entity_id", user.id)
    .eq("report_month", month)
    .maybeSingle();

  // Use report if it has meaningful data
  if (report) {
    const rd = report.report_data as any;
    if (rd.total_income > 0 || rd.total_expenses > 0) {
      return res.status(200).json({
        ...toDashboardResponse(report),
        has_transactions: hasTransactions,
        latest_transaction_month: latestTransactionMonth,
        month,
      });
    }
  }

  // No report or report has no data — compute from transactions
  let dashboard = await computeFromTransactions(user.id, month) as any;

  // Merge AI insights — try displayed month's report first, then find latest
  if (report?.ai_insights && !dashboard.insights) {
    dashboard.insights = report.ai_insights;
    dashboard.insights_month = month;
  }

  if (!dashboard.insights) {
    const { data: latestReport } = await supabaseAdmin
      .from("reports")
      .select("ai_insights, report_month")
      .eq("entity_type", "user")
      .eq("entity_id", user.id)
      .not("ai_insights", "is", null)
      .order("report_month", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestReport?.ai_insights) {
      dashboard.insights = latestReport.ai_insights;
      dashboard.insights_month = latestReport.report_month;
    }
  }

  dashboard.has_transactions = hasTransactions;
  dashboard.latest_transaction_month = latestTransactionMonth;
  dashboard.month = month;

  return res.status(200).json(dashboard);
});

// ---------------------------------------------------------------------------
// Helper: compute household dashboard from members' transactions
// ---------------------------------------------------------------------------
async function computeHouseholdFromTransactions(householdId: string, month: string) {
  const { startDate, nextMonth } = monthRange(month);

  // Get members with sharing preferences
  const { data: members } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, income_sharing_mode, expense_sharing_mode")
    .eq("household_id", householdId);

  let totalIncome = 0;
  let totalExpenses = 0;
  const categoryMap = new Map<string, number>();
  const memberContributions: Array<{
    user_id: string;
    display_name: string;
    income: number;
    expenses: number;
  }> = [];

  for (const member of members ?? []) {
    const includeIncome = member.income_sharing_mode === "all";
    const includeExpenses = member.expense_sharing_mode === "all";
    if (!includeIncome && !includeExpenses) continue;

    const { data: transactions } = await supabaseAdmin
      .from("transactions")
      .select("amount, type, ai_category")
      .eq("user_id", member.id)
      .gte("date", startDate)
      .lt("date", nextMonth);

    let memberIncome = 0;
    let memberExpenses = 0;

    for (const t of transactions ?? []) {
      if (t.type === "credit" && includeIncome) {
        memberIncome += t.amount ?? 0;
      }
      if (t.type === "debit" && includeExpenses) {
        memberExpenses += t.amount ?? 0;
        const cat = t.ai_category ?? "Uncategorized";
        categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + (t.amount ?? 0));
      }
    }

    totalIncome += memberIncome;
    totalExpenses += memberExpenses;
    memberContributions.push({
      user_id: member.id,
      display_name: member.display_name ?? "Member",
      income: memberIncome,
      expenses: memberExpenses,
    });
  }

  const byCategory = Array.from(categoryMap.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    summary: {
      total_income: totalIncome,
      total_expenses: totalExpenses,
      savings_rate: totalIncome > 0
        ? ((totalIncome - totalExpenses) / totalIncome) * 100
        : 0,
      net: totalIncome - totalExpenses,
    },
    by_category: byCategory,
    trends: { income_change: 0, expense_change: 0 },
    insights: null as string | null,
    member_contributions: memberContributions,
  };
}

// ---------------------------------------------------------------------------
// Helper: find latest month with transactions for any household member
// ---------------------------------------------------------------------------
async function findLatestHouseholdTransactionMonth(householdId: string): Promise<string | null> {
  const { data: members } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("household_id", householdId);

  const memberIds = (members ?? []).map((m: any) => m.id);
  if (memberIds.length === 0) return null;

  const { data } = await supabaseAdmin
    .from("transactions")
    .select("date")
    .in("user_id", memberIds)
    .order("date", { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return null;
  return (data[0].date as string).slice(0, 7) + "-01";
}

// ---------------------------------------------------------------------------
// GET /household — household dashboard data
// ---------------------------------------------------------------------------
router.get("/household", async (req: Request, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const requestedMonth = (req.query.month as string) ?? currentMonthStr();

  // Look up user's household
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();

  if (!profile?.household_id) {
    return res
      .status(400)
      .json({ error: "You are not a member of a household" });
  }

  const householdId = profile.household_id;

  // Check if the requested month has bank statement transactions
  const { data: hhMembers } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("household_id", householdId);
  const hhMemberIds = (hhMembers ?? []).map((m: any) => m.id);

  let hasTransactions = false;
  if (hhMemberIds.length > 0) {
    const { startDate: reqStart, nextMonth: reqNext } = monthRange(requestedMonth);
    const { count: txnCount } = await supabaseAdmin
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .in("user_id", hhMemberIds)
      .gte("date", reqStart)
      .lt("date", reqNext);
    hasTransactions = (txnCount ?? 0) > 0;
  }

  const month = requestedMonth;

  // Always tell the frontend which month has the latest transactions
  const latestTransactionMonth = hasTransactions
    ? null
    : await findLatestHouseholdTransactionMonth(householdId);

  const { data: report } = await supabaseAdmin
    .from("reports")
    .select("*")
    .eq("entity_type", "household")
    .eq("entity_id", householdId)
    .eq("report_month", month)
    .maybeSingle();

  // Use report if it has meaningful data
  if (report) {
    const rd = report.report_data as any;
    if (rd.total_income > 0 || rd.total_expenses > 0) {
      return res.status(200).json({
        ...toDashboardResponse(report),
        member_contributions: rd.member_contributions ?? [],
        has_transactions: hasTransactions,
        latest_transaction_month: latestTransactionMonth,
        month,
      });
    }
  }

  // No report or report has no data — compute from transactions
  let dashboard = await computeHouseholdFromTransactions(householdId, month) as any;

  // Merge AI insights — try displayed month's report first, then find latest
  if (report?.ai_insights && !dashboard.insights) {
    dashboard.insights = report.ai_insights;
    dashboard.insights_month = month;
  }

  if (!dashboard.insights) {
    const { data: latestReport } = await supabaseAdmin
      .from("reports")
      .select("ai_insights, report_month")
      .eq("entity_type", "household")
      .eq("entity_id", householdId)
      .not("ai_insights", "is", null)
      .order("report_month", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestReport?.ai_insights) {
      dashboard.insights = latestReport.ai_insights;
      dashboard.insights_month = latestReport.report_month;
    }
  }

  dashboard.has_transactions = hasTransactions;
  dashboard.latest_transaction_month = latestTransactionMonth;
  dashboard.month = month;

  return res.status(200).json(dashboard);
});

export default router;
