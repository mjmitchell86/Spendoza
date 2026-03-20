import { Router, type Response } from "express";
import { askAdviceSchema, ADVICE_DAILY_LIMITS } from "@spendoza/shared";
import type { SubscriptionTier } from "@spendoza/shared";
import { validate } from "../middleware/validate";
import { supabaseAdmin } from "../lib/supabase";
import type { AuthenticatedRequest } from "../middleware/auth";
import {
  generateFinancialAdvice,
  type FinancialContext,
} from "../ai/financial-advisor";
import type { ReportData } from "../ai/report-insights";

const router = Router();

// ---------------------------------------------------------------------------
// Helper: count today's questions for the user
// ---------------------------------------------------------------------------
async function countTodayQuestions(userId: string): Promise<number> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabaseAdmin
    .from("advice_questions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", todayStart.toISOString());

  if (error) {
    console.error("[advice] Failed to count today's questions:", error.message);
    return 0;
  }

  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Helper: fetch user's financial context
// ---------------------------------------------------------------------------
async function fetchFinancialContext(
  userId: string,
  db: any
): Promise<FinancialContext> {
  // Fetch up to 6 recent reports
  const { data: reports } = await db
    .from("reports")
    .select("report_month, report_data")
    .eq("entity_type", "user")
    .eq("entity_id", userId)
    .order("report_month", { ascending: false })
    .limit(6);

  // Fetch active income entries
  const { data: incomeEntries } = await db
    .from("income_entries")
    .select("source_name, amount, frequency")
    .eq("user_id", userId)
    .is("end_date", null)
    .order("amount", { ascending: false });

  // Fetch recurring expenses with category names
  const { data: expenses } = await db
    .from("expenses")
    .select("description, amount, frequency, categories(name)")
    .eq("user_id", userId)
    .eq("frequency", "recurring")
    .order("amount", { ascending: false })
    .limit(30);

  // Fetch active debts
  const { data: debts } = await db
    .from("debts")
    .select(
      "name, debt_type, current_balance, interest_rate, minimum_payment"
    )
    .eq("entity_type", "user")
    .eq("entity_id", userId)
    .gt("current_balance", 0);

  // Fetch goals
  const { data: goals } = await db
    .from("goals")
    .select("name, goal_type, target_amount, current_amount")
    .eq("entity_type", "user")
    .eq("entity_id", userId);

  return {
    reports: (reports ?? []).map((r: any) => ({
      month: r.report_month as string,
      data: r.report_data as ReportData,
    })),
    income_entries: (incomeEntries ?? []).map((i: any) => ({
      source_name: i.source_name as string,
      amount: Number(i.amount),
      frequency: i.frequency as string,
    })),
    expenses: (expenses ?? []).map((e: any) => ({
      description: e.description as string,
      amount: Number(e.amount),
      category: ((e as any).categories?.name ?? "Uncategorized") as string,
      frequency: e.frequency as string,
    })),
    debts: (debts ?? []).map((d: any) => ({
      name: d.name as string,
      debt_type: d.debt_type as string,
      current_balance: Number(d.current_balance),
      interest_rate: Number(d.interest_rate),
      minimum_payment: Number(d.minimum_payment),
    })),
    goals: (goals ?? []).map((g: any) => ({
      name: g.name as string,
      goal_type: g.goal_type as string,
      target_amount: Number(g.target_amount),
      current_amount: Number(g.current_amount ?? 0),
    })),
  };
}

// ---------------------------------------------------------------------------
// GET /advice/usage — check remaining daily questions
// ---------------------------------------------------------------------------
router.get("/usage", async (req, res: Response) => {
  const { user, supabase: db } = req as AuthenticatedRequest;

  const { data: profile } = await db
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .single();

  const tier = (profile?.subscription_tier ?? "free") as SubscriptionTier;
  const limit = ADVICE_DAILY_LIMITS[tier];
  const used = limit > 0 ? await countTodayQuestions(user.id) : 0;

  return res.status(200).json({
    used,
    limit,
    remaining: Math.max(0, limit - used),
  });
});

// ---------------------------------------------------------------------------
// GET /advice/history — list past questions
// ---------------------------------------------------------------------------
router.get("/history", async (req, res: Response) => {
  const { user, supabase: db } = req as AuthenticatedRequest;

  const { data, error } = await db
    .from("advice_questions")
    .select("id, question, answer, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json(data);
});

// ---------------------------------------------------------------------------
// POST /advice — ask a financial question
// ---------------------------------------------------------------------------
router.post(
  "/",
  validate(askAdviceSchema),
  async (req, res: Response) => {
    const { user, supabase: db } = req as AuthenticatedRequest;
    const { question } = req.body;

    // 1. Check subscription tier and daily limit
    const { data: profile } = await db
      .from("profiles")
      .select("subscription_tier")
      .eq("id", user.id)
      .single();

    const tier = (profile?.subscription_tier ?? "free") as SubscriptionTier;
    const limit = ADVICE_DAILY_LIMITS[tier];

    if (limit === 0) {
      return res.status(403).json({
        error: "Financial advice requires a Starter or Pro subscription",
        required_tier: "starter",
        current_tier: tier,
      });
    }

    const used = await countTodayQuestions(user.id);
    if (used >= limit) {
      return res.status(429).json({
        error: `Daily question limit reached (${limit}/${limit}). Resets at midnight UTC.`,
        used,
        limit,
      });
    }

    // 2. Gather financial context
    const context = await fetchFinancialContext(user.id, db);

    // 3. Generate advice via LLM
    let answer: string;
    try {
      answer = await generateFinancialAdvice(question, context, user.id);
    } catch (err) {
      console.error("[advice] LLM call failed:", err);
      return res.status(500).json({
        error: "Failed to generate advice. Please try again.",
      });
    }

    // 4. Store the Q&A
    const { data: saved, error: insertError } = await supabaseAdmin
      .from("advice_questions")
      .insert({
        user_id: user.id,
        question,
        answer,
      })
      .select("id, question, answer, created_at")
      .single();

    if (insertError) {
      console.error("[advice] Failed to save question:", insertError.message);
      // Still return the answer even if save fails
      return res.status(200).json({
        id: null,
        question,
        answer,
        created_at: new Date().toISOString(),
      });
    }

    return res.status(201).json(saved);
  }
);

export default router;
