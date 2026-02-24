import { Router, type Request, type Response } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import {
  generateUserReport,
  generateHouseholdReport,
  generateAllReports,
} from "../services/report.service";

const router = Router();

// ---------------------------------------------------------------------------
// Helper: parse month query param or default to current month
// ---------------------------------------------------------------------------
function parseMonth(monthParam?: string): string {
  if (monthParam) {
    // Expect YYYY-MM-DD with day=01, or just take first 10 chars
    return monthParam.slice(0, 10);
  }
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

// ---------------------------------------------------------------------------
// GET /personal — get latest personal report
// ---------------------------------------------------------------------------
router.get("/personal", requireAuth, async (req: Request, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const month = parseMonth(req.query.month as string | undefined);

  const { data: report } = await supabaseAdmin
    .from("reports")
    .select("*")
    .eq("entity_type", "user")
    .eq("entity_id", user.id)
    .eq("report_month", month)
    .maybeSingle();

  if (!report) {
    return res.status(404).json({ error: "Report not found for this month" });
  }

  return res.status(200).json(report);
});

// ---------------------------------------------------------------------------
// GET /household — get latest household report
// ---------------------------------------------------------------------------
router.get("/household", requireAuth, async (req: Request, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const month = parseMonth(req.query.month as string | undefined);

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
    return res.status(404).json({ error: "Report not found for this month" });
  }

  return res.status(200).json(report);
});

// ---------------------------------------------------------------------------
// POST /generate — manual trigger (max 2/month)
// ---------------------------------------------------------------------------
router.post("/generate", requireAuth, async (req: Request, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Check report_requests count for this month
  const { data: requestRecord } = await supabaseAdmin
    .from("report_requests")
    .select("request_count")
    .eq("user_id", user.id)
    .eq("report_month", currentMonth)
    .maybeSingle();

  const currentCount = requestRecord?.request_count ?? 0;

  if (currentCount >= 2) {
    return res.status(429).json({
      error: "Monthly report refresh limit reached (2/2)",
    });
  }

  // Find the latest month with transactions; skip current month if empty
  const { data: latestTxn } = await supabaseAdmin
    .from("transactions")
    .select("date")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(1);

  const reportDate = latestTxn && latestTxn.length > 0
    ? new Date(latestTxn[0].date + "T00:00:00Z")
    : now;

  // Generate the report for the month with data (force=true to bypass cache)
  const report = await generateUserReport(user.id, reportDate, true);

  // Increment the request count only after successful generation
  await supabaseAdmin.from("report_requests").upsert(
    {
      user_id: user.id,
      report_month: currentMonth,
      request_count: currentCount + 1,
    },
    { onConflict: "user_id,report_month" }
  );

  return res.status(200).json(report);
});

// ---------------------------------------------------------------------------
// POST /generate-all — cron endpoint (no requireAuth, uses CRON_SECRET)
// ---------------------------------------------------------------------------
router.post("/generate-all", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];
  if (token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Generate reports for the previous month
  const now = new Date();
  const previousMonth = new Date(
    Date.UTC(now.getFullYear(), now.getMonth() - 1, 1)
  );

  await generateAllReports(previousMonth);

  return res.status(200).json({
    message: "All reports generated successfully",
    month: previousMonth.toISOString().slice(0, 10),
  });
});

export default router;
