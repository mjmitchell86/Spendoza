import { Router, type Request, type Response } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import {
  generateUserReport,
  generateHouseholdReport,
  generateAllReports,
  getReport,
} from "../services/report.service";
import { toServiceContext } from "../services/context";
import {
  generatePersonalPdfForUser,
  generateHouseholdPdfForHousehold,
  generatePersonalPdfForRange,
  generateHouseholdPdfForRange,
} from "../services/pdf-export.service";

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
  const authReq = req as AuthenticatedRequest;
  const month = parseMonth(req.query.month as string | undefined);
  const ctx = toServiceContext(authReq);

  const { data: report } = await getReport(ctx, "user", authReq.user.id, month);

  if (!report) {
    return res.status(404).json({ error: "Report not found for this month" });
  }

  return res.status(200).json(report);
});

// ---------------------------------------------------------------------------
// GET /household — get latest household report
// ---------------------------------------------------------------------------
router.get("/household", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const month = parseMonth(req.query.month as string | undefined);
  const ctx = toServiceContext(authReq);

  // Look up user's household
  const { data: profile } = await authReq.supabase
    .from("profiles")
    .select("household_id")
    .eq("id", authReq.user.id)
    .single();

  if (!profile?.household_id) {
    return res
      .status(400)
      .json({ error: "You are not a member of a household" });
  }

  const { data: report } = await getReport(ctx, "household", profile.household_id, month);

  if (!report) {
    return res.status(404).json({ error: "Report not found for this month" });
  }

  return res.status(200).json(report);
});

// ---------------------------------------------------------------------------
// POST /generate — manual trigger (max 2 per 24h in production)
// ---------------------------------------------------------------------------
router.post("/generate", requireAuth, async (req: Request, res: Response) => {
  const { user, supabase: db } = req as AuthenticatedRequest;
  const now = new Date();
  const isProduction = process.env.VERCEL_ENV === "production";

  // Rate-limit: 2 requests per 24-hour rolling window (production only)
  if (isProduction) {
    const twentyFourHoursAgo = new Date(
      now.getTime() - 24 * 60 * 60 * 1000
    ).toISOString();

    const { count } = await db
      .from("report_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", twentyFourHoursAgo);

    if ((count ?? 0) >= 2) {
      return res.status(429).json({
        error: "Report generation limit reached (2 per 24 hours)",
      });
    }
  }

  // Find the latest month with transactions; skip current month if empty
  const { data: latestTxn } = await db
    .from("transactions")
    .select("date")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(1);

  const reportDate = latestTxn && latestTxn.length > 0
    ? new Date(latestTxn[0].date + "T00:00:00Z")
    : now;

  // Generate the personal report for the month with data (force=true to bypass cache)
  const report = await generateUserReport(user.id, reportDate, true, db);

  // Also generate household report if user belongs to one
  const { data: profile } = await db
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();

  if (profile?.household_id) {
    try {
      await generateHouseholdReport(profile.household_id, reportDate, true, db);
    } catch (err) {
      console.error(`Failed to generate household report:`, err);
    }
  }

  // Record the request for rate-limiting (system table — use admin client)
  await supabaseAdmin.from("report_requests").insert({
    user_id: user.id,
    report_month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  });

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

// ---------------------------------------------------------------------------
// GET /export/personal — download personal report as PDF
// ---------------------------------------------------------------------------
router.get(
  "/export/personal",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { user, supabase: db } = req as AuthenticatedRequest;
      const fromDate = req.query.from_date as string | undefined;
      const toDate = req.query.to_date as string | undefined;

      let result;
      let filename: string;

      if (fromDate && toDate) {
        result = await generatePersonalPdfForRange(user.id, fromDate, toDate, db);
        filename = `spendoza-report-${fromDate.slice(0, 7)}-to-${toDate.slice(0, 7)}.pdf`;
      } else {
        const month = parseMonth(req.query.month as string | undefined);
        result = await generatePersonalPdfForUser(user.id, month, undefined, db);
        filename = `spendoza-report-${month.slice(0, 7)}.pdf`;
      }

      if (!result) {
        return res
          .status(404)
          .json({ error: "No report data available for this period" });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      res.setHeader("Content-Length", result.pdfBuffer.length);

      return res.send(result.pdfBuffer);
    } catch (err) {
      console.error("[export/personal] Error generating PDF:", err);
      return res
        .status(500)
        .json({ error: "Failed to generate PDF report" });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /export/household — download household report as PDF
// ---------------------------------------------------------------------------
router.get(
  "/export/household",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { user, supabase: db } = req as AuthenticatedRequest;
      const fromDate = req.query.from_date as string | undefined;
      const toDate = req.query.to_date as string | undefined;

      const { data: userProfile } = await db
        .from("profiles")
        .select("household_id")
        .eq("id", user.id)
        .single();

      if (!userProfile?.household_id) {
        return res
          .status(400)
          .json({ error: "You are not a member of a household" });
      }

      let result;
      let filename: string;

      if (fromDate && toDate) {
        result = await generateHouseholdPdfForRange(
          userProfile.household_id,
          fromDate,
          toDate,
          db
        );
        filename = `spendoza-household-report-${fromDate.slice(0, 7)}-to-${toDate.slice(0, 7)}.pdf`;
      } else {
        const month = parseMonth(req.query.month as string | undefined);
        result = await generateHouseholdPdfForHousehold(
          userProfile.household_id,
          month,
          undefined,
          db
        );
        filename = `spendoza-household-report-${month.slice(0, 7)}.pdf`;
      }

      if (!result) {
        return res
          .status(404)
          .json({ error: "No report data available for this period" });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      res.setHeader("Content-Length", result.pdfBuffer.length);

      return res.send(result.pdfBuffer);
    } catch (err) {
      console.error("[export/household] Error generating PDF:", err);
      return res
        .status(500)
        .json({ error: "Failed to generate PDF report" });
    }
  }
);

export default router;
