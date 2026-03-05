import { Router, type Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/require-admin";
import { supabaseAdmin } from "../lib/supabase";
import {
  generateUserReport,
  generateHouseholdReport,
} from "../services/report.service";
import { detectRecurringBills } from "../services/bill-detection.service";
import { detectRecurringIncome } from "../services/income-detection.service";
import {
  generatePersonalPdfForRange,
  generatePersonalAnnualPdf,
  computeGoalAchievement,
} from "../services/pdf-export.service";
import { sendReportEmail } from "../services/email.service";
import {
  buildReportEmailHtml,
  buildAnnualReportEmailHtml,
} from "../services/email-template.service";

const router = Router();

// Log all requests entering the admin router
router.use((req, _res, next) => {
  console.error(`[admin-router] ENTER: ${req.method} ${req.originalUrl} content-type:${req.headers["content-type"]} content-length:${req.headers["content-length"]}`);
  next();
});

// Auth + admin middleware applied at the router level
router.use(requireAuth, requireAdmin);

// GET /api/admin/stats — aggregate dashboard metrics
router.get("/stats", async (req, res: Response) => {
  const { data: userStats, error: userErr } = await supabaseAdmin
    .from("admin_user_stats")
    .select("*")
    .single();

  if (userErr) {
    return res.status(500).json({ error: userErr.message });
  }

  const { data: activityStats, error: activityErr } = await supabaseAdmin
    .from("admin_activity_stats")
    .select("*")
    .single();

  if (activityErr) {
    return res.status(500).json({ error: activityErr.message });
  }

  return res.json({
    users: userStats,
    activity: activityStats,
  });
});

// GET /api/admin/stats/trends — monthly time-series
router.get("/stats/trends", async (req, res: Response) => {
  const months = Math.min(Math.max(Number(req.query.months) || 12, 1), 36);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const [userTrends, activityTrends, llmStats] = await Promise.all([
    supabaseAdmin
      .from("admin_user_trends")
      .select("*")
      .gte("month", cutoffStr)
      .order("month"),
    supabaseAdmin
      .from("admin_activity_trends")
      .select("*")
      .gte("month", cutoffStr)
      .order("month"),
    supabaseAdmin
      .from("admin_llm_stats")
      .select("*")
      .gte("month", cutoffStr)
      .order("month"),
  ]);

  if (userTrends.error || activityTrends.error || llmStats.error) {
    const err = userTrends.error || activityTrends.error || llmStats.error;
    return res.status(500).json({ error: err!.message });
  }

  return res.json({
    user_trends: userTrends.data,
    activity_trends: activityTrends.data,
    llm_stats: llmStats.data,
  });
});

// GET /api/admin/users — paginated user list
router.get("/users", async (req, res: Response) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
  const search = req.query.search as string | undefined;
  const tierFilter = req.query.tier as string | undefined;
  const adminFilter = req.query.is_admin as string | undefined;
  const disabledFilter = req.query.disabled as string | undefined;

  const offset = (page - 1) * limit;

  // Build query
  let query = supabaseAdmin
    .from("profiles")
    .select("id, display_name, subscription_tier, is_admin, disabled, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  let countQuery = supabaseAdmin
    .from("profiles")
    .select("*", { count: "exact", head: true });

  // Apply filters
  if (tierFilter) {
    query = query.eq("subscription_tier", tierFilter);
    countQuery = countQuery.eq("subscription_tier", tierFilter);
  }
  if (adminFilter !== undefined) {
    const isAdmin = adminFilter === "true";
    query = query.eq("is_admin", isAdmin);
    countQuery = countQuery.eq("is_admin", isAdmin);
  }
  if (disabledFilter !== undefined) {
    const isDisabled = disabledFilter === "true";
    query = query.eq("disabled", isDisabled);
    countQuery = countQuery.eq("disabled", isDisabled);
  }
  if (search) {
    query = query.ilike("display_name", `%${search}%`);
    countQuery = countQuery.ilike("display_name", `%${search}%`);
  }

  const [{ data: users, error }, { count }] = await Promise.all([query, countQuery]);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Fetch emails from auth.users for the returned user IDs
  const userIds = (users ?? []).map((u: any) => u.id);
  const emailMap = new Map<string, string>();

  for (const uid of userIds) {
    const { data: { user: authUser } } = await supabaseAdmin.auth.admin.getUserById(uid);
    if (authUser?.email) {
      emailMap.set(uid, authUser.email);
    }
  }

  const usersWithEmail = (users ?? []).map((u: any) => ({
    ...u,
    email: emailMap.get(u.id) ?? "",
    disabled: u.disabled ?? false,
  }));

  return res.json({
    users: usersWithEmail,
    total: count ?? 0,
    page,
    limit,
  });
});

// PATCH /api/admin/users/:id — update user (toggle admin, change tier, disable)
router.patch("/users/:id", async (req, res: Response) => {
  const { id } = req.params;
  const { is_admin, subscription_tier, disabled } = req.body;

  const updates: Record<string, any> = {};
  if (is_admin !== undefined) updates.is_admin = is_admin;
  if (subscription_tier !== undefined) updates.subscription_tier = subscription_tier;
  if (disabled !== undefined) updates.disabled = disabled;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No valid fields to update" });
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.json(data);
});

// DELETE /api/admin/users/:id — permanently delete user
router.delete("/users/:id", async (req, res: Response) => {
  const { id } = req.params;
  const { user } = req as AuthenticatedRequest;

  // Prevent self-deletion
  if (id === user.id) {
    return res.status(400).json({ error: "Cannot delete your own account" });
  }

  // Delete from auth (cascades to profiles via FK)
  const { error } = await supabaseAdmin.auth.admin.deleteUser(id);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.json({ deleted: true });
});

// POST /api/admin/users/:id/generate-report — regenerate report for any user
router.post("/users/:id/generate-report", async (req, res: Response) => {
  const { id } = req.params;

  // Verify user exists
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("id, household_id")
    .eq("id", id)
    .single();

  if (profileErr || !profile) {
    return res.status(404).json({ error: "User not found" });
  }

  // Find the latest month with transactions
  const { data: latestTxn } = await supabaseAdmin
    .from("transactions")
    .select("date")
    .eq("user_id", id)
    .order("date", { ascending: false })
    .limit(1);

  const reportDate =
    latestTxn && latestTxn.length > 0
      ? new Date(latestTxn[0].date + "T00:00:00Z")
      : new Date();

  const report = await generateUserReport(id, reportDate, true);

  // Also generate household report if user belongs to one
  if (profile.household_id) {
    try {
      await generateHouseholdReport(profile.household_id, reportDate, true);
    } catch (err) {
      console.error(`Failed to generate household report:`, err);
    }
  }

  return res.json(report);
});

// POST /api/admin/users/:id/detect-recurring — re-run recurring detection for any user
router.post("/users/:id/detect-recurring", async (req, res: Response) => {
  const { id } = req.params;

  // Verify user exists
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", id)
    .single();

  if (profileErr || !profile) {
    return res.status(404).json({ error: "User not found" });
  }

  await detectRecurringBills(id);
  await detectRecurringIncome(id);

  return res.json({ success: true });
});

// POST /api/admin/users/:id/send-quarterly-report — generate + email quarterly report
router.post("/users/:id/send-quarterly-report", async (req, res: Response) => {
  const { id } = req.params;
  console.error(`[admin] quarterly handler entered, user=${id}`);

  // Verify user exists
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name")
    .eq("id", id)
    .single();

  if (profileErr || !profile) {
    return res.status(404).json({ error: "User not found" });
  }

  // Get user email
  const { data: authUser } =
    await supabaseAdmin.auth.admin.getUserById(id);
  const userEmail = authUser?.user?.email;
  if (!userEmail) {
    return res.status(400).json({ error: "User has no email address" });
  }

  // Compute date range — use body params or default to last complete quarter
  let fromDate: string;
  let toDate: string;
  let rangeLabel: string;

  if (req.body?.from_date && req.body?.to_date) {
    fromDate = req.body.from_date;
    toDate = req.body.to_date;
    const fmt = (d: string) =>
      new Date(d + "T00:00:00Z").toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
    rangeLabel = `${fmt(fromDate)} – ${fmt(toDate)}`;
  } else {
    // Default to last complete quarter
    const now = new Date();
    const month = now.getUTCMonth();
    const year = now.getUTCFullYear();

    let qStart: Date;
    let qEnd: Date;

    if (month < 3) {
      qStart = new Date(Date.UTC(year - 1, 9, 1));
      qEnd = new Date(Date.UTC(year - 1, 11, 31));
    } else if (month < 6) {
      qStart = new Date(Date.UTC(year, 0, 1));
      qEnd = new Date(Date.UTC(year, 2, 31));
    } else if (month < 9) {
      qStart = new Date(Date.UTC(year, 3, 1));
      qEnd = new Date(Date.UTC(year, 5, 30));
    } else {
      qStart = new Date(Date.UTC(year, 6, 1));
      qEnd = new Date(Date.UTC(year, 8, 30));
    }

    fromDate = qStart.toISOString().slice(0, 10);
    toDate = qEnd.toISOString().slice(0, 10);
    const fmt = (d: string) =>
      new Date(d + "T00:00:00Z").toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
    rangeLabel = `${fmt(fromDate)} – ${fmt(toDate)}`;
  }

  try {
    // Generate PDF with fresh quarterly AI insights
    const result = await generatePersonalPdfForRange(
      id,
      fromDate,
      toDate,
      undefined,
      true
    );

    if (!result) {
      return res
        .status(404)
        .json({ error: "No transaction data for the specified period" });
    }

    // Parse AI insights into bullet points
    const aiInsights = result.aiInsights
      ? result.aiInsights
          .split("\n")
          .map((line) => line.replace(/^[-*]\s*/, "").trim())
          .filter(Boolean)
          .slice(0, 5)
      : [];

    const reportTitle = "Quarterly Report";
    const appUrl = process.env.APP_URL || "https://spendoza.io";
    const subject = `Your Spendoza ${reportTitle} \u2014 ${rangeLabel}`;

    const htmlBody = buildReportEmailHtml({
      userName: profile.display_name ?? "there",
      reportTitle,
      monthLabel: rangeLabel,
      totalIncome: result.reportData.total_income,
      totalExpenses: result.reportData.total_expenses,
      netSavings:
        result.reportData.total_income - result.reportData.total_expenses,
      savingsRate: result.reportData.savings_rate,
      aiInsights,
      appReportUrl: `${appUrl}/dashboard`,
      unsubscribeUrl: `${appUrl}/profile`,
    });

    const pdfFilename = `spendoza-quarterly-report-${fromDate}-to-${toDate}.pdf`;

    const sendResult = await sendReportEmail({
      to: userEmail,
      subject,
      htmlBody,
      pdfBuffer: result.pdfBuffer,
      pdfFilename,
    });

    if (!sendResult.success) {
      return res
        .status(500)
        .json({ error: `Email send failed: ${sendResult.error}` });
    }

    return res.json({
      success: true,
      email: userEmail,
      fromDate,
      toDate,
    });
  } catch (err) {
    console.error(`[admin] Failed to send quarterly report for ${id}:`, err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Internal error",
    });
  }
});

