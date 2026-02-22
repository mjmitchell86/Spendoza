import crypto from "crypto";

/**
 * Computes a SHA-256 hash of the given file buffer.
 * Used to detect duplicate bank statement uploads.
 */
export function computeFileHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
