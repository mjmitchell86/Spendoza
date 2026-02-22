import crypto from "crypto";

export function generateInviteCode(): string {
  return crypto.randomBytes(4).toString("hex"); // 8-character hex string
}
