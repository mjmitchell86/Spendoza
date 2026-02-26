import { createHmac, timingSafeEqual } from "crypto";

const MAX_TOKEN_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getSecret(): string {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) throw new Error("UNSUBSCRIBE_SECRET env var not set");
  return secret;
}

export function createUnsubscribeToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, ts: Date.now() })).toString("base64url");
  const signature = createHmac("sha256", getSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyUnsubscribeToken(
  token: string
): { valid: true; userId: string } | { valid: false } {
  try {
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return { valid: false };

    const expectedSig = createHmac("sha256", getSecret()).update(payload).digest("base64url");

    // Timing-safe comparison to prevent timing attacks
    const sigBuf = Buffer.from(signature, "base64url");
    const expectedBuf = Buffer.from(expectedSig, "base64url");
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return { valid: false };
    }

    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!data.uid) return { valid: false };

    // Reject expired tokens (30 days)
    if (typeof data.ts === "number" && Date.now() - data.ts > MAX_TOKEN_AGE_MS) {
      return { valid: false };
    }

    return { valid: true, userId: data.uid };
  } catch {
    return { valid: false };
  }
}
