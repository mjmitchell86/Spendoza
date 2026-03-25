import type { SubscriptionTier } from "@spendoza/shared";

const TOOL_TIER_MAP: Record<string, SubscriptionTier> = {
  list_goals: "starter",
  get_goal_progress: "starter",
  get_goal_suggestions: "starter",
  create_goal: "starter",
  update_goal: "starter",
  delete_goal: "starter",
  list_debts: "starter",
  get_debt_projections: "starter",
  create_debt: "starter",
  update_debt: "starter",
  delete_debt: "starter",
  get_household_dashboard: "pro",
};

const TIER_RANK: Record<SubscriptionTier, number> = {
  free: 0,
  starter: 1,
  pro: 2,
};

const ALL_TOOLS = [
  "get_profile", "get_dashboard", "list_income", "list_expenses",
  "list_categories", "list_transactions", "get_report",
  "list_bank_statements", "get_bank_statement",
  "create_income", "update_income", "delete_income",
  "create_expense", "update_expense", "delete_expense",
  "list_goals", "get_goal_progress", "get_goal_suggestions",
  "list_debts", "get_debt_projections",
  "create_goal", "update_goal", "delete_goal",
  "create_debt", "update_debt", "delete_debt",
  "get_household_dashboard",
];

export function checkTierAccess(toolName: string, userTier: SubscriptionTier): string | null {
  const requiredTier = TOOL_TIER_MAP[toolName];
  if (!requiredTier) return null;
  if (TIER_RANK[userTier] >= TIER_RANK[requiredTier]) return null;
  return `This tool requires a ${requiredTier} subscription or higher. Current tier: ${userTier}.`;
}

export function getToolsForTier(userTier: SubscriptionTier): string[] {
  return ALL_TOOLS.filter((tool) => checkTierAccess(tool, userTier) === null);
}
