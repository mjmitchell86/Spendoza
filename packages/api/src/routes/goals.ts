import { Router, type Response } from "express";
import { createGoalSchema, updateGoalSchema } from "@spendoza/shared";
import { validate } from "../middleware/validate";
import { supabaseAdmin } from "../lib/supabase";
import type { AuthenticatedRequest } from "../middleware/auth";
import { generateGoalSuggestions } from "../ai/goal-suggestions";
import type { ReportData } from "../ai/report-insights";

const router = Router();

// Helper: resolve entity ID for household requests
async function resolveEntity(
  user: { id: string },
  entityTypeParam: string | undefined
): Promise<{ entityType: "user" | "household"; entityId: string } | { error: string }> {
  const entityType = entityTypeParam === "household" ? "household" : "user";
  let entityId = user.id;

  if (entityType === "household") {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("household_id")
      .eq("id", user.id)
      .single();

    if (!profile?.household_id) {
      return { error: "No household found" };
    }
    entityId = profile.household_id;
  }

  return { entityType, entityId };
}

// Helper: check if user has access to a goal
async function checkGoalAccess(
  goalId: string,
  userId: string
): Promise<{ allowed: boolean; goal?: any }> {
  const { data: goal } = await supabaseAdmin
    .from("goals")
    .select("entity_type, entity_id")
    .eq("id", goalId)
    .single();

  if (!goal) return { allowed: false };

  if (goal.entity_type === "user") {
    return { allowed: goal.entity_id === userId, goal };
  }

  // Household: check membership
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("household_id")
    .eq("id", userId)
    .single();

  return {
    allowed: !!profile?.household_id && profile.household_id === goal.entity_id,
    goal,
  };
}

// Get AI-suggested goals based on latest report data
router.get("/suggestions", async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const resolved = await resolveEntity(user, req.query.entity_type as string);
  if ("error" in resolved) return res.status(400).json({ error: resolved.error });
  const { entityType, entityId } = resolved;

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

  // Fetch existing goal names for deduplication (by entity, not user)
  const { data: existingGoals } = await supabaseAdmin
    .from("goals")
    .select("name")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);

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

// List goals filtered by entity
router.get("/", async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const resolved = await resolveEntity(user, req.query.entity_type as string);
  if ("error" in resolved) return res.status(400).json({ error: resolved.error });
  const { entityType, entityId } = resolved;

  const { data, error } = await supabaseAdmin
    .from("goals")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json(data);
});

// Create a goal
router.post("/", validate(createGoalSchema), async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const entityType = req.body.entity_type ?? "user";
  let entityId = req.body.entity_id ?? user.id;

  // For household goals, verify the user belongs to the household
  if (entityType === "household") {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("household_id")
      .eq("id", user.id)
      .single();

    if (!profile?.household_id || profile.household_id !== entityId) {
      return res.status(403).json({ error: "Not a member of this household" });
    }
  }

  const { entity_type: _et, entity_id: _eid, ...goalFields } = req.body;

  const { data, error } = await supabaseAdmin
    .from("goals")
    .insert({
      ...goalFields,
      user_id: user.id,
      entity_type: entityType,
      entity_id: entityId,
    })
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

  const access = await checkGoalAccess(req.params.id, user.id);
  if (!access.allowed) {
    return res.status(access.goal ? 403 : 404).json({
      error: access.goal ? "Forbidden" : "Goal not found",
    });
  }

  const { data, error } = await supabaseAdmin
    .from("goals")
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error || !data) {
    return res.status(400).json({ error: error?.message ?? "Update failed" });
  }

  return res.status(200).json(data);
});

// Delete a goal
router.delete("/:id", async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;

  const access = await checkGoalAccess(req.params.id, user.id);
  if (!access.allowed) {
    return res.status(access.goal ? 403 : 404).json({
      error: access.goal ? "Forbidden" : "Goal not found",
    });
  }

  const { error } = await supabaseAdmin
    .from("goals")
    .delete()
    .eq("id", req.params.id);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(204).send();
});

// Get progress for goals with historical data
router.get("/progress", async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const months = Math.min(parseInt(req.query.months as string) || 6, 24);
  const resolved = await resolveEntity(user, req.query.entity_type as string);
  if ("error" in resolved) return res.status(400).json({ error: resolved.error });
  const { entityType, entityId } = resolved;

  // 1. Fetch goals for this entity (join category name for budget goals)
  const { data: goals, error: goalsError } = await supabaseAdmin
    .from("goals")
    .select("*, categories(name)")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
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

  // 2. Fetch reports for the past N months using the same entity
  const now = new Date();
  const monthKeys: string[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
    monthKeys.push(d.toISOString().slice(0, 10));
  }

  const { data: reports } = await supabaseAdmin
    .from("reports")
    .select("report_month, report_data")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
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
      const catName = goal.category_id
        ? categoryNameMap.get(goal.category_id)?.toLowerCase()
        : undefined;

      if (currentReport?.by_category && catName) {
        const match = currentReport.by_category.find(
          (c: any) => c.category?.toLowerCase() === catName
        );
        current = match?.amount ?? 0;
      }

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
      current = goal.current_amount ?? 0;
    }

    return {
      goal,
      current,
      target: goal.target_amount,
      history: history.reverse(),
    };
  });

  return res.status(200).json({ goals: result });
});

export default router;
