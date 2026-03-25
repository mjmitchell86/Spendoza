import { describe, it, expect } from "bun:test";
import { checkTierAccess, getToolsForTier } from "../lib/tier";

describe("checkTierAccess", () => {
  it("allows free users to access free tools", () => {
    expect(checkTierAccess("list_income", "free")).toBeNull();
    expect(checkTierAccess("get_profile", "free")).toBeNull();
    expect(checkTierAccess("create_expense", "free")).toBeNull();
  });

  it("blocks free users from starter tools", () => {
    const result = checkTierAccess("list_goals", "free");
    expect(result).toContain("starter");
  });

  it("blocks free users from pro tools", () => {
    const result = checkTierAccess("get_household_dashboard", "free");
    expect(result).toContain("pro");
  });

  it("allows starter users to access starter tools", () => {
    expect(checkTierAccess("list_goals", "starter")).toBeNull();
    expect(checkTierAccess("create_debt", "starter")).toBeNull();
  });

  it("blocks starter users from pro tools", () => {
    const result = checkTierAccess("get_household_dashboard", "starter");
    expect(result).toContain("pro");
  });

  it("allows pro users to access all tools", () => {
    expect(checkTierAccess("get_household_dashboard", "pro")).toBeNull();
    expect(checkTierAccess("list_goals", "pro")).toBeNull();
    expect(checkTierAccess("list_income", "pro")).toBeNull();
  });
});

describe("getToolsForTier", () => {
  it("returns 15 tools for free tier", () => {
    const tools = getToolsForTier("free");
    expect(tools.length).toBe(15);
    expect(tools).toContain("list_income");
    expect(tools).not.toContain("list_goals");
    expect(tools).not.toContain("get_household_dashboard");
  });

  it("returns 26 tools for starter tier", () => {
    const tools = getToolsForTier("starter");
    expect(tools.length).toBe(26);
    expect(tools).toContain("list_goals");
    expect(tools).toContain("create_debt");
    expect(tools).not.toContain("get_household_dashboard");
  });

  it("returns 27 tools for pro tier", () => {
    const tools = getToolsForTier("pro");
    expect(tools.length).toBe(27);
    expect(tools).toContain("get_household_dashboard");
  });
});
