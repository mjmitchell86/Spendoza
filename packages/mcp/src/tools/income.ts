import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServiceContext } from "@spendoza/api/src/services/context";
import {
  listIncome,
  createIncome,
  updateIncome,
  deleteIncome,
} from "@spendoza/api/src/services/income.service";

export function registerIncomeTools(
  server: McpServer,
  allowed: Set<string>,
  ctx: ServiceContext
) {
  // ---------------------------------------------------------------------------
  // list_income
  // ---------------------------------------------------------------------------
  if (allowed.has("list_income")) {
    server.tool(
      "list_income",
      "List all income entries for the current user, including attributed income from household members",
      {},
      async () => {
        const { data, error } = await listIncome(ctx);
        if (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      }
    );
  }

  // ---------------------------------------------------------------------------
  // create_income
  // ---------------------------------------------------------------------------
  if (allowed.has("create_income")) {
    server.tool(
      "create_income",
      "Create a new income entry for the current user",
      {
        source_name: z.string().describe("Name of the income source (e.g. employer name)"),
        friendly_name: z.string().optional().describe("Optional friendly display name"),
        amount: z.number().describe("Income amount in dollars"),
        frequency: z
          .enum(["one_time", "weekly", "biweekly", "monthly", "annually"])
          .describe("How often this income is received"),
        effective_date: z.string().describe("Start date (YYYY-MM-DD)"),
        end_date: z.string().optional().describe("Optional end date (YYYY-MM-DD)"),
        attributed_to_user_id: z
          .string()
          .optional()
          .describe("Optional household member ID to attribute this income to"),
        attributed_to_name: z
          .string()
          .optional()
          .describe("Optional display name of the attributed household member"),
      },
      async (args) => {
        const { data, error } = await createIncome(ctx, args);
        if (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      }
    );
  }

  // ---------------------------------------------------------------------------
  // update_income
  // ---------------------------------------------------------------------------
  if (allowed.has("update_income")) {
    server.tool(
      "update_income",
      "Update an existing income entry by ID",
      {
        id: z.string().describe("ID of the income entry to update"),
        source_name: z.string().optional().describe("Updated source name"),
        friendly_name: z.string().optional().describe("Updated friendly name"),
        amount: z.number().optional().describe("Updated amount in dollars"),
        frequency: z
          .enum(["one_time", "weekly", "biweekly", "monthly", "annually"])
          .optional()
          .describe("Updated frequency"),
        effective_date: z.string().optional().describe("Updated start date (YYYY-MM-DD)"),
        end_date: z.string().optional().describe("Updated end date (YYYY-MM-DD)"),
      },
      async (args) => {
        const { id, ...input } = args;
        const { data, error } = await updateIncome(ctx, id, input);
        if (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      }
    );
  }

  // ---------------------------------------------------------------------------
  // delete_income
  // ---------------------------------------------------------------------------
  if (allowed.has("delete_income")) {
    server.tool(
      "delete_income",
      "Delete an income entry by ID",
      {
        id: z.string().describe("ID of the income entry to delete"),
      },
      async (args) => {
        const { error } = await deleteIncome(ctx, args.id);
        if (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
        }
        return { content: [{ type: "text" as const, text: "Income entry deleted successfully." }] };
      }
    );
  }
}
