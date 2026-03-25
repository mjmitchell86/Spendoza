import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServiceContext } from "@spendoza/api/src/services/context";
import { listCategories } from "@spendoza/api/src/services/category.service";

export function registerCategoryTools(
  server: McpServer,
  allowed: Set<string>,
  ctx: ServiceContext
) {
  if (allowed.has("list_categories")) {
    server.tool(
      "list_categories",
      "List all expense categories available to the current user, including system defaults and custom categories",
      {},
      async () => {
        const { data, error } = await listCategories(ctx);
        if (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      }
    );
  }
}
