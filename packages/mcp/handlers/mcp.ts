import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createSessionFromToken } from "../src/auth/session";
import { getUserTier } from "../src/auth/session";
import { createMcpServer } from "../src/server";
import { SpendozaOAuthProvider } from "../src/auth/oauth";

const oauthProvider = new SpendozaOAuthProvider();

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

function setCorsHeaders(res: ServerResponse): void {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(key, value);
  }
}

// ---------------------------------------------------------------------------
// Auth helper — extract and verify Bearer token
// ---------------------------------------------------------------------------

async function extractAuthInfo(req: IncomingMessage) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  try {
    return await oauthProvider.verifyAccessToken(token);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Vercel serverless handler
// ---------------------------------------------------------------------------

/**
 * MCP protocol entry point.
 *
 * Because Vercel serverless functions are stateless, we run in stateless mode:
 *   - Each request creates a fresh transport + server pair
 *   - No session ID is generated or validated
 *   - enableJsonResponse is on so the full response is returned in a single
 *     HTTP response body (no long-lived SSE required)
 *
 * The flow per request:
 *   1. Handle CORS preflight
 *   2. Verify the Bearer token
 *   3. Look up the user's subscription tier
 *   4. Create a tier-scoped MCP server
 *   5. Create a stateless StreamableHTTP transport
 *   6. Connect server <-> transport
 *   7. Let the transport handle the HTTP request
 */
export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse
) {
  setCorsHeaders(res);

  // ---- Preflight ----
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // ---- Auth ----
  const authInfo = await extractAuthInfo(req);
  if (!authInfo) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized — missing or invalid Bearer token" }));
    return;
  }

  // ---- User context ----
  const userId = authInfo.extra?.userId as string | undefined;
  if (!userId) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized — could not resolve user" }));
    return;
  }

  const userTier = await getUserTier(userId);

  // ---- Build ServiceContext for tool handlers ----
  const serviceCtx = await createSessionFromToken(authInfo.token);
  if (!serviceCtx) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized — could not create service context" }));
    return;
  }

  // ---- MCP server + transport ----
  const { server } = createMcpServer(userTier, serviceCtx);

  const transport = new StreamableHTTPServerTransport({
    // Stateless: no session ID tracking (serverless-friendly)
    sessionIdGenerator: undefined,
    // Return full JSON responses instead of SSE streams
    enableJsonResponse: true,
  });

  // Wire the server to this transport
  await server.connect(transport);

  try {
    // Delegate to the transport — it reads the request body, processes the
    // JSON-RPC message(s), invokes the server, and writes the response.
    await transport.handleRequest(
      // Attach the auth info so the SDK can pass it through to handlers
      Object.assign(req, { auth: authInfo }),
      res,
      // If Vercel's body parser already parsed the body, pass it through
      req.body
    );
  } finally {
    // Clean up the per-request server + transport
    await server.close();
    await transport.close();
  }
}
