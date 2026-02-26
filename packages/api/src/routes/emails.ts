import { Router, type Request, type Response } from "express";
import { waitUntil } from "@vercel/functions";
import { supabaseAdmin } from "../lib/supabase";
import { sendReportEmail } from "../services/email.service";
import { buildReportEmailHtml } from "../services/email-template.service";
import {
  generatePersonalPdfForUser,
  generateHouseholdPdfForHousehold,
} from "../services/pdf-export.service";
import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "../lib/unsubscribe-token";

const router = Router();

const getAppUrl = () => process.env.APP_URL || "https://spendoza.io";
const getApiUrl = () => process.env.API_URL || "https://api.spendoza.io";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isSaturday9am(timezone: string, now: Date = new Date()): boolean {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const weekday = parts.find((p) => p.type === "weekday")?.value;
    const hour = parseInt(
      parts.find((p) => p.type === "hour")?.value ?? "-1",
      10
    );
    return weekday === "Sat" && hour === 9;
  } catch {
    return false;
  }
}

function getCurrentReportMonth(timezone: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const localDate = formatter.format(now);
  return localDate.slice(0, 7) + "-01";
}

// ---------------------------------------------------------------------------
// POST /dispatch-weekly — called by pg_cron hourly
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
    // Fetch all users with email reports enabled
    const { data: users, error: usersError } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, timezone, household_id, last_email_sent_at"
      )
      .eq("email_reports_enabled", true);

    if (usersError) {
      console.error("[emails/dispatch-weekly] Error fetching users:", usersError);
      return res.status(200).json({ dispatched: 0, error: usersError.message });
    }

    let dispatched = 0;

    for (const user of users ?? []) {
      const timezone = user.timezone || "America/New_York";

      // Check if it's Saturday 9am in the user's timezone
      if (!isSaturday9am(timezone)) continue;

      const reportMonth = getCurrentReportMonth(timezone);
      const lastSentAt = user.last_email_sent_at
        ? new Date(user.last_email_sent_at)
        : new Date(0);

      // Check for new transactions since last email
      const { data: newTxns } = await supabaseAdmin
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gt("created_at", lastSentAt.toISOString())
        .limit(1);

      // Check for fresh AI report since last email
      const { data: freshReport } = await supabaseAdmin
        .from("reports")
        .select("id")
        .eq("entity_type", "user")
        .eq("entity_id", user.id)
        .eq("report_month", reportMonth)
        .gt("generated_at", lastSentAt.toISOString())
        .limit(1);

      const hasNewData =
        (newTxns && newTxns.length > 0) ||
        (freshReport && freshReport.length > 0);

      if (!hasNewData) continue;

      // Check not already emailed this month (personal)
      const { data: existingPersonalLog } = await supabaseAdmin
        .from("email_report_log")
        .select("id")
        .eq("user_id", user.id)
        .eq("entity_type", "user")
        .eq("entity_id", user.id)
        .eq("report_month", reportMonth)
        .limit(1);

      if (!existingPersonalLog || existingPersonalLog.length === 0) {
        // Insert personal email job
        await supabaseAdmin.from("email_jobs").insert({
          user_id: user.id,
          entity_type: "user",
          entity_id: user.id,
          report_month: reportMonth,
          status: "pending",
        });
        dispatched++;
      }

      // Check household email
      if (user.household_id) {
        const { data: existingHouseholdLog } = await supabaseAdmin
          .from("email_report_log")
          .select("id")
          .eq("user_id", user.id)
          .eq("entity_type", "household")
          .eq("entity_id", user.household_id)
          .eq("report_month", reportMonth)
          .limit(1);

        if (!existingHouseholdLog || existingHouseholdLog.length === 0) {
          await supabaseAdmin.from("email_jobs").insert({
            user_id: user.id,
            entity_type: "household",
            entity_id: user.household_id,
            report_month: reportMonth,
            status: "pending",
          });
          dispatched++;
        }
      }
    }

    return res.status(200).json({ dispatched });
  } catch (err: any) {
    console.error("[emails/dispatch-weekly] Unexpected error:", err);
    return res.status(200).json({ dispatched: 0, error: err?.message ?? "Internal server error" });
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
    return res.status(400).json({ error: "job_id is required" });
  }

  // Return 200 immediately so pg_net doesn't wait
  waitUntil(
    processEmailJob(job_id).catch((err) =>
      console.error(`[emails/send] Failed to process job ${job_id}:`, err)
    )
  );

  return res.status(200).json({ message: "Job accepted", job_id });
});

