import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServiceContext } from "@spendoza/api/src/services/context";
import {
  listBankStatements,
  getBankStatement,
} from "@spendoza/api/src/services/bank-statement.service";

export function registerBankStatementTools(
  server: McpServer,
  allowed: Set<string>,
  ctx: ServiceContext
) {
  // ---------------------------------------------------------------------------
  // list_bank_statements
  // ---------------------------------------------------------------------------
  if (allowed.has("list_bank_statements")) {
    server.tool(
      "list_bank_statements",
      "List all uploaded bank statements for the current user, ordered by most recent first",
      {},
      async () => {
        const { data, error } = await listBankStatements(ctx);
        if (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      }
    );
  }

  // ---------------------------------------------------------------------------
  // get_bank_statement
  // ---------------------------------------------------------------------------
  if (allowed.has("get_bank_statement")) {
    server.tool(
      "get_bank_statement",
      "Get a specific bank statement by ID, including its parsed transactions",
      {
        id: z.string().describe("ID of the bank statement to retrieve"),
      },
      async (args) => {
        const result = await getBankStatement(ctx, args.id);
        if (result.error) {
          return { content: [{ type: "text" as const, text: `Error: ${result.error.message}` }] };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { statement: result.statement, transactions: result.transactions },
                null,
                2
              ),
            },
          ],
        };
      }
    );
  }
}
