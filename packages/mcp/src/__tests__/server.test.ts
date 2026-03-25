import { describe, it, expect, mock } from "bun:test";

// Mock Supabase before importing server — prevents module-level createClient calls
// in packages/mcp/src/lib/supabase.ts from failing due to missing env vars.
mock.module("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: {}, error: null }),
        }),
      }),
    }),
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    },
  }),
}));

const { createMcpServer } = await import("../server");

const mockCtx = {
  supabase: {} as any,
  supabaseAdmin: {} as any,
  userId: "user-123",
  email: "test@example.com",
};

describe("MCP Server", () => {
  describe("createMcpServer — free tier", () => {
    it("returns a server and allowedTools without throwing", () => {
      expect(() => createMcpServer("free", mockCtx)).not.toThrow();
    });

    it("has 15 allowed tools (excludes goal/debt/household)", () => {
      const { allowedTools } = createMcpServer("free", mockCtx);
      expect(allowedTools.size).toBe(15);
    });

    it("includes free-tier tools", () => {
      const { allowedTools } = createMcpServer("free", mockCtx);
      expect(allowedTools.has("list_income")).toBe(true);
      expect(allowedTools.has("get_profile")).toBe(true);
      expect(allowedTools.has("get_dashboard")).toBe(true);
      expect(allowedTools.has("list_expenses")).toBe(true);
      expect(allowedTools.has("list_categories")).toBe(true);
      expect(allowedTools.has("list_transactions")).toBe(true);
      expect(allowedTools.has("get_report")).toBe(true);
      expect(allowedTools.has("list_bank_statements")).toBe(true);
    });

    it("excludes starter-tier goal tools", () => {
      const { allowedTools } = createMcpServer("free", mockCtx);
      expect(allowedTools.has("list_goals")).toBe(false);
      expect(allowedTools.has("create_goal")).toBe(false);
      expect(allowedTools.has("update_goal")).toBe(false);
      expect(allowedTools.has("delete_goal")).toBe(false);
      expect(allowedTools.has("get_goal_progress")).toBe(false);
      expect(allowedTools.has("get_goal_suggestions")).toBe(false);
    });

    it("excludes starter-tier debt tools", () => {
      const { allowedTools } = createMcpServer("free", mockCtx);
      expect(allowedTools.has("list_debts")).toBe(false);
      expect(allowedTools.has("create_debt")).toBe(false);
      expect(allowedTools.has("update_debt")).toBe(false);
      expect(allowedTools.has("delete_debt")).toBe(false);
      expect(allowedTools.has("get_debt_projections")).toBe(false);
    });

    it("excludes pro-tier household dashboard", () => {
      const { allowedTools } = createMcpServer("free", mockCtx);
      expect(allowedTools.has("get_household_dashboard")).toBe(false);
    });
  });

  describe("MCP Server — starter tier", () => {
    it("returns a server and allowedTools without throwing", () => {
      expect(() => createMcpServer("starter", mockCtx)).not.toThrow();
    });

    it("has 26 allowed tools", () => {
      const { allowedTools } = createMcpServer("starter", mockCtx);
      expect(allowedTools.size).toBe(26);
    });

    it("includes goal tools", () => {
      const { allowedTools } = createMcpServer("starter", mockCtx);
      expect(allowedTools.has("list_goals")).toBe(true);
      expect(allowedTools.has("create_goal")).toBe(true);
      expect(allowedTools.has("update_goal")).toBe(true);
      expect(allowedTools.has("delete_goal")).toBe(true);
      expect(allowedTools.has("get_goal_progress")).toBe(true);
      expect(allowedTools.has("get_goal_suggestions")).toBe(true);
    });

    it("includes debt tools", () => {
      const { allowedTools } = createMcpServer("starter", mockCtx);
      expect(allowedTools.has("list_debts")).toBe(true);
      expect(allowedTools.has("create_debt")).toBe(true);
      expect(allowedTools.has("update_debt")).toBe(true);
      expect(allowedTools.has("delete_debt")).toBe(true);
      expect(allowedTools.has("get_debt_projections")).toBe(true);
    });

    it("excludes pro-tier household dashboard", () => {
      const { allowedTools } = createMcpServer("starter", mockCtx);
      expect(allowedTools.has("get_household_dashboard")).toBe(false);
    });
  });

  describe("MCP Server — pro tier", () => {
    it("returns a server and allowedTools without throwing", () => {
      expect(() => createMcpServer("pro", mockCtx)).not.toThrow();
    });

    it("has 27 allowed tools", () => {
      const { allowedTools } = createMcpServer("pro", mockCtx);
      expect(allowedTools.size).toBe(27);
    });

    it("includes pro-tier household dashboard", () => {
      const { allowedTools } = createMcpServer("pro", mockCtx);
      expect(allowedTools.has("get_household_dashboard")).toBe(true);
    });

    it("includes all goal and debt tools", () => {
      const { allowedTools } = createMcpServer("pro", mockCtx);
      expect(allowedTools.has("list_goals")).toBe(true);
      expect(allowedTools.has("list_debts")).toBe(true);
      expect(allowedTools.has("create_debt")).toBe(true);
    });
  });
});
