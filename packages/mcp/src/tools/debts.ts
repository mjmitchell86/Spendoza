import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServiceContext } from "@spendoza/api/src/services/context";
import {
  listDebts,
  createDebt,
  updateDebt,
  deleteDebt,
  getDebtProjections,
} from "@spendoza/api/src/services/debt.service";

export function registerDebtTools(
  server: McpServer,
  allowed: Set<string>,
  ctx: ServiceContext
) {
  // ---------------------------------------------------------------------------
  // list_debts
  // ---------------------------------------------------------------------------
  if (allowed.has("list_debts")) {
    server.tool(
      "list_debts",
      "List all debts (credit cards, loans, etc.) for the current user or household",
      {
        entity_type: z
          .enum(["user", "household"])
          .optional()
          .describe("Filter by entity type. Defaults to personal ('user') debts."),
      },
      async (args) => {
        const { data, error } = await listDebts(ctx, args.entity_type);
        if (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      }
    );
  }

  // ---------------------------------------------------------------------------
  // get_debt_projections
  // ---------------------------------------------------------------------------
  if (allowed.has("get_debt_projections")) {
    server.tool(
      "get_debt_projections",
      "Get debt payoff projections including individual debt timelines, plus avalanche and snowball strategy comparisons. Optionally specify extra monthly payment to see accelerated payoff.",
      {
        entity_type: z
          .enum(["user", "household"])
          .optional()
          .describe("Entity type. Defaults to personal ('user') debts."),
        extra_payment: z
          .number()
          .optional()
          .describe("Extra monthly payment amount in dollars to apply toward debt payoff strategies"),
      },
      async (args) => {
        const { data, error } = await getDebtProjections(ctx, args.entity_type, args.extra_payment);
        if (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      }
    );
  }

  // ---------------------------------------------------------------------------
  // create_debt
  // ---------------------------------------------------------------------------
  if (allowed.has("create_debt")) {
    server.tool(
      "create_debt",
      "Add a new debt to track (credit card, student loan, mortgage, auto loan, personal loan, medical, or other)",
      {
        name: z.string().describe("Name of the debt (e.g. 'Chase Visa', 'Student Loan')"),
        debt_type: z
          .enum(["credit_card", "student_loan", "mortgage", "auto_loan", "personal_loan", "medical", "other"])
          .describe("Type of debt"),
        original_balance: z.number().describe("Original balance when the debt was taken on"),
        current_balance: z.number().describe("Current remaining balance"),
        interest_rate: z.number().default(0).describe("Annual interest rate as a percentage (e.g. 18.99). Defaults to 0."),
        minimum_payment: z.number().default(0).describe("Monthly minimum payment amount. Defaults to 0."),
        due_date_day: z.number().optional().describe("Day of month the payment is due (1-31)"),
        linked_category_id: z.string().optional().describe("Category ID to link for payment tracking"),
        entity_type: z
          .enum(["user", "household"])
          .optional()
          .describe("Whether this is a personal or household debt. Defaults to 'user'."),
      },
      async (args) => {
        const { data, error } = await createDebt(ctx, args);
        if (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      }
    );
  }

  // ---------------------------------------------------------------------------
  // update_debt
  // ---------------------------------------------------------------------------
  if (allowed.has("update_debt")) {
    server.tool(
      "update_debt",
      "Update an existing debt by ID (e.g. update current balance after a payment)",
      {
        id: z.string().describe("ID of the debt to update"),
        name: z.string().optional().describe("Updated debt name"),
        debt_type: z
          .enum(["credit_card", "student_loan", "mortgage", "auto_loan", "personal_loan", "medical", "other"])
          .optional()
          .describe("Updated debt type"),
        original_balance: z.number().optional().describe("Updated original balance"),
        current_balance: z.number().optional().describe("Updated current balance"),
        interest_rate: z.number().optional().describe("Updated annual interest rate"),
        minimum_payment: z.number().optional().describe("Updated monthly minimum payment"),
        due_date_day: z.number().optional().describe("Updated due date day (1-31)"),
        linked_category_id: z.string().optional().describe("Updated linked category ID"),
      },
      async (args) => {
        const { id, ...input } = args;
        const { data, error } = await updateDebt(ctx, id, input);
        if (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      }
    );
  }

  // ---------------------------------------------------------------------------
  // delete_debt
  // ---------------------------------------------------------------------------
  if (allowed.has("delete_debt")) {
    server.tool(
      "delete_debt",
      "Delete a debt by ID",
      {
        id: z.string().describe("ID of the debt to delete"),
      },
      async (args) => {
        const { error } = await deleteDebt(ctx, args.id);
        if (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
        }
        return { content: [{ type: "text" as const, text: "Debt deleted successfully." }] };
      }
    );
  }
}
