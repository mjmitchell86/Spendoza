import type { Response } from "express";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { supabaseAdmin, createSupabaseClient } from "../lib/supabase";

// ---------------------------------------------------------------------------
// Clients Store — backed by the `mcp_clients` Supabase table
// ---------------------------------------------------------------------------

export class SupabaseClientsStore implements OAuthRegisteredClientsStore {
  async getClient(
    clientId: string
  ): Promise<OAuthClientInformationFull | undefined> {
    const { data, error } = await supabaseAdmin
      .from("mcp_clients")
      .select("client_data")
      .eq("client_id", clientId)
      .maybeSingle();

    if (error || !data) return undefined;
    return data.client_data as OAuthClientInformationFull;
  }

  async registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">
  ): Promise<OAuthClientInformationFull> {
    const clientId = crypto.randomUUID();
    const full: OAuthClientInformationFull = {
      ...client,
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };

    const { error } = await supabaseAdmin.from("mcp_clients").insert({
      client_id: clientId,
      client_data: full,
    });

    if (error) throw new Error(`Failed to register client: ${error.message}`);
    return full;
  }
}

// ---------------------------------------------------------------------------
// Login page HTML — rendered by the authorize flow
// ---------------------------------------------------------------------------

function loginPageHtml(
  clientId: string,
  redirectUri: string,
  codeChallenge: string,
  state?: string,
  scopes?: string[]
): string {
  const baseUrl = process.env.MCP_BASE_URL || "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Spendoza — Sign In</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 2rem; width: 100%; max-width: 400px; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #0f172a; }
    p { color: #64748b; margin-bottom: 1.5rem; font-size: 0.9rem; }
    label { display: block; margin-bottom: 0.25rem; font-size: 0.875rem; font-weight: 500; color: #334155; }
    input[type="email"], input[type="password"] { width: 100%; padding: 0.625rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 1rem; margin-bottom: 1rem; }
    input:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
    button { width: 100%; padding: 0.75rem; background: #6366f1; color: white; border: none; border-radius: 6px; font-size: 1rem; font-weight: 500; cursor: pointer; }
    button:hover { background: #4f46e5; }
    .error { color: #dc2626; font-size: 0.85rem; margin-bottom: 1rem; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Spendoza</h1>
    <p>Sign in to connect your account</p>
    <div class="error" id="error"></div>
    <form method="POST" action="${baseUrl}/callback">
      <input type="hidden" name="client_id" value="${escapeHtml(clientId)}">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}">
      <input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge)}">
      <input type="hidden" name="state" value="${escapeHtml(state ?? "")}">
      <input type="hidden" name="scopes" value="${escapeHtml(scopes?.join(" ") ?? "")}">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required autocomplete="email">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" required autocomplete="current-password">
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ---------------------------------------------------------------------------
// OAuth Server Provider — implements the MCP SDK interface
// ---------------------------------------------------------------------------

export class SpendozaOAuthProvider implements OAuthServerProvider {
  private _clientsStore = new SupabaseClientsStore();

  get clientsStore(): OAuthRegisteredClientsStore {
    return this._clientsStore;
  }

  /**
   * Renders a login HTML page. The form POSTs to /callback which handles
   * authentication and redirect.
   */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    const html = loginPageHtml(
      client.client_id,
      params.redirectUri,
      params.codeChallenge,
      params.state,
      params.scopes
    );
    res.status(200).type("html").send(html);
  }

  /**
   * Called by the SDK token handler to retrieve the PKCE code_challenge
   * stored when the auth code was created.
   */
  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from("mcp_auth_codes")
      .select("code_challenge")
      .eq("code", authorizationCode)
      .eq("used", false)
      .maybeSingle();

    if (error || !data) {
      throw new Error("Invalid or expired authorization code");
    }

    return data.code_challenge;
  }

  /**
   * Exchanges an auth code for Supabase access + refresh tokens.
   * The auth code was stored in `mcp_auth_codes` by the /callback handler.
   */
  async exchangeAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<OAuthTokens> {
    // Look up the stored auth code
    const { data, error } = await supabaseAdmin
      .from("mcp_auth_codes")
      .select("*")
      .eq("code", authorizationCode)
      .eq("used", false)
      .maybeSingle();

    if (error || !data) {
      throw new Error("Invalid or expired authorization code");
    }

    // Check expiry (codes valid for 10 minutes)
    const createdAt = new Date(data.created_at).getTime();
    if (Date.now() - createdAt > 10 * 60 * 1000) {
      await supabaseAdmin
        .from("mcp_auth_codes")
        .update({ used: true })
        .eq("code", authorizationCode);
      throw new Error("Authorization code has expired");
    }

    // Mark as used
    await supabaseAdmin
      .from("mcp_auth_codes")
      .update({ used: true })
      .eq("code", authorizationCode);

    return {
      access_token: data.access_token,
      token_type: "Bearer",
      refresh_token: data.refresh_token ?? undefined,
      expires_in: data.expires_in ?? 3600,
    };
  }

  /**
   * Refreshes a Supabase session using the refresh token.
   */
  async exchangeRefreshToken(
    _client: OAuthClientInformationFull,
    refreshToken: string
  ): Promise<OAuthTokens> {
    // Use an anonymous Supabase client to refresh the session
    const anonClient = createSupabaseClient("");
    const { data, error } = await anonClient.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      throw new Error("Failed to refresh session");
    }

    return {
      access_token: data.session.access_token,
      token_type: "Bearer",
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
    };
  }

  /**
   * Verifies a Supabase JWT and returns AuthInfo for the MCP SDK.
   */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      throw new Error("Invalid access token");
    }

    return {
      token,
      clientId: "supabase",
      scopes: [],
      extra: {
        userId: user.id,
        email: user.email,
      },
    };
  }

  /**
   * Revokes a token. For Supabase JWTs there isn't a built-in revocation
   * mechanism, but we can sign out the user server-side.
   */
  async revokeToken(
    _client: OAuthClientInformationFull,
    _request: OAuthTokenRevocationRequest
  ): Promise<void> {
    // Supabase JWTs are stateless — no revocation mechanism.
    // Intentionally a no-op; the token will expire naturally.
  }
}

// ---------------------------------------------------------------------------
// handleCallback — processes the login form POST from the authorize page
// ---------------------------------------------------------------------------

export interface CallbackParams {
  email: string;
  password: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  state?: string;
  scopes?: string;
}

/**
 * Authenticates the user with Supabase, generates an auth code,
 * stores it with the PKCE challenge, and redirects to the client.
 */
export async function handleCallback(params: CallbackParams): Promise<string> {
  const { email, password, client_id, redirect_uri, code_challenge, state } =
    params;

  // Authenticate with Supabase
  const anonClient = createSupabaseClient("");
  const { data, error } = await anonClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    throw new Error(error?.message ?? "Authentication failed");
  }

  // Generate auth code
  const code = crypto.randomUUID();

  // Store the code with PKCE challenge and Supabase tokens
  const { error: insertError } = await supabaseAdmin
    .from("mcp_auth_codes")
    .insert({
      code,
      client_id,
      code_challenge,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      user_id: data.user.id,
      used: false,
    });

  if (insertError) {
    throw new Error(`Failed to store authorization code: ${insertError.message}`);
  }

  // Build redirect URL
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (state) {
    redirectUrl.searchParams.set("state", state);
  }

  return redirectUrl.toString();
}
