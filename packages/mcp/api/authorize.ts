import type { Request, Response } from "express";
import { authorizationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/authorize.js";
import { SpendozaOAuthProvider } from "../src/auth/oauth";

// TODO: Add rate limiting (currently handled by SDK handler defaults)
const provider = new SpendozaOAuthProvider();
const handler = authorizationHandler({
  provider,
  rateLimit: false, // Disable SDK rate-limit in serverless; use Vercel's built-in
});

export default function authorize(req: Request, res: Response) {
  handler(req, res, () => {
    res.status(404).json({ error: "Not found" });
  });
}
