import { describe, it, expect } from "bun:test";
import { generateReportRequest, categoryDeleteMessage } from "../category-report-copy";

describe("generateReportRequest", () => {
  it("sends the month as the body", () => {
    expect(generateReportRequest("2026-09-01")).toEqual({
      method: "POST",
      body: JSON.stringify({ month: "2026-09-01" }),
    });
  });

  it("sends no body without a month", () => {
    expect(generateReportRequest()).toEqual({ method: "POST" });
    expect(generateReportRequest(undefined)).not.toHaveProperty("body");
  });
});

describe("categoryDeleteMessage", () => {
  it("uses the agreed wording with curly quotes", () => {
    expect(categoryDeleteMessage("Coffee")).toBe(
      "Are you sure you want to delete “Coffee”? Its transactions become uncategorized and its bills move to Other."
    );
  });
});
