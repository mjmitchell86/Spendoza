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

  it("rejects an expired token (>30 days old)", () => {
    // Create a token with a timestamp 31 days in the past
    const { createHmac } = require("crypto");
    const oldTs = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const payload = Buffer.from(JSON.stringify({ uid: "user-123", ts: oldTs })).toString("base64url");
    const signature = createHmac("sha256", process.env.UNSUBSCRIBE_SECRET!).update(payload).digest("base64url");
    const expiredToken = `${payload}.${signature}`;

    const result = verifyUnsubscribeToken(expiredToken);
    expect(result.valid).toBe(false);
  });
});
