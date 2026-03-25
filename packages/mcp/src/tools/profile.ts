import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServiceContext } from "@spendoza/api/src/services/context";
import { getProfile } from "@spendoza/api/src/services/profile.service";

export function registerProfileTools(
  server: McpServer,
  allowed: Set<string>,
  ctx: ServiceContext
) {
  if (allowed.has("get_profile")) {
    server.tool(
      "get_profile",
      "Get the current user's profile including display name, email, household membership, and subscription tier",
      {},
      async () => {
        const { data, error } = await getProfile(ctx);
        if (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      }
    );
  }
}
