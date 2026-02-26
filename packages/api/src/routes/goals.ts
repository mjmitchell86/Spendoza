import { Router, type Response } from "express";
import { createGoalSchema, updateGoalSchema } from "@spendoza/shared";
import { validate } from "../middleware/validate";
import { supabaseAdmin } from "../lib/supabase";
import type { AuthenticatedRequest } from "../middleware/auth";
import { generateGoalSuggestions } from "../ai/goal-suggestions";
import type { ReportData } from "../ai/report-insights";

const router = Router();

// Get AI-suggested goals based on latest report data
router.get("/suggestions", async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const entityType = (req.query.entity_type as string) === "household" ? "household" : "user";

  let entityId = user.id;

  if (entityType === "household") {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("household_id")
      .eq("id", user.id)
      .single();

    if (!profile?.household_id) {
      return res.status(400).json({ error: "No household found" });
    }
    entityId = profile.household_id;
  }

  // Fetch the latest report for this entity
  const { data: report } = await supabaseAdmin
    .from("reports")
    .select("report_month, report_data")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("report_month", { ascending: false })
    .limit(1)
    .single();

  if (!report) {
    return res.status(200).json({ suggestions: [], report_month: null });
  }

  const reportData = report.report_data as ReportData & { goal_suggestions?: any };

  // Return cached suggestions if available
  if (reportData.goal_suggestions) {
    return res.status(200).json({
      suggestions: reportData.goal_suggestions,
      report_month: report.report_month,
    });
  }

  // Fetch existing goal names for deduplication
  const { data: existingGoals } = await supabaseAdmin
    .from("goals")
    .select("name")
    .eq("user_id", user.id);

  const existingNames = (existingGoals ?? []).map((g: any) => g.name);

  const suggestions = await generateGoalSuggestions(
    reportData,
    entityType,
    existingNames
  );

  // Cache suggestions in report_data
  if (suggestions.length > 0) {
    await supabaseAdmin
      .from("reports")
      .update({
        report_data: { ...reportData, goal_suggestions: suggestions },
      })
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .eq("report_month", report.report_month);
  }

  return res.status(200).json({
    suggestions,
    report_month: report.report_month,
  });
});

// List all goals for the current user
router.get("/", async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;

  const { data, error } = await supabaseAdmin
    .from("goals")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json(data);
});

// Create a goal
router.post("/", validate(createGoalSchema), async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;

  const { data, error } = await supabaseAdmin
    .from("goals")
    .insert({ ...req.body, user_id: user.id })
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(201).json(data);
});

// Update a goal
router.put("/:id", validate(updateGoalSchema), async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;

  const { data, error } = await supabaseAdmin
    .from("goals")
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error || !data) {
    return res.status(404).json({ error: "Goal not found" });
  }

  return res.status(200).json(data);
});

// Delete a goal
router.delete("/:id", async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;

  const { error } = await supabaseAdmin
    .from("goals")
    .delete()
    .eq("id", req.params.id)
    .eq("user_id", user.id);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(204).send();
});

// Get progress for all goals with historical data
router.get("/progress", async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const months = Math.min(parseInt(req.query.months as string) || 6, 24);

  // 1. Fetch all goals for this user (join category name for budget goals)
  const { data: goals, error: goalsError } = await supabaseAdmin
    .from("goals")
    .select("*, categories(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (goalsError) {
    return res.status(400).json({ error: goalsError.message });
  }

  if (!goals || goals.length === 0) {
    return res.status(200).json({ goals: [] });
  }

  // Build a map of category_id -> category name for budget goals
  const categoryNameMap = new Map<string, string>();
  for (const g of goals) {
    if (g.category_id && (g as any).categories?.name) {
      categoryNameMap.set(g.category_id, (g as any).categories.name);
    }
  }

  // 2. Fetch reports for the past N months
  const now = new Date();
  const monthKeys: string[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
    monthKeys.push(d.toISOString().slice(0, 10));
  }

  const { data: reports } = await supabaseAdmin
    .from("reports")
    .select("report_month, report_data")
    .eq("entity_type", "user")
    .eq("entity_id", user.id)
    .in("report_month", monthKeys)
    .order("report_month", { ascending: true });

  const reportsByMonth = new Map<string, any>();
  for (const r of reports ?? []) {
    reportsByMonth.set(r.report_month, r.report_data);
  }

  // Current month key
  const currentMonthKey = monthKeys[0];
  const currentReport = reportsByMonth.get(currentMonthKey);

  // 3. Build progress for each goal
  const result = goals.map((goal: any) => {
    let current = 0;
    const history: Array<{ month: string; actual: number }> = [];

    if (goal.goal_type === "budget") {
      // Resolve category name for matching against report data
      const catName = goal.category_id
        ? categoryNameMap.get(goal.category_id)?.toLowerCase()
        : undefined;

      // Match category spending from reports
      if (currentReport?.by_category && catName) {
        const match = currentReport.by_category.find(
          (c: any) => c.category?.toLowerCase() === catName
        );
        current = match?.amount ?? 0;
      }

      // Build history
      for (const monthKey of monthKeys) {
        const report = reportsByMonth.get(monthKey);
        let actual = 0;
        if (report?.by_category && catName) {
          const match = report.by_category.find(
            (c: any) => c.category?.toLowerCase() === catName
          );
          actual = match?.amount ?? 0;
        }
        history.push({ month: monthKey, actual });
      }
    } else if (goal.goal_type === "monthly_savings") {
      // Net savings = income - expenses
      if (currentReport) {
        current = (currentReport.total_income ?? 0) - (currentReport.total_expenses ?? 0);
      }

      for (const monthKey of monthKeys) {
        const report = reportsByMonth.get(monthKey);
        const actual = report
          ? (report.total_income ?? 0) - (report.total_expenses ?? 0)
          : 0;
        history.push({ month: monthKey, actual });
      }
    } else if (goal.goal_type === "total_savings") {
      // Use stored current_amount
      current = goal.current_amount ?? 0;
      // No monthly history derivable — return empty history
    }

    return {
      goal,
      current,
      target: goal.target_amount,
      history: history.reverse(), // oldest first
    };
  });

  return res.status(200).json({ goals: result });
});

export default router;
