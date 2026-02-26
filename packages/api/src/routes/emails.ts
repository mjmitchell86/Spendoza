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
import { isScheduledTime } from "../lib/email-schedule";

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
      result = await generatePersonalPdfForUser(job.user_id, job.report_month);
      reportTitle = "Personal Report";
    } else {
      result = await generateHouseholdPdfForHousehold(
        job.entity_id,
        job.report_month
      );
      reportTitle = "Household Report";
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
