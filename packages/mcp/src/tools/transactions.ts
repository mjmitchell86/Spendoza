import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServiceContext } from "@spendoza/api/src/services/context";
import { listTransactions } from "@spendoza/api/src/services/transaction.service";

export function registerTransactionTools(
  server: McpServer,
  allowed: Set<string>,
  ctx: ServiceContext
) {
  if (allowed.has("list_transactions")) {
    server.tool(
      "list_transactions",
      "List bank transactions for the current user with optional filters for statement, date range, and type",
      {
        bank_statement_id: z
          .string()
          .optional()
          .describe("Filter by bank statement ID"),
        from_date: z
          .string()
          .optional()
          .describe("Filter transactions on or after this date (YYYY-MM-DD)"),
        to_date: z
          .string()
          .optional()
          .describe("Filter transactions on or before this date (YYYY-MM-DD)"),
        type: z
          .enum(["credit", "debit"])
          .optional()
          .describe("Filter by transaction type (credit or debit)"),
      },
      async (args) => {
        const { data, error } = await listTransactions(ctx, args);
        if (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      }
    );
  }
}