// ---------------------------------------------------------------------------
// GET /unsubscribe — signed token auth
// ---------------------------------------------------------------------------
router.get("/unsubscribe", async (req: Request, res: Response) => {
  const tokenParam = req.query.token as string;
  if (!tokenParam) {
    return res.status(400).json({ error: "Missing token" });
  }

  const result = verifyUnsubscribeToken(tokenParam);
  if (!result.valid) {
    return res
      .status(400)
      .json({ error: "Invalid or expired unsubscribe link" });
  }

  try {
    // Disable email reports for user
    await supabaseAdmin
      .from("profiles")
      .update({ email_reports_enabled: false })
      .eq("id", result.userId);

    // Return a simple HTML confirmation page
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Unsubscribed - Spendoza</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="background:#ffffff;border-radius:12px;padding:40px;max-width:480px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <h1 style="margin:0 0 16px;font-size:24px;color:#27272a;">Unsubscribed</h1>
    <p style="margin:0 0 24px;color:#71717a;font-size:16px;">You've been unsubscribed from Spendoza weekly email reports.</p>
    <p style="margin:0;color:#a1a1aa;font-size:14px;">You can re-enable email reports in your <a href="${getAppUrl()}/profile" style="color:#10b981;">profile settings</a>.</p>
  </div>
</body>
</html>`;

    return res.status(200).type("html").send(html);
  } catch (err) {
    console.error("[emails/unsubscribe] Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// Background job processor
// ---------------------------------------------------------------------------
async function processEmailJob(jobId: string): Promise<void> {
  // Mark job as processing
  await supabaseAdmin
    .from("email_jobs")
    .update({ status: "processing" })
    .eq("id", jobId);

  try {
    // Fetch job details
    const { data: job, error: jobError } = await supabaseAdmin
      .from("email_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Get user's email via admin auth API
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.getUserById(job.user_id);

    if (authError || !authData?.user?.email) {
      throw new Error(
        `Failed to get email for user ${job.user_id}: ${authError?.message ?? "no email"}`
      );
    }

    const userEmail = authData.user.email;

    // Get user profile for display name
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", job.user_id)
      .single();

    const userName = profile?.display_name ?? "there";

    // Generate PDF and get report data
    let pdfResult;
    let reportTitle: string;
    let pdfFilename: string;

    if (job.entity_type === "household") {
      pdfResult = await generateHouseholdPdfForHousehold(
        job.entity_id,
        job.report_month
      );
      reportTitle = "Household Report";
      pdfFilename = `spendoza-household-report-${job.report_month}.pdf`;
    } else {
      pdfResult = await generatePersonalPdfForUser(
        job.entity_id,
        job.report_month
      );
      reportTitle = "Personal Report";
      pdfFilename = `spendoza-personal-report-${job.report_month}.pdf`;
    }

    if (!pdfResult) {
      throw new Error(
        `No report data for ${job.entity_type}/${job.entity_id} month=${job.report_month}`
      );
    }

    const { pdfBuffer, reportData, aiInsights } = pdfResult;

    // Build month label
    const monthLabel = new Date(
      job.report_month + "T00:00:00Z"
    ).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });

    // Build unsubscribe URL
    const unsubscribeToken = createUnsubscribeToken(job.user_id);
    const unsubscribeUrl = `${getApiUrl()}/api/emails/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;

    // Build app report URL
    const reportPath =
      job.entity_type === "household"
        ? `/reports/household?month=${job.report_month}`
        : `/reports/personal?month=${job.report_month}`;
    const appReportUrl = `${getAppUrl()}${reportPath}`;

    // Parse AI insights into array
    const insightsArray = aiInsights
      ? aiInsights
          .split("\n")
          .map((line: string) => line.replace(/^[-*]\s*/, "").trim())
          .filter(Boolean)
      : [];

    // Build HTML email
    const totalIncome = reportData.total_income ?? 0;
    const totalExpenses = reportData.total_expenses ?? 0;
    const netSavings = totalIncome - totalExpenses;
    const savingsRate = reportData.savings_rate ?? 0;

    const htmlBody = buildReportEmailHtml({
      userName,
      reportTitle,
      monthLabel,
      totalIncome,
      totalExpenses,
      netSavings,
      savingsRate,
      aiInsights: insightsArray,
      appReportUrl,
      unsubscribeUrl,
    });

    // Send email
    const subject = `Your ${reportTitle} for ${monthLabel}`;
    const sendResult = await sendReportEmail({
      to: userEmail,
      subject,
      htmlBody,
      pdfBuffer,
      pdfFilename,
    });

    if (!sendResult.success) {
      throw new Error(`Email send failed: ${sendResult.error}`);
    }

    // Log to email_report_log
    await supabaseAdmin.from("email_report_log").upsert(
      {
        user_id: job.user_id,
        entity_type: job.entity_type,
        entity_id: job.entity_id,
        report_month: job.report_month,
        email_subject: subject,
        email_preview: `Income: $${totalIncome}, Expenses: $${totalExpenses}`,
      },
      { onConflict: "user_id,entity_type,entity_id,report_month" }
    );

    // Update profile last_email_sent_at
    await supabaseAdmin
      .from("profiles")
      .update({ last_email_sent_at: new Date().toISOString() })
      .eq("id", job.user_id);

    // Mark job as sent
    await supabaseAdmin
      .from("email_jobs")
      .update({ status: "sent", processed_at: new Date().toISOString() })
      .eq("id", jobId);
  } catch (err: any) {
    console.error(`[emails/send] Job ${jobId} failed:`, err);

    // Mark job as failed
    await supabaseAdmin
      .from("email_jobs")
      .update({
        status: "failed",
        error: err?.message ?? "Unknown error",
        processed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }
}

export default router;
