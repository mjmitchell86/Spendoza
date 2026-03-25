import type { CreateGoalInput, UpdateGoalInput } from "@spendoza/shared";
import type { ServiceContext } from "./context";
import { resolveEntity } from "./household.service";
import { generateGoalSuggestions } from "../ai/goal-suggestions";
import type { ReportData } from "../ai/report-insights";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function checkGoalAccess(
  ctx: ServiceContext,
  goalId: string
): Promise<{ allowed: boolean; goal?: any; error?: { message: string } }> {
  const { data: goal } = await ctx.supabase
    .from("goals")
    .select("entity_type, entity_id")
    .eq("id", goalId)
    .single();

  if (!goal) return { allowed: false };

  if (goal.entity_type === "user") {
    return { allowed: goal.entity_id === ctx.userId, goal };
  }

  // Household: check membership
  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("household_id")
    .eq("id", ctx.userId)
    .single();

  return {
    allowed: !!profile?.household_id && profile.household_id === goal.entity_id,
    goal,
  };
}

// ---------------------------------------------------------------------------
// listGoals
// ---------------------------------------------------------------------------
export async function listGoals(
  ctx: ServiceContext,
  entityType?: string
): Promise<{ data: any[] | null; error: { message: string } | null }> {
  const resolved = await resolveEntity(ctx, entityType);
  if (resolved.error) return { data: null, error: resolved.error };

  const { entityType: eType, entityId } = resolved.data!;

  const { data, error } = await ctx.supabase
    .from("goals")
    .select("*")
    .eq("entity_type", eType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: { message: error.message } };
  return { data: data ?? [], error: null };
}

