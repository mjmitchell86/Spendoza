import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SubscriptionTier } from "@spendoza/shared";
import type { ServiceContext } from "@spendoza/api/src/services/context";
import { getToolsForTier } from "./lib/tier";

// Tool registration imports
import { registerProfileTools } from "./tools/profile";
import { registerIncomeTools } from "./tools/income";
import { registerExpenseTools } from "./tools/expenses";
import { registerCategoryTools } from "./tools/categories";
import { registerTransactionTools } from "./tools/transactions";
import { registerBankStatementTools } from "./tools/bank-statements";
import { registerDashboardTools } from "./tools/dashboard";
import { registerReportTools } from "./tools/reports";
import { registerGoalTools } from "./tools/goals";
import { registerDebtTools } from "./tools/debts";

/**
 * Creates an MCP server instance configured for the given user tier.
 *
 * Returns the server and the set of tool names available to this user.
 * Each tool registration function conditionally registers tools based on
 * whether they are in the allowedTools set for the user's tier.
 */
export function createMcpServer(userTier: SubscriptionTier, ctx: ServiceContext) {
  const server = new McpServer({
    name: "Spendoza",
    version: "1.0.0",
  });

  const allowedTools = new Set(getToolsForTier(userTier));

  // -----------------------------------------------------------------------
  // Health check — always available regardless of tier
  // -----------------------------------------------------------------------
  server.tool("health", "Check MCP server health", {}, async () => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ status: "ok", tier: userTier }),
        },
      ],
    };
  });

  // -----------------------------------------------------------------------
  // Free tier tools
  // -----------------------------------------------------------------------
  registerProfileTools(server, allowedTools, ctx);
  registerIncomeTools(server, allowedTools, ctx);
  registerExpenseTools(server, allowedTools, ctx);
  registerCategoryTools(server, allowedTools, ctx);
  registerTransactionTools(server, allowedTools, ctx);
  registerBankStatementTools(server, allowedTools, ctx);
  registerDashboardTools(server, allowedTools, ctx); // includes pro tier get_household_dashboard
  registerReportTools(server, allowedTools, ctx);

  // -----------------------------------------------------------------------
  // Starter tier tools
  // -----------------------------------------------------------------------
  registerGoalTools(server, allowedTools, ctx);
  registerDebtTools(server, allowedTools, ctx);

  return { server, allowedTools };
}
