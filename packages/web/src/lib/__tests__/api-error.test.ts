import { describe, it, expect } from "bun:test";
import { ApiError, errorText } from "../api-error";

describe("errorText", () => {
  it("shows the server's message", () => {
    expect(errorText(new ApiError("Expense not found", 404, null), "Failed to delete expense")).toBe("Expense not found");
  });

  it("falls back when there is no message", () => {
    expect(errorText(new Error(""), "Failed to delete expense")).toBe("Failed to delete expense");
    expect(errorText("boom", "Failed to delete expense")).toBe("Failed to delete expense");
  });
});
