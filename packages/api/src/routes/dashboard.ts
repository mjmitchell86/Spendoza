import { Router, type Request, type Response } from "express";
import { supabaseAdmin } from "../lib/supabase";
import type { AuthenticatedRequest } from "../middleware/auth";

const router = Router();

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

  if (!report) {
    return res.status(404).json({ error: "No report data available" });
  }

  return res.status(200).json(toDashboardResponse(report));
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
