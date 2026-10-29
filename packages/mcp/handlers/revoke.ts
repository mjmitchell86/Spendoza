import type { Request, Response } from "express";
import { revocationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/revoke.js";
import { SpendozaOAuthProvider } from "../src/auth/oauth";

// RFC 7009 token revocation. Revoking an access or refresh token ends the
// Supabase session it belongs to (see SpendozaOAuthProvider.revokeToken).
const provider = new SpendozaOAuthProvider();
const handler = revocationHandler({
  provider,
  rateLimit: false, // Disable SDK rate-limit in serverless; use Vercel's built-in
});

export default function revoke(req: Request, res: Response) {
  handler(req, res, () => {
    res.status(404).json({ error: "Not found" });
  });
}
