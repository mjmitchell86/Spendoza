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
function toDashboardResponse(report: any) {
  const rd = report.report_data as any;

  return {
    summary: {
      total_income: rd.total_income,
      total_expenses: rd.total_expenses,
      savings_rate: rd.savings_rate,
      net: rd.total_income - rd.total_expenses,
    },
    by_category: rd.by_category ?? [],
    trends: rd.month_over_month ?? { income_change: 0, expense_change: 0 },
    insights: report.ai_insights ?? null,
  };
}

// ---------------------------------------------------------------------------
// GET /personal — personal dashboard data
// ---------------------------------------------------------------------------
router.get("/personal", async (req: Request, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const month = (req.query.month as string) ?? currentMonthStr();

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
      return res.status(200).json(toDashboardResponse(report));
    }
  }

  // No report or report has no data — compute from transactions
  // If the requested month has no transactions, try the latest month with data
  let dashboard = await computeFromTransactions(user.id, month);

  if (dashboard.summary.total_income === 0 && dashboard.summary.total_expenses === 0) {
    const latestMonth = await findLatestTransactionMonth(user.id);
    if (latestMonth && latestMonth !== month) {
      dashboard = await computeFromTransactions(user.id, latestMonth);
    }
  }

  // Merge AI insights from the report if we have them
  if (report?.ai_insights && !dashboard.insights) {
    dashboard.insights = report.ai_insights;
  }

  return res.status(200).json(dashboard);
});

// ---------------------------------------------------------------------------
// GET /household — household dashboard data
// ---------------------------------------------------------------------------
router.get("/household", async (req: Request, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const month = (req.query.month as string) ?? currentMonthStr();

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

  const { data: report } = await supabaseAdmin
    .from("reports")
    .select("*")
    .eq("entity_type", "household")
    .eq("entity_id", profile.household_id)
    .eq("report_month", month)
    .maybeSingle();

  if (!report) {
    return res.status(404).json({ error: "No report data available" });
  }

  return res.status(200).json(toDashboardResponse(report));
});

export default router;
