import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServiceContext } from "@spendoza/api/src/services/context";
import {
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
} from "@spendoza/api/src/services/expense.service";

export function registerExpenseTools(
  server: McpServer,
  allowed: Set<string>,
  ctx: ServiceContext
) {
  // ---------------------------------------------------------------------------
  // list_expenses
  // ---------------------------------------------------------------------------
  if (allowed.has("list_expenses")) {
    server.tool(
      "list_expenses",
      "List expenses for the current user with optional filters for category, frequency, and date range",
      {
        category_id: z.string().optional().describe("Filter by category ID"),
        frequency: z
          .enum(["one_time", "recurring"])
          .optional()
          .describe("Filter by frequency type"),
        from_date: z.string().optional().describe("Filter expenses due on or after this date (YYYY-MM-DD)"),
        to_date: z.string().optional().describe("Filter expenses due on or before this date (YYYY-MM-DD)"),
      },
      async (args) => {
        const { data, error } = await listExpenses(ctx, args);
        if (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      }
    );
  }

  // ---------------------------------------------------------------------------
  // create_expense
  // ---------------------------------------------------------------------------
  if (allowed.has("create_expense")) {
    server.tool(
      "create_expense",
      "Create a new expense (bill or one-time) for the current user",
      {
        category_id: z.string().describe("Category ID for this expense"),
        description: z.string().describe("Description of the expense"),
        friendly_name: z.string().optional().describe("Optional friendly display name"),
        amount: z.number().describe("Expense amount in dollars"),
        frequency: z
          .enum(["one_time", "recurring"])
          .describe("Whether this is a one-time or recurring expense"),
        recurrence_interval: z
          .enum(["weekly", "biweekly", "monthly", "quarterly", "annually"])
          .optional()
          .describe("Recurrence interval (required if frequency is 'recurring')"),
        next_due_date: z.string().describe("Next due date (YYYY-MM-DD)"),
        end_date: z.string().optional().describe("Optional end date (YYYY-MM-DD)"),
      },
      async (args) => {
        const { data, error } = await createExpense(ctx, args);
        if (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      }
    );
  }

  // ---------------------------------------------------------------------------
  // update_expense
  // ---------------------------------------------------------------------------
  if (allowed.has("update_expense")) {
    server.tool(
      "update_expense",
      "Update an existing expense by ID",
      {
        id: z.string().describe("ID of the expense to update"),
        category_id: z.string().optional().describe("Updated category ID"),
        description: z.string().optional().describe("Updated description"),
        friendly_name: z.string().optional().describe("Updated friendly name"),
        amount: z.number().optional().describe("Updated amount in dollars"),
        frequency: z
          .enum(["one_time", "recurring"])
          .optional()
          .describe("Updated frequency"),
        recurrence_interval: z
          .enum(["weekly", "biweekly", "monthly", "quarterly", "annually"])
          .optional()
          .describe("Updated recurrence interval"),
        next_due_date: z.string().optional().describe("Updated next due date (YYYY-MM-DD)"),
        end_date: z.string().optional().describe("Updated end date (YYYY-MM-DD)"),
      },
      async (args) => {
        const { id, ...input } = args;
        const { data, error } = await updateExpense(ctx, id, input);
        if (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      }
    );
  }

  // ---------------------------------------------------------------------------
  // delete_expense
  // ---------------------------------------------------------------------------
  if (allowed.has("delete_expense")) {
    server.tool(
      "delete_expense",
      "Delete an expense by ID",
      {
        id: z.string().describe("ID of the expense to delete"),
      },
      async (args) => {
        const { error } = await deleteExpense(ctx, args.id);
        if (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
        }
        return { content: [{ type: "text" as const, text: "Expense deleted successfully." }] };
      }
    );
  }
}
