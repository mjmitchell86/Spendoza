import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SubscriptionTier } from "@spendoza/shared";
import { getToolsForTier } from "./lib/tier";

/**
 * Creates an MCP server instance configured for the given user tier.
 *
 * Returns the server and the set of tool names available to this user.
 * Tool registration for real tools happens in Tasks 20-22; for now we
 * register only a health-check tool that every tier can access.
 */
export function createMcpServer(userTier: SubscriptionTier) {
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
  // Tool registration will be added in Tasks 20-22:
  //   - Task 20: Free tier tools (profile, dashboard, income, expenses, etc.)
  //   - Task 21: Starter tier tools (goals, debts)
  //   - Task 22: Pro tier tools (household dashboard)
  // -----------------------------------------------------------------------

  return { server, allowedTools };
}
