import type { Request, Response } from "express";
import { handleCallback } from "../src/auth/oauth";

// TODO: Add rate limiting for callback endpoint

/**
 * Handles the POST from the login form rendered by /authorize.
 * Authenticates the user, creates an auth code, and redirects back
 * to the MCP client's redirect_uri with the code.
 */
export default async function callback(req: Request, res: Response) {
  try {
    const { email, password, client_id, redirect_uri, code_challenge, state, scopes } =
      req.body ?? {};

    if (!email || !password || !client_id || !redirect_uri || !code_challenge) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const redirectUrl = await handleCallback({
      email,
      password,
      client_id,
      redirect_uri,
      code_challenge,
      state,
      scopes,
    });

    res.redirect(302, redirectUrl);
  } catch (error) {
    // On auth failure, show the login page again with an error.
    // In production we'd redirect back to /authorize with the error,
    // but for now render a simple error page.
    const message =
      error instanceof Error ? error.message : "Authentication failed";

    res.status(401).type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Spendoza — Error</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 2rem; width: 100%; max-width: 400px; text-align: center; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #0f172a; }
    p { color: #dc2626; margin-bottom: 1.5rem; font-size: 0.9rem; }
    a { color: #6366f1; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Authentication Failed</h1>
    <p>${escapeHtml(message)}</p>
    <a href="javascript:history.back()">Try again</a>
  </div>
</body>
</html>`);
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
