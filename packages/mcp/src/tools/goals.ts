import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServiceContext } from "@spendoza/api/src/services/context";
import {
  listGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  getGoalProgress,
  getGoalSuggestions,
} from "@spendoza/api/src/services/goal.service";

export function registerGoalTools(
  server: McpServer,
  allowed: Set<string>,
  ctx: ServiceContext
) {
  // ---------------------------------------------------------------------------
  // list_goals
  // ---------------------------------------------------------------------------
  if (allowed.has("list_goals")) {
    server.tool(
      "list_goals",
      "List all financial goals. Optionally filter by entity type (personal or household).",
      {
        entity_type: z
          .enum(["user", "household"])
          .optional()
          .describe("Filter by entity type. Defaults to personal ('user') goals."),
      },
      async (args) => {
        const { data, error } = await listGoals(ctx, args.entity_type);
        if (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      }
    );
  }

  // ---------------------------------------------------------------------------
  // get_goal_progress
  // ---------------------------------------------------------------------------
  if (allowed.has("get_goal_progress")) {
    server.tool(
      "get_goal_progress",
      "Get progress tracking for all financial goals, including current values, targets, and monthly history",
      {
        entity_type: z
          .enum(["user", "household"])
          .optional()
          .describe("Filter by entity type. Defaults to personal ('user') goals."),
      },
      async (args) => {
        const { data, error } = await getGoalProgress(ctx, args.entity_type);
        if (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      }
    );
  }

  // ---------------------------------------------------------------------------
  // get_goal_suggestions
  // ---------------------------------------------------------------------------
  if (allowed.has("get_goal_suggestions")) {
    server.tool(
      "get_goal_suggestions",
      "Get AI-generated goal suggestions based on the user's financial reports and existing goals",
      {
        entity_type: z
          .enum(["user", "household"])
          .optional()
          .describe("Entity type for suggestions. Defaults to personal ('user')."),
      },
      async (args) => {
        const { data, error } = await getGoalSuggestions(ctx, args.entity_type);
        if (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      }
    );
  }

  // ---------------------------------------------------------------------------
  // create_goal
  // ---------------------------------------------------------------------------
  if (allowed.has("create_goal")) {
    server.tool(
      "create_goal",
      "Create a new financial goal (budget limit, savings target, savings rate, emergency fund, debt payoff, or target savings)",
      {
        name: z.string().describe("Name of the goal"),
        goal_type: z
          .enum(["budget", "savings_amount", "savings_rate", "emergency_fund", "debt_payoff", "target_savings"])
          .describe("Type of goal"),
        target_amount: z.number().describe("Target amount or rate to achieve"),
        category_id: z
          .string()
          .optional()
          .describe("Category ID (required for 'budget' goals)"),
        target_date: z
          .string()
          .optional()
          .describe("Target date to achieve the goal (YYYY-MM-DD)"),
        entity_type: z
          .enum(["user", "household"])
          .optional()
          .describe("Whether this is a personal or household goal. Defaults to 'user'."),
        entity_id: z
          .string()
          .optional()
          .describe("Entity ID (household ID if entity_type is 'household'). Auto-resolved if omitted."),
        debt_id: z
          .string()
          .optional()
          .describe("Debt ID to link (required for 'debt_payoff' goals)"),
      },
      async (args) => {
        const { data, error } = await createGoal(ctx, args);
        if (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      }
    );
  }

  // ---------------------------------------------------------------------------
  // update_goal
  // ---------------------------------------------------------------------------
  if (allowed.has("update_goal")) {
    server.tool(
      "update_goal",
      "Update an existing financial goal by ID",
      {
        id: z.string().describe("ID of the goal to update"),
        name: z.string().optional().describe("Updated goal name"),
        goal_type: z
          .enum(["budget", "savings_amount", "savings_rate", "emergency_fund", "debt_payoff", "target_savings"])
          .optional()
          .describe("Updated goal type"),
        target_amount: z.number().optional().describe("Updated target amount"),
        current_amount: z.number().optional().describe("Updated current amount (for target_savings and emergency_fund)"),
        category_id: z.string().optional().describe("Updated category ID"),
        target_date: z.string().optional().describe("Updated target date (YYYY-MM-DD)"),
        debt_id: z.string().optional().describe("Updated linked debt ID"),
      },
      async (args) => {
        const { id, ...input } = args;
        const { data, error } = await updateGoal(ctx, id, input);
        if (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      }
    );
  }

  // ---------------------------------------------------------------------------
  // delete_goal
  // ---------------------------------------------------------------------------
  if (allowed.has("delete_goal")) {
    server.tool(
      "delete_goal",
      "Delete a financial goal by ID",
      {
        id: z.string().describe("ID of the goal to delete"),
      },
      async (args) => {
        const { error } = await deleteGoal(ctx, args.id);
        if (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
        }
        return { content: [{ type: "text" as const, text: "Goal deleted successfully." }] };
      }
    );
  }
}