// ---------------------------------------------------------------------------
// createGoal
// ---------------------------------------------------------------------------
export async function createGoal(
  ctx: ServiceContext,
  input: CreateGoalInput
): Promise<{ data: any | null; error: { message: string } | null }> {
  const entityType = input.entity_type ?? "user";
  let entityId = input.entity_id ?? ctx.userId;

  // For household goals, verify the user belongs to the household
  if (entityType === "household") {
    const { data: profile } = await ctx.supabase
      .from("profiles")
      .select("household_id")
      .eq("id", ctx.userId)
      .single();

    if (!profile?.household_id || profile.household_id !== entityId) {
      return {
        data: null,
        error: { message: "Not a member of this household" },
      };
    }
  }

  const { entity_type: _et, entity_id: _eid, ...goalFields } = input;

  const { data, error } = await ctx.supabase
    .from("goals")
    .insert({
      ...goalFields,
      user_id: ctx.userId,
      entity_type: entityType,
      entity_id: entityId,
    })
    .select()
    .single();

  if (error) return { data: null, error: { message: error.message } };
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// updateGoal
// ---------------------------------------------------------------------------
export async function updateGoal(
  ctx: ServiceContext,
  id: string,
  input: UpdateGoalInput
): Promise<{ data: any | null; error: { message: string } | null }> {
  const access = await checkGoalAccess(ctx, id);

  if (!access.allowed) {
    if (!access.goal) {
      return { data: null, error: { message: "Goal not found" } };
    }
    return { data: null, error: { message: "Forbidden" } };
  }

  const { data, error } = await ctx.supabase
    .from("goals")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    return { data: null, error: { message: error?.message ?? "Update failed" } };
  }
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// deleteGoal
// ---------------------------------------------------------------------------
export async function deleteGoal(
  ctx: ServiceContext,
  id: string
): Promise<{ error: { message: string } | null }> {
  const access = await checkGoalAccess(ctx, id);

  if (!access.allowed) {
    if (!access.goal) {
      return { error: { message: "Goal not found" } };
    }
    return { error: { message: "Forbidden" } };
  }

  const { error } = await ctx.supabase
    .from("goals")
    .delete()
    .eq("id", id);

  if (error) return { error: { message: error.message } };
  return { error: null };
}

// ---------------------------------------------------------------------------
// getGoalSuggestions
// ---------------------------------------------------------------------------
export async function getGoalSuggestions(
  ctx: ServiceContext,
  entityType?: string
): Promise<{
  data: { suggestions: any[]; report_month: string | null } | null;
  error: { message: string } | null;
}> {
  const resolved = await resolveEntity(ctx, entityType);
  if (resolved.error) return { data: null, error: resolved.error };

  const { entityType: eType, entityId } = resolved.data!;

  // Fetch the latest report for this entity
  const { data: report } = await ctx.supabase
    .from("reports")
    .select("report_month, report_data")
    .eq("entity_type", eType)
    .eq("entity_id", entityId)
    .order("report_month", { ascending: false })
    .limit(1)
    .single();

  if (!report) {
    return { data: { suggestions: [], report_month: null }, error: null };
  }

  const reportData = report.report_data as ReportData & { goal_suggestions?: any };

  // Return cached suggestions if available
  if (reportData.goal_suggestions) {
    return {
      data: {
        suggestions: reportData.goal_suggestions,
        report_month: report.report_month,
      },
      error: null,
    };
  }

  // Fetch existing goals for deduplication
  const { data: existingGoals } = await ctx.supabase
    .from("goals")
    .select("name, goal_type")
    .eq("entity_type", eType)
    .eq("entity_id", entityId);

  const existingGoalList = (existingGoals ?? []).map((g: any) => ({
    name: g.name as string,
    goal_type: g.goal_type as string,
  }));

  const suggestions = await generateGoalSuggestions(
    reportData,
    eType,
    existingGoalList
  );

  // Cache suggestions in report_data using admin client
  if (suggestions.length > 0) {
    await ctx.supabaseAdmin
      .from("reports")
      .update({
        report_data: { ...reportData, goal_suggestions: suggestions },
      })
      .eq("entity_type", eType)
      .eq("entity_id", entityId)
      .eq("report_month", report.report_month);
  }

  return {
    data: {
      suggestions,
      report_month: report.report_month,
    },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// getGoalProgress
// ---------------------------------------------------------------------------
export async function getGoalProgress(
  ctx: ServiceContext,
  entityType?: string,
  monthsParam?: number
): Promise<{
  data: { goals: any[] } | null;
  error: { message: string } | null;
}> {
  const months = Math.min(monthsParam ?? 6, 24);

  const resolved = await resolveEntity(ctx, entityType);
  if (resolved.error) return { data: null, error: resolved.error };

  const { entityType: eType, entityId } = resolved.data!;

  // 1. Fetch goals for this entity (join category name for budget goals)
  const { data: goals, error: goalsError } = await ctx.supabase
    .from("goals")
    .select("*, categories(name)")
    .eq("entity_type", eType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });

  if (goalsError) {
    return { data: null, error: { message: goalsError.message } };
  }

  if (!goals || goals.length === 0) {
    return { data: { goals: [] }, error: null };
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

  const { data: reports } = await ctx.supabase
    .from("reports")
    .select("report_month, report_data")
    .eq("entity_type", eType)
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
  const result = await Promise.all(
    goals.map(async (goal: any) => {
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
      } else if (goal.goal_type === "savings_amount") {
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
      } else if (goal.goal_type === "target_savings") {
        current = Number(goal.current_amount ?? 0);

        for (const monthKey of monthKeys) {
          history.push({ month: monthKey, actual: Number(goal.current_amount ?? 0) });
        }
      } else if (goal.goal_type === "savings_rate") {
        current = currentReport?.savings_rate ?? 0;

        for (const monthKey of monthKeys) {
          const report = reportsByMonth.get(monthKey);
          const actual = report?.savings_rate ?? 0;
          history.push({ month: monthKey, actual });
        }
      } else if (goal.goal_type === "emergency_fund") {
        current = Number(goal.current_amount ?? 0);

        for (const monthKey of monthKeys) {
          history.push({ month: monthKey, actual: Number(goal.current_amount ?? 0) });
        }
      } else if (goal.goal_type === "debt_payoff") {
        let target = Number(goal.target_amount);
        if (goal.debt_id) {
          const { data: debt } = await ctx.supabase
            .from("debts")
            .select("original_balance, current_balance")
            .eq("id", goal.debt_id)
            .single();
          if (debt) {
            current = Number(debt.original_balance) - Number(debt.current_balance);
            target = Number(debt.original_balance);
          }
        }

        for (const monthKey of monthKeys) {
          history.push({ month: monthKey, actual: current });
        }

        return {
          goal,
          current,
          target,
          history: history.reverse(),
        };
      }

      return {
        goal,
        current,
        target: goal.target_amount,
        history: history.reverse(),
      };
    })
  );

  return { data: { goals: result }, error: null };
}
