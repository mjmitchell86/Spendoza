import { Router, type Request, type Response } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import {
  generateUserReport,
  generateHouseholdReport,
  generateAllReports,
} from "../services/report.service";
import { buildReportPdf } from "../services/pdf-report.service";
import type { ReportData } from "../ai/report-insights";

const router = Router();

// ---------------------------------------------------------------------------
// Helper: build savings recommendations from spending data
// ---------------------------------------------------------------------------
function buildSavingsRecommendations(
  reportData: ReportData,
  subscriptions: Array<{ name: string; amount: number; category: string | null; recurrence_interval: string }>
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

function formatCurrencySimple(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

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
// POST /generate — manual trigger (max 2 per 24h in production)
// ---------------------------------------------------------------------------
router.post("/generate", requireAuth, async (req: Request, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const now = new Date();
  const isProduction = process.env.VERCEL_ENV === "production";

  // Rate-limit: 2 requests per 24-hour rolling window (production only)
  if (isProduction) {
    const twentyFourHoursAgo = new Date(
      now.getTime() - 24 * 60 * 60 * 1000
    ).toISOString();

    const { count } = await supabaseAdmin
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
  const { data: latestTxn } = await supabaseAdmin
    .from("transactions")
    .select("date")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(1);

  const reportDate = latestTxn && latestTxn.length > 0
    ? new Date(latestTxn[0].date + "T00:00:00Z")
    : now;

  // Generate the personal report for the month with data (force=true to bypass cache)
  const report = await generateUserReport(user.id, reportDate, true);

  // Also generate household report if user belongs to one
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();

  if (profile?.household_id) {
    try {
      await generateHouseholdReport(profile.household_id, reportDate, true);
    } catch (err) {
      console.error(`Failed to generate household report:`, err);
    }
  }

  // Record the request for rate-limiting
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
      const { user } = req as AuthenticatedRequest;
      const month = parseMonth(req.query.month as string | undefined);

      // Try cached report
      let { data: report } = await supabaseAdmin
        .from("reports")
        .select("*")
        .eq("entity_type", "user")
        .eq("entity_id", user.id)
        .eq("report_month", month)
        .maybeSingle();

      // Regenerate if missing or stale
      if (!report || report.has_new_data === true) {
        report = await generateUserReport(
          user.id,
          new Date(month + "T00:00:00Z"),
          true
        );
      }

      if (!report?.report_data) {
        return res
          .status(404)
          .json({ error: "No report data available for this month" });
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
          .eq("user_id", user.id)
          .eq("frequency", "recurring"),
        supabaseAdmin
          .from("income_entries")
          .select("source_name, amount, frequency, attributed_to_name")
          .eq("user_id", user.id),
        supabaseAdmin
          .from("profiles")
          .select("display_name")
          .eq("id", user.id)
          .single(),
        supabaseAdmin
          .from("expenses")
          .select("description, friendly_name, amount, recurrence_interval, category_id, categories(name)")
          .eq("user_id", user.id)
          .eq("frequency", "recurring")
          .or(`end_date.is.null,end_date.gte.${month}`),
        supabaseAdmin
          .from("goals")
          .select("*, categories(name)")
          .eq("user_id", user.id),
      ]);

      // Build subscriptions paid this month from recurring expenses
      const subscriptionsPaid = (allRecurringExpenses ?? []).map((e: any) => ({
        name: e.friendly_name || e.description,
        amount: e.amount ?? 0,
        category: e.categories?.name ?? null,
        recurrence_interval: e.recurrence_interval ?? "monthly",
      }));

      // Build goal progress
      const reportData = report.report_data as import("../ai/report-insights").ReportData;
      const goalProgress = (goals ?? []).map((goal: any) => {
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
        title: profile?.display_name ?? "Personal",
        month: monthLabel,
        reportData,
        aiInsights: report.ai_insights ?? null,
        recurringBills: recurringBills ?? [],
        incomeSources: incomeSources ?? [],
        subscriptionsPaid,
        goalProgress,
        savingsRecommendations,
      });

      const filename = `spendoza-report-${month.slice(0, 7)}.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      res.setHeader("Content-Length", pdfBuffer.length);

      return res.send(pdfBuffer);
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
      const { user } = req as AuthenticatedRequest;
      const month = parseMonth(req.query.month as string | undefined);

      // Look up user's household
      const { data: userProfile } = await supabaseAdmin
        .from("profiles")
        .select("household_id")
        .eq("id", user.id)
        .single();

      if (!userProfile?.household_id) {
        return res
          .status(400)
          .json({ error: "You are not a member of a household" });
      }

      const householdId = userProfile.household_id;

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
        return res
          .status(404)
          .json({ error: "No report data available for this month" });
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
          .select("description, friendly_name, amount, recurrence_interval, category_id, categories(name)")
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
      const reportData = report.report_data as import("../ai/report-insights").ReportData;
      const goalProgress = (goals ?? []).map((goal: any) => {
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

      const pdfBuffer = await buildReportPdf({
        title: household?.name ?? "Household",
        month: monthLabel,
        reportData,
        aiInsights: report.ai_insights ?? null,
        recurringBills: recurringBills ?? [],
        incomeSources: incomeSources ?? [],
        memberContributions,
        subscriptionsPaid,
        goalProgress,
        savingsRecommendations,
      });

      const filename = `spendoza-household-report-${month.slice(0, 7)}.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      res.setHeader("Content-Length", pdfBuffer.length);

      return res.send(pdfBuffer);
    } catch (err) {
      console.error("[export/household] Error generating PDF:", err);
      return res
        .status(500)
        .json({ error: "Failed to generate PDF report" });
    }
  }
);

export default router;
