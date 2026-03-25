import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServiceContext } from "@spendoza/api/src/services/context";
import {
  getPersonalDashboardForMonth,
  getPersonalDashboardForRange,
  getHouseholdDashboardForMonth,
  getHouseholdDashboardForRange,
  currentMonthStr,
} from "@spendoza/api/src/services/dashboard.service";

export function registerDashboardTools(
  server: McpServer,
  allowed: Set<string>,
  ctx: ServiceContext
) {
  // ---------------------------------------------------------------------------
  // get_dashboard (personal) — free tier
  // ---------------------------------------------------------------------------
  if (allowed.has("get_dashboard")) {
    server.tool(
      "get_dashboard",
      "Get the personal financial dashboard showing income, expenses, savings rate, and spending by category. Provide a month for a specific month view, or from/to dates for a custom range. Defaults to the current month.",
      {
        month: z
          .string()
          .optional()
          .describe("Month to view (YYYY-MM-DD, first of month, e.g. 2026-03-01). Ignored if from/to are provided."),
        from: z
          .string()
          .optional()
          .describe("Start date for custom range (YYYY-MM-DD)"),
        to: z
          .string()
          .optional()
          .describe("End date for custom range (YYYY-MM-DD)"),
      },
      async (args) => {
        try {
          let dashboard;
          if (args.from || args.to) {
            dashboard = await getPersonalDashboardForRange(ctx, args.from, args.to);
          } else {
            const month = args.month ?? currentMonthStr();
            dashboard = await getPersonalDashboardForMonth(ctx, month);
          }
          return { content: [{ type: "text" as const, text: JSON.stringify(dashboard, null, 2) }] };
        } catch (err: any) {
          return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
        }
      }
    );
  }

  // ---------------------------------------------------------------------------
  // get_household_dashboard — pro tier
  // ---------------------------------------------------------------------------
  if (allowed.has("get_household_dashboard")) {
    server.tool(
      "get_household_dashboard",
      "Get the household financial dashboard showing combined income, expenses, savings rate, spending by category, and individual member contributions. Requires Pro tier and household membership. Provide a month for a specific month view, or from/to dates for a custom range. Defaults to the current month.",
      {
        month: z
          .string()
          .optional()
          .describe("Month to view (YYYY-MM-DD, first of month, e.g. 2026-03-01). Ignored if from/to are provided."),
        from: z
          .string()
          .optional()
          .describe("Start date for custom range (YYYY-MM-DD)"),
        to: z
          .string()
          .optional()
          .describe("End date for custom range (YYYY-MM-DD)"),
      },
      async (args) => {
        try {
          // Resolve household ID from user profile
          const { data: profile } = await ctx.supabase
            .from("profiles")
            .select("household_id")
            .eq("id", ctx.userId)
            .single();

          if (!profile?.household_id) {
            return {
              content: [{ type: "text" as const, text: "Error: You are not a member of any household" }],
            };
          }

          let dashboard;
          if (args.from || args.to) {
            dashboard = await getHouseholdDashboardForRange(
              ctx,
              profile.household_id,
              args.from,
              args.to
            );
          } else {
            const month = args.month ?? currentMonthStr();
            dashboard = await getHouseholdDashboardForMonth(
              ctx,
              profile.household_id,
              month
            );
          }
          return { content: [{ type: "text" as const, text: JSON.stringify(dashboard, null, 2) }] };
        } catch (err: any) {
          return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
        }
      }
    );
  }
}
