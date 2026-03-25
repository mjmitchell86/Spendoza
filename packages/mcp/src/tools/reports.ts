import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServiceContext } from "@spendoza/api/src/services/context";
import { getReport } from "@spendoza/api/src/services/report.service";
import { currentMonthStr } from "@spendoza/api/src/services/dashboard.service";

export function registerReportTools(
  server: McpServer,
  allowed: Set<string>,
  ctx: ServiceContext
) {
  if (allowed.has("get_report")) {
    server.tool(
      "get_report",
      "Get the personal financial report for a given month, including detailed breakdowns, AI insights, health score, and allocation analysis. Defaults to the current month.",
      {
        month: z
          .string()
          .optional()
          .describe("Report month (YYYY-MM-DD, first of month, e.g. 2026-03-01). Defaults to current month."),
      },
      async (args) => {
        const month = args.month ?? currentMonthStr();
        const { data, error } = await getReport(ctx, "user", ctx.userId, month);
        if (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
        }
        if (!data) {
          return {
            content: [
              { type: "text" as const, text: `No report found for month ${month}. A report is generated after uploading bank statements.` },
            ],
          };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      }
    );
  }
}
