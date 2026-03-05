import { Router, type Request, type Response } from "express";
import { waitUntil } from "@vercel/functions";
import { supabaseAdmin } from "../lib/supabase";
import { sendReportEmail } from "../services/email.service";
import {
  buildReportEmailHtml,
  buildAnnualReportEmailHtml,
} from "../services/email-template.service";
import {
  generatePersonalPdfForUser,
  generateHouseholdPdfForHousehold,
  generatePersonalPdfForRange,
  generateHouseholdPdfForRange,
  generatePersonalAnnualPdf,
  computeGoalAchievement,
} from "../services/pdf-export.service";
import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "../lib/unsubscribe-token";
import { isScheduledTime, isNewYearMidnight } from "../lib/email-schedule";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";

const router = Router();

const APP_URL = () => process.env.APP_URL || "https://spendoza.io";
const API_URL = () => process.env.API_URL || "https://api.spendoza.io";

// ---------------------------------------------------------------------------
// Helper: get the report month string (YYYY-MM-01) for a user's local "now"
// ---------------------------------------------------------------------------
function getCurrentReportMonth(timezone: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const localDate = formatter.format(now); // YYYY-MM-DD
  return localDate.slice(0, 7) + "-01";
}

// ---------------------------------------------------------------------------
// POST /dispatch-weekly — called by pg_cron every hour
// ---------------------------------------------------------------------------
router.post("/dispatch-weekly", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  if (token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Get all users with email reports enabled
    const { data: users, error } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, timezone, household_id, email_report_day, email_report_hour"
      )
      .eq("email_reports_enabled", true);

    if (error || !users) {
      console.error("[dispatch-weekly] Failed to fetch users:", error);
      return res.status(200).json({ dispatched: 0, error: error?.message });
    }

    const now = new Date();
    let dispatched = 0;

    for (const user of users) {
      const tz = user.timezone || "America/New_York";
      const day = user.email_report_day || "saturday";
      const hour = user.email_report_hour ?? 9;

      // Check if it's the user's scheduled time in their timezone
      if (!isScheduledTime(tz, day, hour, now)) continue;

      const reportMonth = getCurrentReportMonth(tz);

      // Check for new transactions since last email
      const { data: lastLog } = await supabaseAdmin
        .from("email_report_log")
        .select("sent_at")
        .eq("user_id", user.id)
        .eq("entity_type", "user")
        .eq("entity_id", user.id)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastSentAt = lastLog?.sent_at ?? "1970-01-01T00:00:00Z";

      // Check new transactions exist
      const { count: newTxnCount } = await supabaseAdmin
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gt("created_at", lastSentAt);

      if (!newTxnCount || newTxnCount === 0) continue;

      // Check fresh AI report exists
      const { data: freshReport } = await supabaseAdmin
        .from("reports")
        .select("generated_at")
        .eq("entity_type", "user")
        .eq("entity_id", user.id)
        .eq("report_month", reportMonth)
        .gt("generated_at", lastSentAt)
        .maybeSingle();

      if (!freshReport) continue;

      // Check not already emailed for this month
      const { data: alreadySent } = await supabaseAdmin
        .from("email_report_log")
        .select("id")
        .eq("user_id", user.id)
        .eq("entity_type", "user")
        .eq("entity_id", user.id)
        .eq("report_month", reportMonth)
        .maybeSingle();

      if (alreadySent) continue;

      // Create personal email job
      await supabaseAdmin.from("email_jobs").insert({
        user_id: user.id,
        entity_type: "user",
        entity_id: user.id,
        report_month: reportMonth,
      });
      dispatched++;

      // Create household email job if applicable
      if (user.household_id) {
        const { data: hhAlreadySent } = await supabaseAdmin
          .from("email_report_log")
          .select("id")
          .eq("user_id", user.id)
          .eq("entity_type", "household")
          .eq("entity_id", user.household_id)
          .eq("report_month", reportMonth)
          .maybeSingle();

        if (!hhAlreadySent) {
          // Check if household has fresh report
          const { data: hhReport } = await supabaseAdmin
            .from("reports")
            .select("generated_at")
            .eq("entity_type", "household")
            .eq("entity_id", user.household_id)
            .eq("report_month", reportMonth)
            .gt("generated_at", lastSentAt)
            .maybeSingle();

          if (hhReport) {
            await supabaseAdmin.from("email_jobs").insert({
              user_id: user.id,
              entity_type: "household",
              entity_id: user.household_id,
              report_month: reportMonth,
            });
            dispatched++;
          }
        }
      }
    }

    return res.status(200).json({ dispatched });
  } catch (err) {
    console.error("[dispatch-weekly] Error:", err);
    return res.status(200).json({ dispatched: 0, error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /send — called by pg_net trigger per email job
// ---------------------------------------------------------------------------
router.post("/send", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  if (token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { job_id } = req.body;
  if (!job_id) {
    return res.status(400).json({ error: "job_id required" });
  }

  // Process in background so pg_net doesn't wait
  waitUntil(processEmailJob(job_id));

  return res.status(200).json({ message: "Job accepted", job_id });
});

// ---------------------------------------------------------------------------
// POST /send-test — manually trigger email for authenticated user (test only)
// ---------------------------------------------------------------------------
router.post("/send-test", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).user.id;

  try {
    // Get user profile for timezone
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("timezone, household_id")
      .eq("id", userId)
      .single();

    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const reportMonth = getCurrentReportMonth(
      profile.timezone || "America/New_York"
    );

    // Force report regeneration so email uses fresh data
    await supabaseAdmin
      .from("reports")
      .update({ has_new_data: true })
      .eq("entity_type", "user")
      .eq("entity_id", userId)
      .eq("report_month", reportMonth);

    // Insert with status 'processing' to bypass the pg_net trigger
    // (trigger only fires for status = 'pending')
    const { data: job, error } = await supabaseAdmin
      .from("email_jobs")
      .insert({
        user_id: userId,
        entity_type: "user",
        entity_id: userId,
        report_month: reportMonth,
        status: "processing",
      })
      .select("id")
      .single();

    if (error || !job) {
      return res.status(500).json({ error: "Failed to create email job" });
    }

    // Process directly (no pg_net trigger will fire)
    waitUntil(processEmailJob(job.id));

    return res
      .status(200)
      .json({ message: "Test email triggered", job_id: job.id });
  } catch (err) {
    console.error("[send-test] Error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

async function processEmailJob(jobId: string): Promise<void> {
  try {
    // Mark as processing
    await supabaseAdmin
      .from("email_jobs")
      .update({ status: "processing" })
      .eq("id", jobId);

    // Fetch job details
    const { data: job } = await supabaseAdmin
      .from("email_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (!job || job.status === "sent") return;

    // Get user's email
    const { data: authUser } =
      await supabaseAdmin.auth.admin.getUserById(job.user_id);
    const userEmail = authUser?.user?.email;
    if (!userEmail) throw new Error(`No email for user ${job.user_id}`);

    // Generate PDF
    let result;
    let reportTitle: string;
    if (job.entity_type === "user") {
      result = await generatePersonalPdfForUser(job.user_id, job.report_month, {
        forceRegenerate: true,
      });
      reportTitle = "Personal Finance Report";
    } else {
      result = await generateHouseholdPdfForHousehold(
        job.entity_id,
        job.report_month,
        { forceRegenerate: true }
      );
      reportTitle = "Household Finance Report";
    }

    if (!result) {
      await supabaseAdmin
        .from("email_jobs")
        .update({
          status: "failed",
          error: "No report data available",
          processed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      return;
    }

    // Get user display name
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", job.user_id)
      .single();

    const monthLabel = new Date(
      job.report_month + "T00:00:00Z"
    ).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });

    // Parse AI insights into bullet points
    const aiInsights = result.aiInsights
      ? result.aiInsights
          .split("\n")
          .map((line) => line.replace(/^[-*]\s*/, "").trim())
          .filter(Boolean)
          .slice(0, 3)
      : [];

    const unsubscribeUrl = `${API_URL()}/api/emails/unsubscribe?token=${createUnsubscribeToken(job.user_id)}`;

    const subject = `Your Spendoza ${reportTitle} \u2014 ${monthLabel}`;

    const htmlBody = buildReportEmailHtml({
      userName: profile?.display_name ?? "there",
      reportTitle,
      monthLabel,
      totalIncome: result.reportData.total_income,
      totalExpenses: result.reportData.total_expenses,
      netSavings:
        result.reportData.total_income - result.reportData.total_expenses,
      savingsRate: result.reportData.savings_rate,
      aiInsights,
      appReportUrl: `${APP_URL()}/dashboard`,
      unsubscribeUrl,
    });

    const pdfFilename =
      job.entity_type === "user"
        ? `spendoza-report-${job.report_month.slice(0, 7)}.pdf`
        : `spendoza-household-report-${job.report_month.slice(0, 7)}.pdf`;

    // Send email
    const sendResult = await sendReportEmail({
      to: userEmail,
      subject,
      htmlBody,
      pdfBuffer: result.pdfBuffer,
      pdfFilename,
    });

    if (!sendResult.success) {
      await supabaseAdmin
        .from("email_jobs")
        .update({
          status: "failed",
          error: sendResult.error,
          processed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      return;
    }

    // Log success
    await supabaseAdmin.from("email_report_log").upsert({
      user_id: job.user_id,
      entity_type: job.entity_type,
      entity_id: job.entity_id,
      report_month: job.report_month,
      email_subject: subject,
      email_preview: `Income: $${result.reportData.total_income}, Expenses: $${result.reportData.total_expenses}`,
      sent_at: new Date().toISOString(),
    });

    // Mark job as sent
    await supabaseAdmin
      .from("email_jobs")
      .update({ status: "sent", processed_at: new Date().toISOString() })
      .eq("id", jobId);

    console.log(
      `[email] Sent ${job.entity_type} report to ${userEmail} for ${job.report_month}`
    );
  } catch (err) {
    console.error(`[email] Failed to process job ${jobId}:`, err);
    await supabaseAdmin
      .from("email_jobs")
      .update({
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        processed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }
}

// ---------------------------------------------------------------------------
// Quarterly helpers
// ---------------------------------------------------------------------------

/**
 * Given a reference date, compute the previous quarter's start and end dates.
 * Jan→Q4(Oct-Dec prev year), Apr→Q1(Jan-Mar), Jul→Q2(Apr-Jun), Oct→Q3(Jul-Sep)
 */
function getPreviousQuarter(refDate: Date = new Date()): {
  fromDate: string;
  toDate: string;
  label: string;
} {
  const month = refDate.getUTCMonth(); // 0-indexed
  const year = refDate.getUTCFullYear();

  let qStart: Date;
  let qEnd: Date;
  let label: string;

  if (month < 3) {
    // Jan-Mar → previous Q4 (Oct-Dec of previous year)
    qStart = new Date(Date.UTC(year - 1, 9, 1));
    qEnd = new Date(Date.UTC(year - 1, 11, 31));
    label = `Q4 ${year - 1} (Oct – Dec)`;
  } else if (month < 6) {
    // Apr-Jun → Q1 (Jan-Mar)
    qStart = new Date(Date.UTC(year, 0, 1));
    qEnd = new Date(Date.UTC(year, 2, 31));
    label = `Q1 ${year} (Jan – Mar)`;
  } else if (month < 9) {
    // Jul-Sep → Q2 (Apr-Jun)
    qStart = new Date(Date.UTC(year, 3, 1));
    qEnd = new Date(Date.UTC(year, 5, 30));
    label = `Q2 ${year} (Apr – Jun)`;
  } else {
    // Oct-Dec → Q3 (Jul-Sep)
    qStart = new Date(Date.UTC(year, 6, 1));
    qEnd = new Date(Date.UTC(year, 8, 30));
    label = `Q3 ${year} (Jul – Sep)`;
  }

  return {
    fromDate: qStart.toISOString().slice(0, 10),
    toDate: qEnd.toISOString().slice(0, 10),
    label,
  };
}

// ---------------------------------------------------------------------------
// POST /dispatch-quarterly — called by pg_cron on Jan/Apr/Jul/Oct 1st
// ---------------------------------------------------------------------------
router.post("/dispatch-quarterly", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  if (token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { fromDate, toDate } = getPreviousQuarter();

    // Get all users with email reports enabled
    const { data: users, error } = await supabaseAdmin
      .from("profiles")
      .select("id, household_id")
      .eq("email_reports_enabled", true);

    if (error || !users) {
      console.error("[dispatch-quarterly] Failed to fetch users:", error);
      return res.status(200).json({ dispatched: 0, error: error?.message });
    }

    let dispatched = 0;

    for (const user of users) {
      // Check if user has transactions in the quarter
      const { count } = await supabaseAdmin
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("date", fromDate)
        .lte("date", toDate);

      if (!count || count === 0) continue;

      // Insert personal quarterly email job
      await supabaseAdmin.from("email_jobs").insert({
        user_id: user.id,
        entity_type: "user",
        entity_id: user.id,
        report_month: fromDate,
        report_type: "quarterly",
        from_date: fromDate,
        to_date: toDate,
      });
      dispatched++;

      // Insert household quarterly email job if applicable
      if (user.household_id) {
        await supabaseAdmin.from("email_jobs").insert({
          user_id: user.id,
          entity_type: "household",
          entity_id: user.household_id,
          report_month: fromDate,
          report_type: "quarterly",
          from_date: fromDate,
          to_date: toDate,
        });
        dispatched++;
      }
    }

    console.log(
      `[dispatch-quarterly] Dispatched ${dispatched} quarterly email jobs for ${fromDate} – ${toDate}`
    );
    return res.status(200).json({ dispatched, fromDate, toDate });
  } catch (err) {
    console.error("[dispatch-quarterly] Error:", err);
    return res.status(200).json({ dispatched: 0, error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /send-quarterly — called by pg_net trigger per quarterly email job
// ---------------------------------------------------------------------------
router.post("/send-quarterly", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  if (token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { job_id } = req.body;
  if (!job_id) {
    return res.status(400).json({ error: "job_id required" });
  }

  waitUntil(processQuarterlyEmailJob(job_id));

  return res.status(200).json({ message: "Quarterly job accepted", job_id });
});

async function processQuarterlyEmailJob(jobId: string): Promise<void> {
  try {
    // Mark as processing
    await supabaseAdmin
      .from("email_jobs")
      .update({ status: "processing" })
      .eq("id", jobId);

    // Fetch job details
    const { data: job } = await supabaseAdmin
      .from("email_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (!job || job.status === "sent") return;
    if (!job.from_date || !job.to_date) {
      throw new Error("Quarterly job missing from_date/to_date");
    }

    // Get user's email
    const { data: authUser } =
      await supabaseAdmin.auth.admin.getUserById(job.user_id);
    const userEmail = authUser?.user?.email;
    if (!userEmail) throw new Error(`No email for user ${job.user_id}`);

    // Generate PDF with fresh quarterly AI insights
    let result;
    let reportTitle: string;
    if (job.entity_type === "user") {
      result = await generatePersonalPdfForRange(
        job.user_id,
        job.from_date,
        job.to_date,
        undefined,
        true
      );
      reportTitle = "Quarterly Report";
    } else {
      result = await generateHouseholdPdfForRange(
        job.entity_id,
        job.from_date,
        job.to_date,
        undefined,
        true
      );
      reportTitle = "Household Quarterly Report";
    }

    if (!result) {
      await supabaseAdmin
        .from("email_jobs")
        .update({
          status: "failed",
          error: "No report data available for quarter",
          processed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      return;
    }

    // Get user display name
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", job.user_id)
      .single();

    const rangeLabel = `${new Date(job.from_date + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })} – ${new Date(job.to_date + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}`;

    // Parse AI insights into bullet points
    const aiInsights = result.aiInsights
      ? result.aiInsights
          .split("\n")
          .map((line) => line.replace(/^[-*]\s*/, "").trim())
          .filter(Boolean)
          .slice(0, 5)
      : [];

    const unsubscribeUrl = `${API_URL()}/api/emails/unsubscribe?token=${createUnsubscribeToken(job.user_id)}`;

    const subject = `Your Spendoza ${reportTitle} \u2014 ${rangeLabel}`;

    const htmlBody = buildReportEmailHtml({
      userName: profile?.display_name ?? "there",
      reportTitle,
      monthLabel: rangeLabel,
      totalIncome: result.reportData.total_income,
      totalExpenses: result.reportData.total_expenses,
      netSavings:
        result.reportData.total_income - result.reportData.total_expenses,
      savingsRate: result.reportData.savings_rate,
      aiInsights,
      appReportUrl: `${APP_URL()}/dashboard`,
      unsubscribeUrl,
    });

    const pdfFilename =
      job.entity_type === "user"
        ? `spendoza-quarterly-report-${job.from_date}-to-${job.to_date}.pdf`
        : `spendoza-household-quarterly-report-${job.from_date}-to-${job.to_date}.pdf`;

    // Send email
    const sendResult = await sendReportEmail({
      to: userEmail,
      subject,
      htmlBody,
      pdfBuffer: result.pdfBuffer,
      pdfFilename,
    });

    if (!sendResult.success) {
      await supabaseAdmin
        .from("email_jobs")
        .update({
          status: "failed",
          error: sendResult.error,
          processed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      return;
    }

    // Log success
    await supabaseAdmin.from("email_report_log").upsert(
      {
        user_id: job.user_id,
        entity_type: job.entity_type,
        entity_id: job.entity_id,
        report_month: job.from_date,
        report_type: "quarterly",
        email_subject: subject,
        email_preview: `Income: $${result.reportData.total_income}, Expenses: $${result.reportData.total_expenses}`,
        sent_at: new Date().toISOString(),
      },
      { onConflict: "user_id,entity_type,entity_id,report_month,report_type" }
    );

    // Mark job as sent
    await supabaseAdmin
      .from("email_jobs")
      .update({ status: "sent", processed_at: new Date().toISOString() })
      .eq("id", jobId);

    console.log(
      `[email] Sent quarterly ${job.entity_type} report to ${userEmail} for ${job.from_date} – ${job.to_date}`
    );
  } catch (err) {
    console.error(`[email] Failed to process quarterly job ${jobId}:`, err);
    await supabaseAdmin
      .from("email_jobs")
      .update({
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        processed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }
}

// ---------------------------------------------------------------------------
// Annual helpers
// ---------------------------------------------------------------------------

/**
 * Given a reference date and timezone, compute the previous year.
 * If it's Jan 1 at midnight in the user's timezone, the previous year is last year.
 */
function getPreviousYear(timezone: string, now: Date = new Date()): number {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
  });
  const localYear = parseInt(formatter.format(now), 10);
  // Since this runs at midnight Jan 1, the previous year is localYear - 1
  return localYear - 1;
}

// ---------------------------------------------------------------------------
// POST /dispatch-annual — called by pg_cron hourly on Dec 31 and Jan 1 UTC
// ---------------------------------------------------------------------------
router.post("/dispatch-annual", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  if (token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Get all users with email reports enabled
    const { data: users, error } = await supabaseAdmin
      .from("profiles")
      .select("id, timezone, household_id")
      .eq("email_reports_enabled", true);

    if (error || !users) {
      console.error("[dispatch-annual] Failed to fetch users:", error);
      return res.status(200).json({ dispatched: 0, error: error?.message });
    }

    const now = new Date();
    let dispatched = 0;

    for (const user of users) {
      const tz = user.timezone || "America/New_York";

      // Only dispatch if it's midnight Jan 1 in the user's timezone
      if (!isNewYearMidnight(tz, now)) continue;

      const previousYear = getPreviousYear(tz, now);
      const fromDate = `${previousYear}-01-01`;
      const toDate = `${previousYear}-12-31`;

      // Check if user has transactions in that year
      const { count } = await supabaseAdmin
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("date", fromDate)
        .lte("date", toDate);

      if (!count || count === 0) continue;

      // Check not already sent
      const { data: alreadySent } = await supabaseAdmin
        .from("email_report_log")
        .select("id")
        .eq("user_id", user.id)
        .eq("entity_type", "user")
        .eq("entity_id", user.id)
        .eq("report_month", fromDate)
        .eq("report_type", "annual")
        .maybeSingle();

      if (alreadySent) continue;

      // Insert personal annual email job
      await supabaseAdmin.from("email_jobs").insert({
        user_id: user.id,
        entity_type: "user",
        entity_id: user.id,
        report_month: fromDate,
        report_type: "annual",
        from_date: fromDate,
        to_date: toDate,
      });
      dispatched++;

      // Insert household annual email job if applicable
      if (user.household_id) {
        const { data: hhAlreadySent } = await supabaseAdmin
          .from("email_report_log")
          .select("id")
          .eq("user_id", user.id)
          .eq("entity_type", "household")
          .eq("entity_id", user.household_id)
          .eq("report_month", fromDate)
          .eq("report_type", "annual")
          .maybeSingle();

        if (!hhAlreadySent) {
          await supabaseAdmin.from("email_jobs").insert({
            user_id: user.id,
            entity_type: "household",
            entity_id: user.household_id,
            report_month: fromDate,
            report_type: "annual",
            from_date: fromDate,
            to_date: toDate,
          });
          dispatched++;
        }
      }
    }

    console.log(
      `[dispatch-annual] Dispatched ${dispatched} annual email jobs`
    );
    return res.status(200).json({ dispatched });
  } catch (err) {
    console.error("[dispatch-annual] Error:", err);
    return res.status(200).json({ dispatched: 0, error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /send-annual — called by pg_net trigger per annual email job
// ---------------------------------------------------------------------------
router.post("/send-annual", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  if (token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { job_id } = req.body;
  if (!job_id) {
    return res.status(400).json({ error: "job_id required" });
  }

  waitUntil(processAnnualEmailJob(job_id));

  return res.status(200).json({ message: "Annual job accepted", job_id });
});

async function processAnnualEmailJob(jobId: string): Promise<void> {
  try {
    // Mark as processing
    await supabaseAdmin
      .from("email_jobs")
      .update({ status: "processing" })
      .eq("id", jobId);

    // Fetch job details
    const { data: job } = await supabaseAdmin
      .from("email_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (!job || job.status === "sent") return;
    if (!job.from_date || !job.to_date) {
      throw new Error("Annual job missing from_date/to_date");
    }

    // Get user's email
    const { data: authUser } =
      await supabaseAdmin.auth.admin.getUserById(job.user_id);
    const userEmail = authUser?.user?.email;
    if (!userEmail) throw new Error(`No email for user ${job.user_id}`);

    // Extract year from from_date
    const year = parseInt(job.from_date.slice(0, 4), 10);

    // Generate annual PDF with fresh AI insights
    const result = await generatePersonalAnnualPdf(job.user_id, year);

    if (!result) {
      await supabaseAdmin
        .from("email_jobs")
        .update({
          status: "failed",
          error: "No report data available for year",
          processed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      return;
    }

    // Get user display name and goals for email metrics
    const [{ data: profile }, { data: goals }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("display_name")
        .eq("id", job.user_id)
        .single(),
      supabaseAdmin
        .from("goals")
        .select("*, categories(name)")
        .eq("user_id", job.user_id),
    ]);

    const goalSummary = computeGoalAchievement(goals ?? [], result.reportData);

    // Parse AI insights into bullet points
    const aiInsights = result.aiInsights
      ? result.aiInsights
          .split("\n")
          .map((line) => line.replace(/^[-*]\s*/, "").trim())
          .filter(Boolean)
          .slice(0, 7)
      : [];

    const unsubscribeUrl = `${API_URL()}/api/emails/unsubscribe?token=${createUnsubscribeToken(job.user_id)}`;

    const subject = `Your ${year} Year in Review \u2014 Spendoza Annual Report`;

    const htmlBody = buildAnnualReportEmailHtml({
      userName: profile?.display_name ?? "there",
      year,
      totalIncome: result.reportData.total_income,
      totalExpenses: result.reportData.total_expenses,
      netSavings:
        result.reportData.total_income - result.reportData.total_expenses,
      savingsRate: result.reportData.savings_rate,
      goalsAchieved: goalSummary.achieved.length,
      goalsTotal: goalSummary.totalCreated,
      aiInsights,
      appReportUrl: `${APP_URL()}/dashboard`,
      unsubscribeUrl,
    });

    const pdfFilename = `spendoza-annual-report-${year}.pdf`;

    // Send email
    const sendResult = await sendReportEmail({
      to: userEmail,
      subject,
      htmlBody,
      pdfBuffer: result.pdfBuffer,
      pdfFilename,
    });

    if (!sendResult.success) {
      await supabaseAdmin
        .from("email_jobs")
        .update({
          status: "failed",
          error: sendResult.error,
          processed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      return;
    }

    // Log success
    await supabaseAdmin.from("email_report_log").upsert(
      {
        user_id: job.user_id,
        entity_type: job.entity_type,
        entity_id: job.entity_id,
        report_month: job.from_date,
        report_type: "annual",
        email_subject: subject,
        email_preview: `Income: $${result.reportData.total_income}, Expenses: $${result.reportData.total_expenses}`,
        sent_at: new Date().toISOString(),
      },
      { onConflict: "user_id,entity_type,entity_id,report_month,report_type" }
    );

    // Mark job as sent
    await supabaseAdmin
      .from("email_jobs")
      .update({ status: "sent", processed_at: new Date().toISOString() })
      .eq("id", jobId);

    console.log(
      `[email] Sent annual ${job.entity_type} report to ${userEmail} for ${year}`
    );
  } catch (err) {
    console.error(`[email] Failed to process annual job ${jobId}:`, err);
    await supabaseAdmin
      .from("email_jobs")
      .update({
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        processed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }
}

// ---------------------------------------------------------------------------
// GET /unsubscribe — one-click unsubscribe from email
// ---------------------------------------------------------------------------
router.get("/unsubscribe", async (req: Request, res: Response) => {
  const tokenStr = req.query.token as string;
  if (!tokenStr) {
    return res.status(400).send("Missing token");
  }

  const result = verifyUnsubscribeToken(tokenStr);
  if (!result.valid) {
    return res.status(400).send("Invalid or expired unsubscribe link");
  }

  await supabaseAdmin
    .from("profiles")
    .update({ email_reports_enabled: false })
    .eq("id", result.userId);

  return res.status(200).send(`
    <!DOCTYPE html>
    <html><head><title>Unsubscribed</title></head>
    <body style="font-family:sans-serif;text-align:center;padding:60px 20px;">
      <h1>Unsubscribed</h1>
      <p>You've been unsubscribed from Spendoza weekly email reports.</p>
      <p>You can re-enable this anytime from your <a href="${APP_URL()}/profile">profile settings</a>.</p>
    </body>
    </html>
  `);
});

export default router;