// POST /api/admin/users/:id/send-annual-report — generate + email annual report
router.post("/users/:id/send-annual-report", async (req, res: Response) => {
  const { id } = req.params;
  console.error(`[admin] annual handler entered, user=${id}`);

  // Verify user exists
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name")
    .eq("id", id)
    .single();

  if (profileErr || !profile) {
    return res.status(404).json({ error: "User not found" });
  }

  // Get user email
  const { data: authUser } =
    await supabaseAdmin.auth.admin.getUserById(id);
  const userEmail = authUser?.user?.email;
  if (!userEmail) {
    return res.status(400).json({ error: "User has no email address" });
  }

  // Determine year — use body param or default to previous calendar year
  const currentYear = new Date().getUTCFullYear();
  const year = req.body?.year ? Number(req.body.year) : currentYear - 1;

  if (isNaN(year) || year < 2020 || year > currentYear) {
    return res
      .status(400)
      .json({ error: `Year must be between 2020 and ${currentYear}` });
  }

  try {
    // Generate annual PDF with fresh AI insights
    const result = await generatePersonalAnnualPdf(id, year);

    if (!result) {
      return res
        .status(404)
        .json({ error: "No transaction data for the specified year" });
    }
    // Fetch goals and compute achievement for email metrics
    const { data: goals } = await supabaseAdmin
      .from("goals")
      .select("*, categories(name)")
      .eq("user_id", id);

    const goalSummary = computeGoalAchievement(goals ?? [], result.reportData);

    // Parse AI insights into bullet points
    const aiInsights = result.aiInsights
      ? result.aiInsights
          .split("\n")
          .map((line) => line.replace(/^[-*]\s*/, "").trim())
          .filter(Boolean)
          .slice(0, 7)
      : [];

    const appUrl = process.env.APP_URL || "https://spendoza.io";
    const subject = `Your ${year} Year in Review \u2014 Spendoza Annual Report`;

    const htmlBody = buildAnnualReportEmailHtml({
      userName: profile.display_name ?? "there",
      year,
      totalIncome: result.reportData.total_income,
      totalExpenses: result.reportData.total_expenses,
      netSavings:
        result.reportData.total_income - result.reportData.total_expenses,
      savingsRate: result.reportData.savings_rate,
      goalsAchieved: goalSummary.achieved.length,
      goalsTotal: goalSummary.totalCreated,
      aiInsights,
      appReportUrl: `${appUrl}/dashboard`,
      unsubscribeUrl: `${appUrl}/profile`,
    });

    const pdfFilename = `spendoza-annual-report-${year}.pdf`;

    const sendResult = await sendReportEmail({
      to: userEmail,
      subject,
      htmlBody,
      pdfBuffer: result.pdfBuffer,
      pdfFilename,
    });

    if (!sendResult.success) {
      return res
        .status(500)
        .json({ error: `Email send failed: ${sendResult.error}` });
    }

    return res.json({
      success: true,
      email: userEmail,
      year,
    });
  } catch (err) {
    console.error(`[admin] Failed to send annual report for ${id}:`, err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Internal error",
    });
  }
});

export default router;
