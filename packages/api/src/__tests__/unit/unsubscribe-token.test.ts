import { describe, it, expect, beforeEach } from "bun:test";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "../../lib/unsubscribe-token";

describe("unsubscribe-token", () => {
  beforeEach(() => {
    process.env.UNSUBSCRIBE_SECRET = "test-secret-key-at-least-32-chars-long!!";
  });

  it("creates and verifies a valid token", () => {
    const token = createUnsubscribeToken("user-123");
    const result = verifyUnsubscribeToken(token);
    expect(result).toEqual({ valid: true, userId: "user-123" });
  });

  it("rejects a tampered token", () => {
    const token = createUnsubscribeToken("user-123");
    const tampered = token.slice(0, -5) + "xxxxx";
    const result = verifyUnsubscribeToken(tampered);
    expect(result.valid).toBe(false);
  });

  it("rejects a completely invalid token", () => {
    const result = verifyUnsubscribeToken("not-a-real-token");
    expect(result.valid).toBe(false);
  });
});
